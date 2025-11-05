import { logger } from '../utils/logger';
import { PAYMENT_STATES, PAYMENT_TIMING } from '../constants/paymentConstants';
import PaymentStatusService from './PaymentStatusService';
import paymentAPI from './paymentAPI';
import moment from 'moment';
import { PaymentOrchestrator }from './PaymentOrchestratorService';

const FLOW_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_DELAY = 1000; // 1 second
const MAX_RECOVERY_ATTEMPTS = 3;

class PaymentFlowService {
  constructor() {
    this.activeFlows = new Map();
    this.statusService = PaymentStatusService;
    this.flowTimeouts = new Map();
  }

_synchronizationQueue = new Map();
  
  async ensureFlowExists(bookingId, flowId) {
    logger.info('[PaymentFlowService] Ensuring flow exists:', {
      bookingId,
      flowId,
      hasFlow: this.activeFlows.has(bookingId),
      timestamp: new Date().toISOString()
    });
  
    const existingFlow = this.activeFlows.get(bookingId);
    
    if (existingFlow) {
      if (existingFlow.id === flowId) {
        // Synchronize with orchestrator even if IDs match
        await this._synchronizeWithOrchestrator(bookingId, flowId);
        return existingFlow;
      }
      
      logger.warn('[PaymentFlowService] Flow ID mismatch:', {
        bookingId,
        existingFlowId: existingFlow.id,
        requestedFlowId: flowId,
        timestamp: new Date().toISOString()
      });
  
      // Track the transition
      this._trackFlowTransition(bookingId, existingFlow.id, flowId);
    }
  
    // Synchronize with orchestrator before creating new flow
    const synchronized = await this._synchronizeWithOrchestrator(bookingId, flowId);
    if (synchronized) {
      return this.activeFlows.get(bookingId);
    }
  
    // Create new flow if synchronization failed
    return this.initializeFlow(bookingId, flowId, {
      status: PAYMENT_STATES.INITIAL,
      resync: !!existingFlow
    });
  }

  async cleanupFlow(bookingId, reason) {
    this._cleanupSynchronization(bookingId);
    const flow = this.activeFlows.get(bookingId);
    if (!flow) return;
  
    logger.info('[PaymentFlowService] Cleaning up flow:', {
      bookingId,
      flowId: flow.id,
      reason,
      status: flow.status,
      duration: Date.now() - new Date(flow.created).getTime(),
      timestamp: new Date().toISOString()
    });
  
    // Clear any existing timeout
    if (this.flowTimeouts.has(bookingId)) {
      clearTimeout(this.flowTimeouts.get(bookingId));
      this.flowTimeouts.delete(bookingId);
    }
  
    // Add final status to history before cleanup
    flow.metadata = {
      ...flow.metadata,
      cleanupReason: reason,
      finalStatus: flow.status,
      cleanedUpAt: new Date().toISOString()
    };
  
    // Remove after short delay to allow final status propagation
    this.flowTimeouts.set(bookingId, setTimeout(() => {
      this.activeFlows.delete(bookingId);
      this.flowTimeouts.delete(bookingId);
      
      logger.debug('[PaymentFlowService] Flow cleanup completed:', {
        bookingId,
        flowId: flow.id,
        timestamp: new Date().toISOString()
      });
    }, CLEANUP_DELAY));
  }

  async initializePayment(bookingId, timing = PAYMENT_TIMING.IMMEDIATE.id, options = {}) {
    logger.info('[PaymentFlowService] Initializing payment flow:', {
      bookingId,
      timing,
      options: { ...options, sensitive: undefined },
      timestamp: new Date().toISOString()
    });
  
    if (this.activeFlows.has(bookingId)) {
      logger.warn('[PaymentFlowService] Payment flow already exists:', { bookingId });
      return this.activeFlows.get(bookingId);
    }
  
    try {
      const flow = await PaymentOrchestrator.initializePayment({
        flowId: options.flowId || bookingId,
        amount: options.amount,
        currency: options.currency,
        timing,
        metadata: { ...options }
      });
  
      this.activeFlows.set(bookingId, {
        ...flow,
        timing,
        attempts: 0,
        created: new Date().toISOString(),
        options
      });
  
      if (timing === PAYMENT_TIMING.DEFERRED.id) {
        logger.info('[PaymentFlowService] Initializing deferred payment:', {
          bookingId,
          scheduledTime: options.scheduledTime
        });
        await this.schedulePayment(bookingId, options.scheduledTime);
      }
  
      return flow;
    } catch (error) {
      logger.error('[PaymentFlowService] Initialization error:', {
        error: error.message,
        bookingId,
        stack: error.stack
      });
      throw error;
    }
  }

  async processPayment(bookingId, paymentMethodId) {
    const flow = this.activeFlows.get(bookingId);
    if (!flow) {
      logger.error('[PaymentFlowService] No active flow found:', { bookingId });
      throw new Error('No active payment flow');
    }
  
    logger.info('[PaymentFlowService] Processing payment:', {
      bookingId,
      flowId: flow.id,
      timing: flow.timing,
      attempt: flow.attempts + 1
    });
  
    try {
      this._updateFlowStatus(bookingId, PAYMENT_STATES.PROCESSING);
      
      const result = await PaymentOrchestrator.processPayment(flow.id, paymentMethodId);
      
      this._updateFlowStatus(bookingId, result.status, {
        paymentIntentId: result.paymentIntentId,
        completedAt: new Date().toISOString()
      });
  
      return result;
    } catch (error) {
      await this._handlePaymentFailure(bookingId, error);
      throw error;
    }
  }

  async schedulePayment(bookingId, scheduledTime) {
    logger.info('[PaymentFlowService] Scheduling payment:', {
      bookingId,
      scheduledTime: moment(scheduledTime).format(),
      timestamp: new Date().toISOString()
    });

    const flow = this.activeFlows.get(bookingId);
    if (!flow) {
      throw new Error('No active payment flow');
    }

    this.updateFlowStatus(bookingId, PAYMENT_STATES.SCHEDULED, {
      scheduledTime,
      scheduledAt: new Date().toISOString()
    });

    // Schedule payment processing
    const delay = moment(scheduledTime).diff(moment());
    setTimeout(() => {
      this.processScheduledPayment(bookingId);
    }, delay);
  }

  async _processScheduledPayment(bookingId) {
    logger.info('[PaymentFlowService] Processing scheduled payment:', { bookingId });
    
    const flow = this.activeFlows.get(bookingId);
    if (!flow || flow.status !== PAYMENT_STATES.SCHEDULED) {
      logger.warn('[PaymentFlowService] Cannot process scheduled payment:', {
        bookingId,
        hasFlow: !!flow,
        status: flow?.status,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      await this.processPayment(bookingId, flow.options.paymentMethodId);
    } catch (error) {
      logger.error('[PaymentFlowService] Scheduled payment failed:', {
        error: error.message,
        bookingId,
        timestamp: new Date().toISOString()
      });
      await this._handlePaymentFailure(bookingId, error);
    }
}

  _handlePaymentFailure(bookingId, error) {
    const flow = this.activeFlows.get(bookingId);
    if (!flow) return;

    flow.attempts += 1;
    logger.error('[PaymentFlowService] Payment failure:', {
      bookingId,
      flowId: flow.id,
      attempt: flow.attempts,
      error: error.message
    });

    if (flow.attempts >= 3) {
      this._updateFlowStatus(bookingId, PAYMENT_STATES.FAILED, {
        error: error.message,
        failedAt: new Date().toISOString()
      });
      return;
    }

    this._updateFlowStatus(bookingId, PAYMENT_STATES.RETRY_PENDING, {
      nextAttempt: moment().add(Math.pow(2, flow.attempts), 'minutes').toISOString(),
      error: error.message
    });
  }

  _updateFlowStatus(bookingId, status, metadata = {}) {
    const flow = this.activeFlows.get(bookingId);
    if (!flow) {
      logger.error('[PaymentFlowService] Cannot update status - no active flow:', {
        bookingId,
        status,
        timestamp: new Date().toISOString()
      });
      return;
    }
  
    const previousStatus = flow.status;
    const timestamp = new Date().toISOString();
  
    // Update flow state
    flow.status = status;
    flow.lastUpdated = timestamp;
    flow.metadata = { 
      ...flow.metadata, 
      ...metadata,
      statusHistory: [
        ...(flow.metadata?.statusHistory || []),
        { 
          from: previousStatus,
          to: status,
          timestamp,
          metadata
        }
      ].slice(-5) // Keep last 5 status changes
    };
  
    // Emit the status change
    window.dispatchEvent(new CustomEvent('payment_flow_update', {
      detail: {
        bookingId,
        flowId: flow.id,
        status,
        previousStatus,
        timestamp,
        metadata: flow.metadata
      }
    }));
  
    if (this._isTerminalState(status)) {
      logger.info('[PaymentFlowService] Flow reached terminal state:', {
        bookingId,
        flowId: flow.id,
        status,
        attempts: flow.attempts,
        timestamp
      });
      
      this.cleanupFlow(bookingId, 'completed');
    }
  }

  _isTerminalState(status) {
    return [
      PAYMENT_STATES.COMPLETED,
      PAYMENT_STATES.FAILED,
      PAYMENT_STATES.CANCELLED
    ].includes(status);
  }

  getFlowStatus(bookingId) {
    return this.activeFlows.get(bookingId) || null;
  }

  cancelFlow(bookingId) {
    logger.info('[PaymentFlowService] Cancelling payment flow:', { bookingId });
    const flow = this.activeFlows.get(bookingId);
    
    if (flow) {
      this.updateFlowStatus(bookingId, PAYMENT_STATES.CANCELLED, {
        cancelledAt: new Date().toISOString()
      });
    }
  }

}

export default new PaymentFlowService();