// src/utils/paymentLogger.js
import { logger } from './logger';

class PaymentFlowLogger {
  constructor() {
    this.activeFlows = new Map();
    this.flowTransitions = new Map();
    this.debugMode = process.env.NODE_ENV !== 'production';
    this.flowEvents = [];
    this.validatedFlows = new Set();
  }

  async validateFlowId(flowId, retries = 3) {
    if (!flowId) {
      logger.error('[PaymentLogger] Attempted to validate undefined flowId', {
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    // Check if already validated
    if (this.validatedFlows.has(flowId)) {
      return true;
    }
  
    try {
      const { PaymentOrchestrator } = await import('../services/PaymentOrchestratorService');
      
      let attempt = 0;
      while (attempt < retries) {
        try {
          const isValid = PaymentOrchestrator.isValidFlowId(flowId);
          
          if (isValid) {
            this.validatedFlows.add(flowId);
            logger.debug('[PaymentLogger] Flow ID validated:', {
              flowId,
              attempt,
              timestamp: new Date().toISOString()
            });
            return true;
          }
  
          // Add exponential backoff between retries
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
          attempt++;
        } catch (error) {
          logger.warn('[PaymentLogger] Validation attempt failed:', {
            flowId,
            attempt,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          attempt++;
        }
      }
  
      logger.warn('[PaymentLogger] Flow validation failed after retries:', {
        flowId,
        attempts: attempt,
        timestamp: new Date().toISOString()
      });
      return false;
  
    } catch (error) {
      logger.error('[PaymentLogger] Flow validation error:', {
        flowId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  async initializeFlow(flowId, metadata = {}) {
    const isValid = await this.validateFlowId(flowId);
    if (!isValid) {
      logger.error('[PaymentLogger] Attempted to initialize tracking with invalid flowId:', {
        flowId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const flowData = {
      flowId,
      startTime: Date.now(),
      states: [],
      events: [],
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };
    
    this.activeFlows.set(flowId, flowData);
    logger.info('[PaymentLogger] Starting flow tracking:', {
      flowId,
      metadata,
      timestamp: new Date().toISOString()
    });
  }

  async logFlowEvent(flowId, eventType, metadata = {}) {
    const isValid = await this.validateFlowId(flowId);
    if (!isValid) {
      logger.warn('[PaymentLogger] Attempted to log event with invalid flowId:', {
        flowId,
        eventType,
        timestamp: new Date().toISOString()
      });
      return;
    }

    logger.info(`[PaymentLogger][${eventType}]`, {
      flowId,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  trackComponentMount(flowId, componentName, metadata = {}) {
    logger.info('[PaymentLogger]  Component mounted:', {
      flowId,
      component: componentName,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  trackComponentUnmount(flowId, componentName, metadata = {}) {
    logger.info('[PaymentLogger]  Component unmounted:', {
      flowId,
      component: componentName,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  trackStateTransition(flowId, fromState, toState, metadata = {}) {
    logger.info('[PaymentLogger]  State transition:', {
      flowId,
      fromState,
      toState,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }

  trackSocketEvent(flowId, eventType, metadata = {}) {
    logger.info('[PaymentLogger]  Socket event:', {
      flowId,
      eventType,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
  
  endFlow(flowId, reason = 'completed', metadata = {}) {
    logger.info('[PaymentLogger]  Flow ended:', {
      flowId,
      reason,
      ...metadata,
      timestamp: new Date().toISOString()
    });
    this.activeFlows.delete(flowId);
  }

  // Alias for endFlow to match the PaymentOrchestrator usage
  completeFlow(flowId, status, metadata = {}) {
    this.endFlow(flowId, 'completed', { status, ...metadata });
  }
}

export const paymentLogger = new PaymentFlowLogger();