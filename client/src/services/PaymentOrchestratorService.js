import { logger } from '../utils/logger';
import { paymentLogger } from '../utils/paymentLogger';
import { v4 as uuidv4 } from 'uuid';
import { PAYMENT_STATES, PAYMENT_TIMING, VISIBILITY_STATES } from '../constants/paymentConstants';
import PaymentSocketService from './PaymentSocketService';
import PaymentStatusServiceInstance from './PaymentStatusService';
import PaymentFlowService from './PaymentFlowService';
import paymentAPI from './paymentAPI';
import { LIFECYCLE_TIMEOUTS } from '../constants/paymentSocketConstants';

const ORCHESTRATOR_INIT_TIMEOUT = 5000;
const PAYMENT_LOCKS = new Map(); // Track payment operation locks
const LOCK_TIMEOUT = 5000; // 5 seconds max lock duration

const FLOW_PRESERVATION = {
  TIMEOUT: 300000, // 5 minutes
  TRANSITION_WINDOW: 5000, // 5 seconds for ID transitions
};

const FLOW_TRANSITION_STATES = {
  PRE_BOOKING: 'pre_booking',
  TRANSITIONING: 'transitioning',
  POST_BOOKING: 'post_booking',
};

const FLOW_ID_PATTERNS = {
  PRE_BOOKING: /^pre-[a-z0-9-]+$/,
  POST_BOOKING: /^[a-f0-9]{24}-\d+$/
};

const INSTANCE_DEBUG = {
  counter: 0,
  instances: new Set(),
  lastInitTime: null
};

const FLOW_STATUS = {
  INITIALIZING: 'initializing',
  ACTIVE: 'active',
  TRANSITIONING: 'transitioning',
  PRESERVED: 'preserved'
};

const FLOW_TYPE = {
  PRE_BOOKING: 'pre-booking',
  POST_BOOKING: 'post-booking'
};

const FLOW_LIFECYCLE = {
  INIT: 'initialization',
  SOCKET_CONNECTING: 'socket_connecting',
  PAYMENT_CREATING: 'payment_creating',
  READY: 'ready',
  ERROR: 'error'
};

const LIFECYCLE_STATES = {
  MOUNTING: 'mounting',
  MOUNTED: 'mounted',
  UPDATING: 'updating',
  UNMOUNTING: 'unmounting',
  ERROR: 'error'
};

const LIFECYCLE_TO_FLOW = {
  [LIFECYCLE_STATES.MOUNTING]: FLOW_LIFECYCLE.INIT,
  [LIFECYCLE_STATES.UPDATING]: FLOW_LIFECYCLE.PAYMENT_CREATING,
  [LIFECYCLE_STATES.UNMOUNTING]: null 
};

const PROTECTED_STATES = new Set([

  FLOW_LIFECYCLE.INIT,
  FLOW_LIFECYCLE.SOCKET_CONNECTING,
  FLOW_LIFECYCLE.PAYMENT_CREATING,
  'initializing',
  'mounting',
  'payment_pending',
  'payment_processing'
]);

const createFlowEntry = (flowId, type, options = {}) => ({
  id: flowId,
  status: FLOW_STATUS.INITIALIZING,
  type: type,
  bookingId: options.bookingId || null,
  metadata: {
      confirmationId: options.confirmationId || null,
      originalFlowId: options.originalFlowId || null,
      transitionTarget: options.transitionTarget || null,
      amount: options.amount,
      currency: options.currency
  },
  timestamps: {
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
  }
});

const acquireLock = (bookingId, operationType) => {
  const lockKey = `${bookingId}-${operationType}`;
  const now = Date.now();

  // Clear expired locks
  PAYMENT_LOCKS.forEach((timestamp, key) => {
    if (now - timestamp > LOCK_TIMEOUT) {
      PAYMENT_LOCKS.delete(key);
    }
  });

  if (PAYMENT_LOCKS.has(lockKey)) {
    return false;
  }

  PAYMENT_LOCKS.set(lockKey, now);
  return true;
};

const releaseLock = (bookingId, operationType) => {
  const lockKey = `${bookingId}-${operationType}`;
  PAYMENT_LOCKS.delete(lockKey);
};

class FlowStateManager {
  constructor() {
    this._flows = new Map();
    this._activeIds = new Map();
    this._transitions = new Map();
    this._locks = new Map();
    this._flowState = new Map();
  }

  setState(flowId, state, metadata = {}) {
    logger.info('[FlowStateManager] Setting flow state:', {
      flowId,
      state,
      existingState: this._flowState.get(flowId),
      timestamp: new Date().toISOString()
    });

    const currentState = this._flowState.get(flowId) || {};
    const newState = {
      ...currentState,
      ...state,
      lastUpdated: new Date().toISOString(),
      metadata: {
        ...currentState.metadata,
        ...metadata
      }
    };

    this._flowState.set(flowId, newState);
    return newState;
  }

  getState(flowId) {
    return this._flowState.get(flowId);
  }

  getFullFlowData(flowId) {
    const flow = this._flows.get(flowId);
    const state = this._flowState.get(flowId);

    if (!flow) return null;

    return {
      ...flow,
      state: state || {},
      transitions: this._transitions.get(flowId) || []
    };
  }

  track(flowId, data) {
    const flowState = {
      ...data,
      transitions: [],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    this._flows.set(flowId, flowState);
    if (data.bookingId) {
      this._activeIds.set(data.bookingId, flowId);
    }
  }

  transition(flowId, fromState, toState, metadata = {}) {
    const flow = this._flows.get(flowId);
    if (!flow) return false;

    const transition = {
      from: fromState,
      to: toState,
      timestamp: new Date().toISOString(),
      metadata
    };

    flow.transitions.push(transition);
    flow.status = toState;
    flow.lastUpdated = new Date().toISOString();

    logger.info('[PaymentOrchestrator] Flow transition:', {
      flowId,
      fromState,
      toState,
      metadata,
      timestamp: new Date().toISOString()
    });

    return true;
  }

  getFlow(flowId) {
    return this._flows.get(flowId);
  }

  getActiveFlow(bookingId) {
    const flowId = this._activeIds.get(bookingId);
    return flowId ? this._flows.get(flowId) : null;
  }

  cleanup(flowId, reason = 'manual') {
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    // Check protected state
    if (this._isProtectedState(flowId)) {
      logger.info('[PaymentOrchestrator] Blocking cleanup of protected flow:', {
        flowId,
        lifecycle: this._flowLifecycles.get(flowId),
        reason,
        timestamp: new Date().toISOString()
      });
      return;
    }
  
    logger.info('[PaymentOrchestrator] Starting flow cleanup:', {
      flowId,
      bookingId: flow.bookingId,
      reason,
      timestamp: new Date().toISOString()
    });
  
    // Clean up state in status service
    this.statusService.cleanup(flow.bookingId, flowId);
  
    // Clean up flow ID mappings
    if (flow.bookingId) {
      this._activeFlowIds.delete(flow.bookingId);
    }
  
    this.flows.delete(flowId);
  }
}

class PaymentOrchestratorService {
  
_cleanupAttempts = new Map();
_maxCleanupAttempts = 3;
_cleanupTimeout = 5000; // 5 seconds
_cleanupRegistry = new Map();
_cleanupInProgress = new Map();

constructor() {
  const debugId = `orch_${++INSTANCE_DEBUG.counter}`;
    
    
  
    if (PaymentOrchestratorService.instance) {
      logger.info('[PaymentOrchestrator] Returning existing instance:', {
        debugId,
        existingId: PaymentOrchestratorService.instance._debugId,
        existingFlows: PaymentOrchestratorService.instance.flows?.size || 0,
        timestamp: new Date().toISOString()
      });
      return PaymentOrchestratorService.instance;
    }
  
this._debugId = debugId;
  this.flows = new Map();
  this._activeFlowIds = new Map();
  this._confirmationMappings = new Map();
  this._pendingInitializations = new Map();
  this._flowInitializationLocks = new Map();
  this._flowMappings = new Map();
  this._transitioningFlows = new Map();
  this._flowLifecycles = new Map();
  this.preservedFlows = new Map();
  this.statusSubscriptions = new Map();
  this._cleanupAttempts = new Map();
  this._cleanupRegistry = new Map();
  this._cleanupInProgress = new Map();
  this.cleanupTimeouts = new Map();

  this.stateManager = new FlowStateManager();
  this.socketManager = PaymentSocketService;
  this.statusService = PaymentStatusServiceInstance;

  this._maxCleanupAttempts = 3;
  this._cleanupTimeout = 5000;
  this.initialized = false;

  INSTANCE_DEBUG.instances.add(this._debugId);
  INSTANCE_DEBUG.lastInitTime = new Date().toISOString();

  PaymentOrchestratorService.instance = this;

  /*logger.info('[PaymentOrchestrator] Constructor entry:', {
    debugId,
    hasStatusService: !!this.statusService,
    totalInstances: INSTANCE_DEBUG.counter,
    timestamp: new Date().toISOString()
  });*/

  
  
  setInterval(() => this._checkFlowSync(), 5000);

  // Clean up pending initializations periodically
  setInterval(() => {
    const now = Date.now();
    for (const [bookingId, promise] of this._pendingInitializations.entries()) {
      if (now - promise.timestamp > 30000) {
        logger.warn('[PaymentOrchestrator] Cleaning up stale initialization:', {
          bookingId,
          instanceId: this._debugId,
          timestamp: new Date().toISOString()
        });
        this._pendingInitializations.delete(bookingId);
      }
    }
  }, 30000);
}

publishState(flowId, state) {
  logger.info('[PaymentOrchestrator] Publishing state manually:', { flowId, state });
  this.statusService.stateSubscriptions.publish(flowId, state);}


_isProtectedState(flowId) {
  const flow = this.flows.get(flowId);
  if (!flow) return false;

  const isProtected = PROTECTED_STATES.has(flow.status);

  logger.info('[PaymentOrchestrator] Checking flow protection:', {
    flowId,
    status: flow.status,
    isProtected,
    timestamp: new Date().toISOString()
  });

  return isProtected;
}

_registerCleanup(flowId, metadata = {}) {
  const cleanupId = `cleanup-${flowId}-${Date.now()}`;
  
  logger.info('[PaymentOrchestrator] Registering cleanup:', {
    flowId,
    cleanupId,
    existingCleanups: Array.from(this._cleanupRegistry.keys()),
    metadata,
    timestamp: new Date().toISOString()
  });

  this._cleanupRegistry.set(cleanupId, {
    flowId,
    startedAt: new Date().toISOString(),
    metadata,
    status: 'registered'
  });

  return cleanupId;
}

async _executeCleanup(cleanupId) {
  const cleanup = this._cleanupRegistry.get(cleanupId);
  if (!cleanup) return false;

  const { flowId } = cleanup;
  if (this._cleanupInProgress.has(flowId)) {
    logger.info('[PaymentOrchestrator] Cleanup already in progress:', {
      flowId,
      cleanupId,
      timestamp: new Date().toISOString()
    });
    return false;
  }

  this._cleanupInProgress.set(flowId, cleanupId);

  try {
    const flow = this.flows.get(flowId);
    if (!flow) {
      logger.info('[PaymentOrchestrator] No flow to cleanup:', {
        flowId,
        cleanupId,
        timestamp: new Date().toISOString()
      });
      return true;
    }

    logger.info('[PaymentOrchestrator] Executing cleanup:', {
      flowId,
      cleanupId,
      flowStatus: flow.status,
      timestamp: new Date().toISOString()
    });

    cleanup.status = 'in_progress';
    this._cleanupRegistry.set(cleanupId, cleanup);

    // Clean up in status service first
    if (flow.bookingId) {
      await this.statusService.cleanup(flow.bookingId);
    }

    // Remove from active flows
    this._activeFlowIds.delete(flow.bookingId);

    // Remove flow
    this.flows.delete(flowId);

    cleanup.status = 'completed';
    this._cleanupRegistry.set(cleanupId, cleanup);

    logger.info('[PaymentOrchestrator] Cleanup completed:', {
      flowId,
      cleanupId,
      timestamp: new Date().toISOString()
    });

    return true;
  } catch (error) {
    logger.error('[PaymentOrchestrator] Cleanup execution failed:', {
      flowId,
      cleanupId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    cleanup.status = 'failed';
    cleanup.error = error.message;
    this._cleanupRegistry.set(cleanupId, cleanup);

    return false;
  } finally {
    this._cleanupInProgress.delete(flowId);
    
    // Schedule registry cleanup
    setTimeout(() => {
      this._cleanupRegistry.delete(cleanupId);
    }, 60000);
  }
}

isCleanupAllowed(flowId, source) {
  logger.info('[PaymentOrchestrator] Checking cleanup permission:', {
    flowId,
    source,
    currentState: this.flows.get(flowId)?.status,
    timestamp: new Date().toISOString()
  });

  const flow = this.flows.get(flowId);
  if (!flow) return true;

  if (this._isProtectedState(flowId)) {
    logger.info('[PaymentOrchestrator] Blocking cleanup - protected state:', {
      flowId,
      state: flow.status,
      timestamp: new Date().toISOString()
    });
    return false;
  }

  return true;
}

async handleCleanup(flowId, options = {}) {
  const { source, reason, preserveState = false, force = false, metadata = {} } = options;
  const cleanupId = this._registerCleanup(flowId, { source, reason, preserveState, force, metadata });

  logger.info('[PaymentOrchestrator] Handling cleanup request:', {
    flowId,
    cleanupId,
    source,
    reason,
    preserveState,
    force,
    timestamp: new Date().toISOString()
  });

  if (!force && !this.isCleanupAllowed(flowId, source)) {
    logger.info('[PaymentOrchestrator] Cleanup blocked:', {
      flowId,
      cleanupId,
      source,
      currentState: this.flows.get(flowId)?.status,
      timestamp: new Date().toISOString()
    });
    return false;
  }

  try {
    if (preserveState) {
      await this.statusService.preserveState(flowId, { reason, source, cleanupId, timestamp: new Date().toISOString() });
    }

    logger.info('[PaymentOrchestrator] Publishing cleanup state update:', {
      flowId,
      cleanupId,
      currentState: this.flows.get(flowId)?.status,
      timestamp: new Date().toISOString()
    });
    await this.statusService._publishStateUpdate(flowId, {
      type: 'cleanup_initiated',
      cleanupId,
      source,
      reason,
      timestamp: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const cleanupResult = await this._executeCleanup(cleanupId);
    logger.info('[PaymentOrchestrator] Cleanup completed:', {
      flowId,
      cleanupId,
      result: cleanupResult,
      finalState: this.flows.get(flowId)?.status,
      timestamp: new Date().toISOString()
    });
    return cleanupResult;
  } catch (error) {
    logger.error('[PaymentOrchestrator] Cleanup failed:', {
      flowId,
      cleanupId,
      source,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}


_trackCleanupAttempt(flowId, source) {
  const key = `${flowId}:${source}`;
  const attempts = this._cleanupAttempts.get(key) || [];
  
  // Clean old attempts (older than cleanup timeout)
  const now = Date.now();
  const validAttempts = attempts.filter(
    attempt => (now - attempt.timestamp) < this._cleanupTimeout
  );
  
  logger.info('[PaymentOrchestrator] Tracking cleanup attempt:', {
    flowId,
    source,
    attemptCount: validAttempts.length + 1,
    timestamp: new Date().toISOString()
  });

  validAttempts.push({
    timestamp: now,
    source
  });

  this._cleanupAttempts.set(key, validAttempts);
  return validAttempts.length;
}

_canAttemptCleanup(flowId, source) {
  const attempts = this._trackCleanupAttempt(flowId, source);
  const canAttempt = attempts <= this._maxCleanupAttempts;

  if (!canAttempt) {
    logger.warn('[PaymentOrchestrator] Max cleanup attempts reached:', {
      flowId,
      source,
      attempts,
      timestamp: new Date().toISOString()
    });
  }

  return canAttempt;
}

_extractTimestamp(id) {
  const matches = id.match(/\d{13}/g);
  return matches ? matches[0] : null;
}


initializeSocketHandlers() {
  if (this.socketManager) {
    

    this.socketManager.subscribeToPayment('payment_status_update', ({ flowId, status }) => {
      const flow = this.flows.get(flowId);
      if (flow) {
        logger.info('[PaymentOrchestrator] Received socket status update:', {
          flowId,
          status,
          hasFlow: true,
          timestamp: new Date().toISOString()
        });

        // Delegate state update to status service
        this.statusService._atomicStateUpdate(flowId, {
          status,
          bookingId: flow.bookingId,
          metadata: {
            source: 'socket',
            updatedAt: new Date().toISOString(),
            lifecycle: this._flowLifecycles.get(flowId)
          },
          version: (flow.version || 0) + 1
        }).catch(error => {
          logger.error('[PaymentOrchestrator] Socket state update failed:', {
            flowId,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
      }
    });

    this.socketManager.subscribeToPayment('payment_error', ({ flowId, error }) => {
      const flow = this.flows.get(flowId);
      if (flow) {
        logger.info('[PaymentOrchestrator] Received socket error:', {
          flowId,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        this.statusService._atomicStateUpdate(flowId, {
          status: 'error',
          error: error,
          bookingId: flow.bookingId,
          metadata: {
            source: 'socket_error',
            errorTimestamp: new Date().toISOString()
          },
          version: (flow.version || 0) + 1
        }).catch(updateError => {
          logger.error('[PaymentOrchestrator] Error state update failed:', {
            flowId,
            error: updateError.message,
            timestamp: new Date().toISOString()
          });
        });
      }
    });
  }
}

_trackFlowState(flowId, state, metadata = {}) {
  logger.info('[PaymentOrchestrator] Delegating flow state tracking:', {
    flowId,
    state,
    metadata,
    timestamp: new Date().toISOString(),
  });

  // Ensure modalState and paymentStep are preserved in metadata
  const currentFlow = this.flows.get(flowId);
  const updatedMetadata = {
    ...currentFlow?.metadata,
    ...metadata,
    modalState: metadata.modalState || currentFlow?.metadata?.modalState || 'booking',
    paymentStep: metadata.paymentStep || currentFlow?.metadata?.paymentStep || 'session',
    source: 'orchestrator',
    trackedAt: new Date().toISOString(),
  };

  return this.statusService._atomicStateUpdate(flowId, {
    status: state,
    metadata: updatedMetadata,
  });
}

  async validateLifecycleTransition(flowId, fromState, toState, metadata = {}) {
   
  
    const currentFlow = this.flows.get(flowId);
    if (!currentFlow) return true; // Allow if no flow exists
  
    const mappedState = LIFECYCLE_TO_FLOW[toState];
    
    // Allow initial mount during any state if it's part of restoration
    if (toState === LIFECYCLE_STATES.MOUNTING && 
        (metadata.restoration || currentFlow.status === 'initializing')) {
      logger.info('[PaymentOrchestrator] Allowing protected mount:', {
        flowId,
        status: currentFlow.status,
        metadata,
        isRestoration: !!metadata.restoration,
        timestamp: new Date().toISOString()
      });
      return true;
    }
  
    // Prevent unmounting during protected states
    if (toState === LIFECYCLE_STATES.UNMOUNTING && 
        this._isProtectedState(flowId)) {
      logger.warn('[PaymentOrchestrator] Blocking unmount during protected state:', {
        flowId,
        currentState: currentFlow.status,
        lifecycle: this._flowLifecycles.get(flowId)?.lifecycle,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    const isProtected = mappedState && PROTECTED_STATES.has(mappedState);
  
    logger.info('[PaymentOrchestrator] Lifecycle protection check:', {
      flowId,
      mappedState,
      isProtected,
      currentFlowState: currentFlow.status,
      flowMetadata: currentFlow.metadata,
      timestamp: new Date().toISOString()
    });
  
    return !isProtected;
  }

  async guardComponentMount(flowId, metadata = {}) {
    logger.info('[PaymentOrchestrator] Guarding component mount:', {
      flowId,
      existingState: this.flows.get(flowId)?.status,
      metadata,
      timestamp: new Date().toISOString()
    });
  
    const acquired = await this.statusService.lockManager.acquireLifecycleLock(
      flowId, 
      LIFECYCLE_STATES.MOUNTING
    );
  
    if (!acquired) {
      logger.error('[PaymentOrchestrator] Mount guard failed - could not acquire lock:', {
        flowId,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    try {
      const flow = this.flows.get(flowId);
      if (!flow) {
        throw new Error('Flow not found during mount guard');
      }
  
      // Check for preserved state
      const preservedState = await this.statusService.getPaymentState(flowId);
      if (preservedState) {
        logger.info('[PaymentOrchestrator] Restoring preserved state during mount:', {
          flowId,
          preservedState: {
            status: preservedState.status,
            version: preservedState.version
          },
          timestamp: new Date().toISOString()
        });
      }
  
      // Track mount state
      await this.statusService.trackFlowState(flowId, LIFECYCLE_STATES.MOUNTING, {
        ...metadata,
        mountTimestamp: new Date().toISOString()
      });
  
      return true;
    } catch (error) {
      logger.error('[PaymentOrchestrator] Mount guard error:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    } finally {
      this.statusService.lockManager.releaseLifecycleLock(flowId, LIFECYCLE_STATES.MOUNTING);
    }
  }

  async guardComponentLifecycle(flowId, lifecycle, metadata = {}) {
    logger.info('[PaymentOrchestrator] Guarding component lifecycle:', {
      flowId,
      lifecycle,
      currentState: this._flowLifecycles.get(flowId)?.lifecycle,
      timestamp: new Date().toISOString()
    });
  
    // First validate transition before acquiring lock
    const isValid = await this.validateLifecycleTransition(
      flowId,
      this._flowLifecycles.get(flowId)?.lifecycle,
      lifecycle,
      metadata
    );
  
    if (!isValid) {
      logger.warn('[PaymentOrchestrator] Invalid lifecycle transition blocked:', {
        flowId,
        from: this._flowLifecycles.get(flowId)?.lifecycle,
        to: lifecycle,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    // Only acquire lock if transition is valid
    const lockKey = `lifecycle:${flowId}`;
    if (!await this.statusService.lockManager.acquire(lockKey)) {
      // If we can't acquire lock but it's an initialization state, allow it
      const flow = this.flows.get(flowId);
      if (flow?.status === 'initializing' && lifecycle === LIFECYCLE_STATES.MOUNTING) {
        logger.info('[PaymentOrchestrator] Allowing concurrent initialization:', {
          flowId,
          lifecycle,
          status: flow.status,
          timestamp: new Date().toISOString()
        });
        return true;
      }
  
      logger.warn('[PaymentOrchestrator] Lifecycle guard blocked - operation in progress:', {
        flowId,
        lifecycle,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    try {
      const flow = this.flows.get(flowId);
      if (!flow) {
        // Special handling for initialization
        if (lifecycle === LIFECYCLE_STATES.MOUNTING && metadata.initialization) {
          logger.info('[PaymentOrchestrator] Allowing initialization lifecycle:', {
            flowId,
            metadata,
            timestamp: new Date().toISOString()
          });
          return true;
        }
        throw new Error('Flow not found for lifecycle guard');
      }
  
      // Track lifecycle state
      this._flowLifecycles.set(flowId, {
        lifecycle,
        timestamp: new Date().toISOString(),
        metadata: {
          ...this._flowLifecycles.get(flowId)?.metadata,
          ...metadata
        }
      });
  
      // Ensure state service synchronization
      await this.statusService.trackFlowState(flowId, lifecycle, {
        type: 'lifecycle_change',
        previousState: this._flowLifecycles.get(flowId)?.lifecycle,
        ...metadata
      });
  
      return true;
    } catch (error) {
      logger.error('[PaymentOrchestrator] Lifecycle guard failed:', {
        flowId,
        lifecycle,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    } finally {
      this.statusService.lockManager.release(lockKey);
    }
  }

  // Add new method for atomic state updates
  async _atomicStateUpdate(flowId, newState, operation) {
    const lockKey = `state:${flowId}`;
    
    if (!await this.statusService.lockManager.acquire(lockKey)) {
      throw new Error('State update in progress');
    }

    try {
      const result = await operation();
      this._trackFlowState(flowId, newState);
      return result;
    } finally {
      this.statusService.lockManager.release(lockKey);
    }
  }

  _acquireLockWithTracking(bookingId, operationType) {
    logger.info('[PaymentOrchestrator] Lock acquisition attempt:', {
      bookingId,
      operationType,
      existingLocks: Array.from(PAYMENT_LOCKS.entries()),
      timestamp: new Date().toISOString()
    });
  
    const lockKey = `${bookingId}-${operationType}`;
    const acquired = acquireLock(bookingId, operationType);
    
    logger.info('[PaymentOrchestrator] Lock acquisition result:', {
      bookingId,
      operationType,
      acquired,
      lockKey,
      timestamp: new Date().toISOString()
    });
  
    return acquired;
  }

  releaseLock(bookingId, operationType) {
    logger.info('[PaymentOrchestrator] Releasing lock:', {
      bookingId,
      operationType,
      timestamp: new Date().toISOString()
    });

    const lockKey = `${bookingId}-${operationType}`;
    PAYMENT_LOCKS.delete(lockKey);

    logger.info('[PaymentOrchestrator] Lock released:', {
      bookingId,
      operationType,
      lockKey,
      remainingLocks: Array.from(PAYMENT_LOCKS.keys()),
      timestamp: new Date().toISOString()
    });
  }

  _findFlow(identifiers) {
    const { flowId, bookingId, confirmationId } = identifiers;

   

    // Direct flow lookup
    if (flowId && this.flows.has(flowId)) {
        logger.info('[PaymentOrchestrator] Found flow by direct ID:', {
            flowId,
            flow: this.flows.get(flowId),
            timestamp: new Date().toISOString()
        });
        return {
            flow: this.flows.get(flowId),
            source: 'direct',
            id: flowId
        };
    }

    // Check confirmation mappings first as they handle pre->post transition
    if (confirmationId) {
        const confirmationMappings = Array.from(this._confirmationMappings.entries())
            .filter(([key, mapping]) => 
                key === confirmationId || 
                mapping.flowId?.includes(confirmationId) ||
                mapping.originalFlowId?.includes(confirmationId));

        logger.info('[PaymentOrchestrator] Confirmation mapping check:', {
            confirmationId,
            mappingsFound: confirmationMappings.length,
            mappings: confirmationMappings,
            timestamp: new Date().toISOString()
        });

        for (const [_, mapping] of confirmationMappings) {
            const mappedFlow = this.flows.get(mapping.flowId);
            if (mappedFlow) {
                return {
                    flow: mappedFlow,
                    source: 'confirmation_mapping',
                    id: mapping.flowId
                };
            }
        }
    }

    // Look for flows in transition state
    if (bookingId) {
        // Check preserved flows first
        const preservedFlow = Array.from(this.preservedFlows.values())
            .find(flow => 
                flow.bookingId === bookingId || 
                flow.metadata?.originalBookingId === bookingId ||
                (flow.metadata?.confirmationId === confirmationId));

        if (preservedFlow) {
            logger.info('[PaymentOrchestrator] Found preserved flow:', {
                bookingId,
                preservedFlow,
                timestamp: new Date().toISOString()
            });
            return {
                flow: preservedFlow,
                source: 'preserved',
                id: preservedFlow.id
            };
        }

        // Check active flows with pattern matching
        const potentialFlows = Array.from(this.flows.entries())
            .filter(([key, flow]) => {
                const matchesBooking = flow.bookingId === bookingId;
                const matchesConfirmation = flow.metadata?.confirmationId === confirmationId;
                const isPreConfirmation = flow.metadata?.isPreBooking && 
                confirmationId?.includes(key.split('-')[2]);
                
                return matchesBooking || matchesConfirmation || isPreConfirmation;
            });

       

        if (potentialFlows.length > 0) {
            const [matchedKey, matchedFlow] = potentialFlows[0];
            return {
                flow: matchedFlow,
                source: 'pattern_match',
                id: matchedKey
            };
        }
    }

    logger.warn('[PaymentOrchestrator] No matching flow found:', {
        identifiers,
        searchState: {
            activeFlowCount: this.flows.size,
            preservedFlowCount: this.preservedFlows.size,
            confirmationMappings: this._confirmationMappings.size
        },
        timestamp: new Date().toISOString()
    });

    return null;
}

// Add this helper method for cleanup
_cleanupTransitionState(oldFlowId, newFlowId, transitionLockKey) {
  logger.info('[PaymentOrchestrator] Starting transition state cleanup:', {
      oldFlowId,
      newFlowId,
      timestamp: new Date().toISOString()
  });

  this._flowInitializationLocks.delete(transitionLockKey);
  
  if (this._transitioningFlows.has(oldFlowId)) {
      const transitionState = this._transitioningFlows.get(oldFlowId);
      
      // Only clean up if the transition was successful
      if (this.flows.has(newFlowId)) {
          this._transitioningFlows.delete(oldFlowId);
          
          // Keep mapping and preserved state for recovery
          logger.info('[PaymentOrchestrator] Preserving successful transition state:', {
              oldFlowId,
              newFlowId,
              timestamp: new Date().toISOString()
          });
      } else {
          logger.warn('[PaymentOrchestrator] Transition cleanup blocked - target flow missing:', {
              oldFlowId,
              newFlowId,
              timestamp: new Date().toISOString()
          });
      }
  }
}


  async _handleFlowTransition(oldId, oldFlowId, newFlowId, bookingId, metadata = {}) {
    const preBookingFlowId = this.flows.get(oldId)?.id || oldId;
  
   

    const flow = this.flows.get(preBookingFlowId);
    if (!flow) {
      logger.error('[PaymentOrchestrator] Pre-booking flow not found:', {
        oldId,
        preBookingFlowId,
        newFlowId,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    try {
      // Create snapshot of pre-booking state
      await this.statusService.preserveState(flow.id, {
        reason: 'pre_transition',
        metadata: {
          transitionTarget: newFlowId,
          ...metadata
        }
      });
  
      // Transition state using the found flow ID
      const stateTransitioned = await this.statusService._atomicStateTransition(
        flow.id,
        newFlowId,
        flow,
        {
          ...metadata,
          transitionType: 'booking_created',
          preserveHistory: true,
          originalFlowId: flow.id,
          transitionTimestamp: new Date().toISOString()
        }
      );
  
      if (!stateTransitioned) {
        // Don't throw, return false to indicate failure
        logger.warn('[PaymentOrchestrator] State transition returned false:', {
          flowId: flow.id,
          newFlowId,
          timestamp: new Date().toISOString()
        });
        return false;
      }
  
      return true;
    } catch (error) {
      logger.error('[PaymentOrchestrator] Flow transition failed:', {
        oldId,
        flowId: flow.id,
        newFlowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
  
      // Attempt recovery
      try {
        await this.statusService._attemptStateRecovery(preBookingFlowId);
      } catch (recoveryError) {
        logger.error('[PaymentOrchestrator] Recovery also failed:', {
          error: recoveryError.message,
          timestamp: new Date().toISOString()
        });
      }
  
      return false;
    }
  }

_trackConfirmationMapping(confirmationId, flowData) {
    if (!this._confirmationMappings.has(confirmationId)) {
        this._confirmationMappings.set(confirmationId, new Map());
    }
    
    const mapping = this._confirmationMappings.get(confirmationId);
    mapping.set(flowData.id, {
        flowId: flowData.id,
        bookingId: flowData.bookingId,
        timestamp: new Date().toISOString(),
        state: flowData.state
    });
}

_ensureRequiredMaps() {
  if (!this.flows) this.flows = new Map();
  if (!this._flowLifecycles) this._flowLifecycles = new Map();
  if (!this._activeFlowIds) this._activeFlowIds = new Map();
  if (!this._transitioningFlows) this._transitioningFlows = new Map();
  if (!this.preservedFlows) this.preservedFlows = new Map();
}

async ensureFlowStateSynchronization(flowId, bookingId = null, options = {}) {
  const targetId = bookingId || flowId;
  
  logger.info('[PaymentOrchestrator] Ensuring flow state synchronization:', {
    flowId,
    bookingId,
    targetId,
    optionsMetadata: options.metadata,
    timestamp: new Date().toISOString()
  });
  
  try {
    // 1. Verify and fix mappings
    if (bookingId && bookingId !== flowId) {
      if (!this._activeFlowIds.has(bookingId)) {
        logger.info('[PaymentOrchestrator] Creating missing flow-to-booking mapping:', {
          flowId,
          bookingId,
          currentMappings: Array.from(this._activeFlowIds.entries()),
          timestamp: new Date().toISOString()
        });
        
        this._activeFlowIds.set(bookingId, flowId);
      }
      
      // Also ensure reverse mapping
      if (!this._activeFlowIds.has(flowId)) {
        this._activeFlowIds.set(flowId, flowId);
      }
    }
    
    // 2. Check if flow exists in PaymentOrchestrator
    let flow = this.flows.get(flowId);
    if (!flow) {
      if (options.createIfMissing) {
        logger.info('[PaymentOrchestrator] Creating missing flow:', {
          flowId,
          bookingId,
          timestamp: new Date().toISOString()
        });
        
        // Create placeholder flow
        flow = {
          id: flowId,
          bookingId: bookingId || flowId,
          status: options.initialState || 'initializing',
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          metadata: { ...options.metadata, recovery: true }
        };
        this.flows.set(flowId, flow);
      } else {
        logger.warn('[PaymentOrchestrator] Flow not found during synchronization:', {
          flowId,
          bookingId,
          timestamp: new Date().toISOString()
        });
        return null;
      }
    } else if (options.metadata) {
      // If flow exists and new metadata is provided, merge it
      flow.metadata = { ...flow.metadata, ...options.metadata };
      flow.lastUpdated = new Date().toISOString();
      this.flows.set(flowId, flow);
      logger.info('[PaymentOrchestrator] Merged new metadata into existing flow:', {
        flowId,
        mergedKeys: Object.keys(options.metadata),
        timestamp: new Date().toISOString()
      });
    }
    
    // 3. Check for status service state
    const statusState = await this.statusService.getPaymentState(targetId);
    if (!statusState && options.createIfMissing) {
      logger.info('[PaymentOrchestrator] Creating missing status state:', {
        targetId,
        flowId,
        timestamp: new Date().toISOString()
      });
      
      await this.statusService.initializeFlowState(targetId, {
        status: options.initialState || 'initializing',
        metadata: { ...options.metadata, recovery: true }
      });
    }
    
    // 4. Perform reconciliation between PaymentOrchestrator and StatusService
    const orchestratorState = this.flows.get(flowId);
    const statusServiceState = await this.statusService.getPaymentState(targetId);
    
    if (orchestratorState && statusServiceState) {
      // Ensure consistent state - use the more recent state
      const useStatusState = 
        !orchestratorState.lastUpdated || 
        (statusServiceState.lastUpdated && 
         new Date(statusServiceState.lastUpdated) > new Date(orchestratorState.lastUpdated));
      
      if (useStatusState) {
        logger.info('[PaymentOrchestrator] Updating orchestrator state from status service:', {
          flowId,
          targetId,
          fromStatus: orchestratorState.status,
          toStatus: statusServiceState.status,
          timestamp: new Date().toISOString()
        });
        
        this.flows.set(flowId, {
          ...orchestratorState,
          status: statusServiceState.status,
          lastUpdated: new Date().toISOString(),
          metadata: {
            ...orchestratorState.metadata,
            ...statusServiceState.metadata,
            synchronized: true
          }
        });
      } else {
        logger.info('[PaymentOrchestrator] Updating status service from orchestrator:', {
          flowId,
          targetId,
          fromStatus: statusServiceState.status,
          toStatus: orchestratorState.status,
          timestamp: new Date().toISOString()
        });
        
        await this.statusService.updateFlowState(targetId, {
          status: orchestratorState.status,
          metadata: {
            ...statusServiceState.metadata,
            ...orchestratorState.metadata,
            synchronized: true
          }
        });
      }
    }
    
    logger.info('[PaymentOrchestrator] Flow state synchronization completed:', {
      flowId,
      bookingId,
      status: this.flows.get(flowId)?.status,
      timestamp: new Date().toISOString()
    });
    
    return this.flows.get(flowId);
  } catch (error) {
    logger.error('[PaymentOrchestrator] Flow state synchronization failed:', {
      flowId,
      bookingId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return null;
  }
}

async updateFlow(flowId, updates) {
  logger.info('[PaymentOrchestrator] Starting flow update', {
    flowId,
    updateType: updates?.metadata?.updateType,
    updateKeys: Object.keys(updates || {}),
    inputFlowId: flowId,
    inputUpdates: updates,
    flowsState: {
      totalFlows: this.flows.size,
      hasFlowId: this.flows.has(flowId),
      flowKeys: Array.from(this.flows.keys()),
    },
    timestamp: new Date().toISOString(),
  });

  if (!flowId) {
    logger.error('[PaymentOrchestrator] Invalid flowId received', {
      flowId,
      updates,
      stack: new Error().stack,
      timestamp: new Date().toISOString(),
    });
    throw new Error('Invalid flowId');
  }

  let updatedState;
  if (updates.metadata?.updateType === 'booking_created') {
    const confirmationId = updates.metadata.confirmationId;
    const bookingId = updates.bookingId;
    const preBookingFlowId = flowId;

    const existingFlow =
      this.flows.get(preBookingFlowId) ||
      this.flows.get(flowId) ||
      Array.from(this.flows.values()).find((f) => f.metadata?.confirmationId === confirmationId);

    if (!existingFlow || this._isTerminalState(existingFlow.status)) {
      logger.error('[PaymentOrchestrator] Invalid flow for transition', {
        flowId,
        preBookingFlowId,
        bookingId,
        confirmationId,
        foundFlow: existingFlow ? { id: existingFlow.id, status: existingFlow.status } : 'none',
        timestamp: new Date().toISOString(),
      });
      throw new Error('Invalid flow for transition');
    }

    const transitionArgs = {
      confirmationId,
      transitionType: 'booking_created',
      originalFlowId: existingFlow.id,
    };

    const success = await this._handleFlowTransition(
      existingFlow.id,
      flowId,
      bookingId,
      bookingId,
      transitionArgs
    );

    if (!success) {
      logger.error('[PaymentOrchestrator] Flow transition failed', {
        flowId,
        preBookingFlowId,
        bookingId,
        transitionArgs,
        timestamp: new Date().toISOString(),
      });
      throw new Error('Flow transition failed');
    }

    updatedState = { id: bookingId, status: 'active', bookingId };
    logger.info('[PaymentOrchestrator] Flow transition completed', {
      flowId,
      preBookingFlowId,
      newFlowId: bookingId,
      result: updatedState,
      timestamp: new Date().toISOString(),
    });
  } else {
    const currentFlow = Array.from(this.flows.values()).find(
      (f) => f.id === flowId || (updates?.bookingId && f.bookingId === updates.bookingId)
    );
    const resolvedFlowId = currentFlow?.id || flowId;

    logger.info('[PaymentOrchestrator] Resolved flowId for non-transition update', {
      requestedFlowId: flowId,
      resolvedFlowId,
      foundFlow: !!currentFlow,
      updates,
      timestamp: new Date().toISOString(),
    });

    updatedState = await this.statusService.updateFlowState(resolvedFlowId, updates);
    logger.info('[PaymentOrchestrator] Non-transition flow update completed', {
      requestedFlowId: flowId,
      resolvedFlowId,
      foundFlow: !!currentFlow,
      updatedStatus: updatedState.status,
      timestamp: new Date().toISOString(),
    });
  }

  // Publish the updated state to all subscribers
  this.publishState(updatedState.id || flowId, {
    status: updatedState.status,
    metadata: {
      ...updatedState.metadata,
      modalState: updates.metadata?.modalState || updatedState.metadata?.modalState || 'booking',
      paymentStep: updates.metadata?.paymentStep || updatedState.metadata?.paymentStep || 'session',
    },
  });

  return updatedState;
}


_findPreBookingFlow(confirmationId) {
  logger.info('[PaymentOrchestrator] Searching for pre-booking flow:', {
      confirmationId,
      availableFlows: Array.from(this.flows.keys()),
      preservedFlows: Array.from(this.preservedFlows.keys()),
      confirmationMappings: Array.from(this._confirmationMappings.entries()),
      timestamp: new Date().toISOString()
  });

  // Search strategy 1: Direct flow lookup with pattern matching
  const directFlow = Array.from(this.flows.entries())
      .find(([key, flow]) => {
        const isPreBooking = flow.metadata?.isPreBooking;
          const matchesConfirmation = flow.metadata?.confirmationId === confirmationId;
          const isActive = !this._isTerminalState(flow.status);

          

          return isPreBooking && matchesConfirmation && isActive;
      });

  if (directFlow) {
      logger.info('[PaymentOrchestrator] Found flow via direct lookup:', {
          flowId: directFlow[0],
          timestamp: new Date().toISOString()
      });
      return directFlow;
  }

  // Search strategy 2: Check confirmation mappings
  const mappedFlow = Array.from(this._confirmationMappings.entries())
      .find(([key, mapping]) => {
          return key === confirmationId || 
                 mapping.flowIds?.includes(confirmationId) ||
                 mapping.metadata?.originalConfirmationId === confirmationId;
      });

  if (mappedFlow) {
      const [_, mapping] = mappedFlow;
      const flow = this.flows.get(mapping.currentFlowId);
      if (flow) {
          logger.info('[PaymentOrchestrator] Found flow via confirmation mapping:', {
              flowId: mapping.currentFlowId,
              mapping,
              timestamp: new Date().toISOString()
          });
          return [mapping.currentFlowId, flow];
      }
  }

  // Search strategy 3: Check preserved flows
  const preservedFlow = Array.from(this.preservedFlows.entries())
      .find(([_, flow]) => {
          return flow.metadata?.confirmationId === confirmationId ||
                 flow.metadata?.originalConfirmationId === confirmationId;
      });

  if (preservedFlow) {
      logger.info('[PaymentOrchestrator] Found preserved flow:', {
          flowId: preservedFlow[0],
          preservedAt: preservedFlow[1].preservedAt,
          timestamp: new Date().toISOString()
      });

      // Restore preserved flow to active flows
      const [flowId, flow] = preservedFlow;
      this.flows.set(flowId, {
          ...flow,
          restored: true,
          restoredAt: new Date().toISOString()
      });

      return preservedFlow;
  }

  logger.error('[PaymentOrchestrator] Pre-booking flow not found:', {
      confirmationId,
      searchResults: {
          directFlowFound: !!directFlow,
          mappedFlowFound: !!mappedFlow,
          preservedFlowFound: !!preservedFlow
      },
      availableFlows: Array.from(this.flows.keys()),
      timestamp: new Date().toISOString()
  });

  return null;
}

_trackFlowConfirmation(confirmationId, flowData) {
  if (!this._confirmationMappings.has(confirmationId)) {
      this._confirmationMappings.set(confirmationId, {
          flowIds: [],
          transitions: [],
          metadata: {}
      });
  }

  const mapping = this._confirmationMappings.get(confirmationId);
  const timestamp = new Date().toISOString();

  mapping.flowIds.push(flowData.id);
  mapping.currentFlowId = flowData.id;
  mapping.transitions.push({
      flowId: flowData.id,
      timestamp,
      metadata: flowData.metadata
  });

  logger.info('[PaymentOrchestrator] Flow confirmation tracked:', {
      confirmationId,
      flowId: flowData.id,
      mapping,
      timestamp
  });
}

  async _getOrCreateFlowId(bookingId) {
    logger.info('[PaymentOrchestrator] Flow ID creation details:', {
        bookingId,
        isPreConfirmation: bookingId.startsWith('pre-confirmation-'),
        existingLock: this._flowInitializationLocks.has(bookingId),
        existingQueue: false,
        timestamp: new Date().toISOString()
    });

    if (!bookingId || typeof bookingId !== 'string') {
        logger.error('[PaymentOrchestrator] Invalid booking ID for flow creation:', {
            bookingId,
            type: typeof bookingId,
            timestamp: new Date().toISOString()
        });
        throw new Error('Invalid booking ID for flow creation');
    }

    if (this._flowInitializationLocks.has(bookingId)) {
        return this._pendingInitializations.get(bookingId);
    }

    this._flowInitializationLocks.set(bookingId, Date.now());

    try {
        // Check existing flow first
        const existingFlowId = this._activeFlowIds.get(bookingId);
        if (existingFlowId && this.flows.has(existingFlowId)) {
            const flow = this.flows.get(existingFlowId);
            if (!this._isTerminalState(flow.status)) {
                return existingFlowId;
            }
        }

        // Create flow ID ONCE
        const timestamp = Date.now();
        const flowId = bookingId;

        logger.info('[PaymentOrchestrator] Creating new flow:', {
            flowId,
            bookingId,
            timestamp: new Date().toISOString()
        });

        // Set up flow with basic structure
        const baseFlow = {
            id: flowId,
            bookingId,
            status: FLOW_STATUS.INITIALIZING,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            metadata: {}
        };

        // Store flow
        this.flows.set(flowId, baseFlow);
        this._activeFlowIds.set(flowId, flowId);

        return flowId;
    } finally {
        this._flowInitializationLocks.delete(bookingId);
    }
}
  

  isFlowInitialized(flowId) {
    const lifecycle = this._flowLifecycles.get(flowId);
    return lifecycle === FLOW_LIFECYCLE.READY;
  }

  _addFlow(flowId, flow) {
    logger.info('[PaymentOrchestrator] Adding flow:', {
      flowId,
      bookingId: flow.bookingId,
      timestamp: new Date().toISOString()
    });

    this.flows.set(flowId, flow);
    this.activeFlows.set(flow.bookingId, flowId);
    this._activeFlowIds.set(flow.bookingId, flowId);
  }

  async _syncFlowStorage(flowId, flow) {
    logger.info('[PaymentOrchestrator] Syncing flow storage:', {
      flowId,
      flowData: {
        id: flow?.id,
        bookingId: flow?.bookingId,
        status: flow?.status
      },
      existingFlows: Array.from(this.flows.keys()),
      timestamp: new Date().toISOString()
    });
    if (!flowId || !flow || typeof flowId !== 'string') {
      logger.error('[PaymentOrchestrator] Invalid flow sync parameters:', {
        flowId,
        hasFlow: !!flow,
        flowIdType: typeof flowId,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid flow sync parameters');
    }
  
    try {
      // Atomic update
      const transaction = async () => {
        this.flows.set(flowId, flow);
        logger.info('[PaymentOrchestrator] Flow storage verification:', {
          flowId,
          isStored: this.flows.has(flowId),
          storedFlow: this.flows.get(flowId) ? {
            id: this.flows.get(flowId).id,
            status: this.flows.get(flowId).status
          } : null,
          timestamp: new Date().toISOString()
        });
        this._activeFlowIds.set(flow.bookingId, flowId);
        
        // Ensure PaymentFlowService is synchronized
        await PaymentFlowService.ensureFlowExists(flow.bookingId, flowId);
      };
  
      await transaction();
      
      logger.info('[PaymentOrchestrator] Flow storage synchronized:', {
        flowId,
        bookingId: flow.bookingId,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      logger.error('[PaymentOrchestrator] Flow storage sync failed:', {
        flowId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      // Attempt rollback
      this.flows.delete(flowId);
      this._activeFlowIds.delete(flow.bookingId);
      throw error;
    }
  }

  isValidFlowId(flowId) {
    if (!flowId) {
      logger.warn('[PaymentOrchestrator] Invalid flow validation - missing flowId', {
        flowId,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    // Check if flow exists directly (for composite IDs)
    if (this.flows.has(flowId)) {
      const flow = this.flows.get(flowId);
      return !this._isTerminalState(flow.status);
    }
  
    // Check if it's a booking ID with an active flow
    const activeFlowId = this._activeFlowIds.get(flowId);
    if (activeFlowId) {
      const flow = this.flows.get(activeFlowId);
      if (!flow) {
        logger.warn('[PaymentOrchestrator] Inconsistent state - active flow not found:', {
          flowId,
          activeFlowId,
          timestamp: new Date().toISOString()
        });
        return false;
      }
      return !this._isTerminalState(flow.status);
    }
  
    logger.warn('[PaymentOrchestrator] No active flow found:', {
      flowId,
      activeFlows: Array.from(this.flows.keys()),
      timestamp: new Date().toISOString()
    });
    
    return false;
  }

  _checkFlowSync() {
   
  
    Array.from(this._activeFlowIds.entries()).forEach(([bookingId, flowId]) => {
      const flow = this.flows.get(flowId);
      if (!flow) {
        logger.warn('[PaymentOrchestrator] Flow ID mapping without flow:', {
          bookingId,
          flowId,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  _validateFlow(flowId, bookingId = null) {
    if (!flowId) {
      logger.warn('[PaymentOrchestrator] Invalid flow validation - missing flowId', {
        flowId,
        bookingId,
        timestamp: new Date().toISOString()
      });
      return { valid: false, reason: 'missing_flow_id' };
    }
  
    const actualFlowId = this._activeFlowIds.get(flowId) || flowId;
    const flow = this.flows.get(actualFlowId);
    if (!flow) {
        logger.warn('[PaymentOrchestrator] Flow not found:', {
            requestedId: flowId,
            resolvedId: actualFlowId,
            bookingId,
            activeFlows: Array.from(this.flows.keys()),
            timestamp: new Date().toISOString()
        });
        return { valid: false, reason: 'flow_not_found' };
    }
  
    // If bookingId provided, validate the relationship
    if (bookingId) {
        const activeFlowId = this._activeFlowIds.get(bookingId);
        const isValid = (activeFlowId === actualFlowId && flow.bookingId === bookingId);
  
    
  
      return {
        valid: isValid,
        reason: isValid ? 'valid' : 'id_mismatch',
        flow
      };
    }
  
    // If no bookingId provided, just validate flow exists and is active
    return {
      valid: true,
      reason: 'valid',
      flow
    };
  }
  
  getActiveFlowId(bookingId) {
    const flowId = this._activeFlowIds.get(bookingId);
    
    logger.info('[PaymentOrchestrator] Getting active flow ID:', {
      bookingId,
      flowId,
      hasFlow: !!flowId,
      timestamp: new Date().toISOString()
    });
  
    return flowId;
  }

  _ensureFlowIdSynchronization(bookingId, flowId) {
    
  
    // Update active flows tracking
    const existingFlowId = this._activeFlowIds.get(bookingId);
    if (existingFlowId && existingFlowId !== flowId) {
      logger.warn('[PaymentOrchestrator] Flow ID mismatch detected:', {
        bookingId,
        existingFlowId,
        newFlowId: flowId,
        timestamp: new Date().toISOString()
      });
      
      // Check if existing flow is still valid
      const existingFlow = this.flows.get(existingFlowId);
      if (existingFlow && !this._isTerminalState(existingFlow.status)) {
        logger.info('[PaymentOrchestrator] Preserving existing active flow:', {
          bookingId,
          flowId: existingFlowId,
          status: existingFlow.status,
          timestamp: new Date().toISOString()
        });
        return existingFlowId;
      }
    }
  
    this._activeFlowIds.set(flowId, flowId);
    logger.info('[PaymentOrchestrator] Flow ID synchronized:', {
      bookingId,
      flowId,
      activeFlowsCount: this._activeFlowIds.size,
      timestamp: new Date().toISOString()
    });
  
    return flowId;
  }

  getFlowData(flowId) {
    const validation = this._validateFlow(flowId);
    logger.info('[PaymentOrchestrator] getFlowData called', {
      flowId,
      isValid: validation.valid,
      reason: validation.reason,
      availableFlows: Array.from(this.flows.keys()),
      timestamp: new Date().toISOString(),
    });
  
    if (!validation.valid) {
      logger.error('[PaymentOrchestrator] Invalid flow access attempt', { flowId, reason: validation.reason });
      return null;
    }
  
    const flow = validation.flow;
    logger.info('[PaymentOrchestrator] Returning flow data', {
      flowId,
      flowData: {
        bookingId: flow.bookingId,
        status: flow.status,
        metadata: flow.metadata,
        hasClientSecret: !!flow.metadata?.clientSecret,
      },
      timestamp: new Date().toISOString(),
    });
  
    return {
      flowId,
      bookingId: flow.bookingId,
      status: flow.status,
      paymentIntentId: flow.paymentIntent?.id,
      amount: flow.amount,
      currency: flow.currency,
      metadata: { ...flow.metadata },
      initialized: flow.initialized,
      lastActivity: flow.lastActivity,
    };
  }

_findFlowByConfirmation(confirmationId) {
    // First check direct mapping
    const mapping = this._confirmationMappings.get(confirmationId);
    if (mapping?.flowId) {
        return this.flows.get(mapping.flowId);
    }

    // Check flows with matching confirmation ID in metadata
    const matchingFlow = Array.from(this.flows.entries())
        .find(([_, flow]) => 
            flow.metadata?.confirmationId === confirmationId
        );

    return matchingFlow ? matchingFlow[1] : null;
}

  _getFlowByBookingId(bookingId) {
    logger.info('[PaymentOrchestrator] Getting flow by booking ID:', {
      bookingId,
      activeFlows: Array.from(this.flows.keys()),
      hasMapping: this._activeFlowIds.has(bookingId),
      timestamp: new Date().toISOString()
    });
  
    const flowId = this._activeFlowIds.get(bookingId);
    if (!flowId) {
      logger.warn('[PaymentOrchestrator] No flow ID found for booking:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return null;
    }
  
    const flow = this.flows.get(flowId);
    if (!flow) {
      logger.warn('[PaymentOrchestrator] Flow not found:', {
        bookingId,
        flowId,
        timestamp: new Date().toISOString()
      });
      return null;
    }
  
    return {
      flowId,
      bookingId: flow.bookingId,
      status: flow.status,
      paymentIntentId: flow.paymentIntent?.id,
      amount: flow.amount,
      currency: flow.currency,
      metadata: { ...flow.metadata },
      initialized: flow.initialized,
      lastActivity: flow.lastActivity
    };
  }

  async getFlowStatus(flowId) {
    logger.info('[PaymentOrchestrator] Getting flow status:', {
      flowId,
      activeFlows: Array.from(this.flows.keys()),
      flowData: this.flows.get(flowId) ? {
        status: this.flows.get(flowId).status,
        bookingId: this.flows.get(flowId).bookingId,
        initialized: this.flows.get(flowId).initialized,
        preserved: this.flows.get(flowId).preserved
      } : 'flow not found',
      timestamp: new Date().toISOString()
    });
  
    return this.flows.get(flowId);
  }

subscribeToState(flowId, callback) {
    const actualFlowId = this._activeFlowIds.get(flowId) || flowId;

    logger.info('[PaymentOrchestrator] Setting up state subscription:', {
      requestedId: flowId,
      resolvedId: actualFlowId,
      hasCallback: !!callback,
      timestamp: new Date().toISOString(),
    });
  
    if (!this.statusService) {
      throw new Error('Status service not initialized');
    }
  
    if (!this.statusSubscriptions.has(actualFlowId)) {
      this.statusSubscriptions.set(actualFlowId, new Set());
    }
    const subscribers = this.statusSubscriptions.get(actualFlowId);
    subscribers.add(callback);
    
    const currentFlow = this.flows.get(actualFlowId);
    if (currentFlow && callback) {
      const initialState = {
        ...currentFlow,
        id: currentFlow.id,
        bookingId: currentFlow.bookingId,
        flowId: currentFlow.id,
        clientSecret: currentFlow.metadata?.clientSecret || currentFlow.clientSecret,
        metadata: {
          ...currentFlow.metadata,
          modalState: currentFlow.metadata?.modalState || 'booking',
          paymentStep: currentFlow.metadata?.paymentStep || 'method',
        },
        lastUpdate: new Date().toISOString(),
      };
      callback(initialState);
    }
  
    const statusUnsubscribe = this.statusService.subscribeToState(actualFlowId, (state) => {
      const latestFlow = this.flows.get(actualFlowId) || {};
      const updatedFlow = {
        ...latestFlow,
        ...state,
        clientSecret: state.clientSecret || latestFlow.metadata?.clientSecret,
        metadata: { ...latestFlow.metadata, ...state.metadata },
      };
      this.flows.set(actualFlowId, updatedFlow);
      subscribers.forEach((sub) => {
        const enrichedState = {
          ...updatedFlow,
          id: actualFlowId,
          bookingId: updatedFlow.bookingId,
          flowId: actualFlowId,
          metadata: {
            ...updatedFlow.metadata,
            modalState: updatedFlow.metadata?.modalState || 'booking',
            paymentStep: updatedFlow.metadata?.paymentStep || 'method',
          },
          lastUpdate: new Date().toISOString(),
        };
        sub(enrichedState);
      });
    });
  
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.statusSubscriptions.delete(actualFlowId);
        if(typeof statusUnsubscribe === 'function') statusUnsubscribe();
      }
    };
  }

  _ensureMapsInitialized() {
    if (!this.flows) this.flows = new Map();
    if (!this._flowLifecycles) this._flowLifecycles = new Map();
    if (!this._activeFlowIds) this._activeFlowIds = new Map();
    if (!this._confirmationMappings) this._confirmationMappings = new Map();
  }

  async _registerFlow(flowId, data) {
    

    try {
        // Validate input
        if (!flowId || !data.bookingId) {
            throw new Error('Missing required flow registration data');
        }

        // Check for existing flow
        if (this.flows.has(flowId)) {
            logger.warn('[PaymentOrchestrator] Flow already exists:', {
                flowId,
                bookingId: data.bookingId,
                timestamp: new Date().toISOString()
            });
            return this.flows.get(flowId);
        }

        const flow = {
            id: flowId,
            ...data,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            version: 1,
            transitions: []
        };

        // Atomic update
        this.flows.set(flowId, flow);
        this._activeFlowIds.set(data.bookingId, flowId);

        // Handle confirmation mapping
        if (data.metadata?.confirmationId) {
            const confirmationId = data.metadata.confirmationId;
            this._confirmationMappings.set(confirmationId, {
                flowId,
                bookingId: data.bookingId,
                timestamp: new Date().toISOString(),
                metadata: {
                    ...data.metadata,
                    registrationTimestamp: new Date().toISOString()
                }
            });

            logger.info('[PaymentOrchestrator] Confirmation mapping created:', {
                flowId,
                confirmationId,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('[PaymentOrchestrator] Flow registered successfully:', {
            flowId,
            bookingId: data.bookingId,
            confirmationId: data.metadata?.confirmationId,
            timestamp: new Date().toISOString()
        });

        return flow;

    } catch (error) {
        logger.error('[PaymentOrchestrator] Flow registration failed:', {
            flowId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

async _updateFlowRegistration(flowId, updates) {
  logger.info('[PaymentOrchestrator] Updating flow registration:', {
      flowId,
      updateType: updates.status || 'state_update',
      timestamp: new Date().toISOString()
  });

  try {
      const flow = this.flows.get(flowId);
      if (!flow) {
          logger.error('[PaymentOrchestrator] Cannot update - flow not found:', {
              flowId,
              updates,
              timestamp: new Date().toISOString()
          });
          throw new Error('Flow not found');
      }

      // Validate version for concurrency
      const newVersion = (flow.version || 0) + 1;

      const updatedFlow = {
          ...flow,
          ...updates,
          version: newVersion,
          lastUpdated: new Date().toISOString(),
          transitions: [
              ...(flow.transitions || []),
              {
                  from: flow.status,
                  to: updates.status || flow.status,
                  timestamp: new Date().toISOString(),
                  metadata: updates.metadata || {}
              }
          ]
      };

      // Atomic update
      this.flows.set(flowId, updatedFlow);

      // Update active flow mapping if bookingId changed
      if (updates.bookingId && updates.bookingId !== flow.bookingId) {
          this._activeFlowIds.set(updates.bookingId, flowId);
          this._activeFlowIds.delete(flow.bookingId);
      }

      logger.info('[PaymentOrchestrator] Flow registration updated:', {
          flowId,
          status: updatedFlow.status,
          version: updatedFlow.version,
          timestamp: new Date().toISOString()
      });

      return updatedFlow;

  } catch (error) {
      logger.error('[PaymentOrchestrator] Flow update failed:', {
          flowId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
      });
      throw error;
  }
}

async initializePaymentFlow(bookingId, config) {
  logger.info('[PaymentOrchestrator] Starting initialization sequence:', {
      bookingId,
      config: {
          ...config,
          sensitiveData: undefined
      },
      existingFlows: Array.from(this.flows.keys()),
      timestamp: new Date().toISOString()
  });

  let flowId;
  try {
      // Get or create flow ID
      flowId = await this._getOrCreateFlowId(bookingId);

      logger.info('[PaymentOrchestrator] Flow ID created:', {
          flowId,
          bookingId,
          timestamp: new Date().toISOString()
      });

      // Register flow with validation
      const flowData = {
          bookingId,
          status: 'initializing',
          amount: config.amount,
          currency: config.currency,
          metadata: {
              ...config.metadata,
              confirmationId: config.metadata?.confirmationId,
              flowType: config.metadata?.isPreBooking ? 'pre_booking' : 'post_booking'
          },
          version: 1,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
      };

      await this._registerFlow(flowId, flowData);

      // Validate registration
      const registeredFlow = this.flows.get(flowId);
      if (!registeredFlow) {
          throw new Error('Flow registration failed');
      }

      logger.info('[PaymentOrchestrator] Flow registered:', {
          flowId,
          bookingId,
          status: registeredFlow.status,
          timestamp: new Date().toISOString()
      });

      // Initialize status service with synchronized state
      const statusState = await this.statusService.initializePaymentFlow(
          bookingId,
          {
              amount: config.amount,
              currency: config.currency
          },
          {
              ...config.metadata,
              flowId,
              originalFlow: registeredFlow
          }
      );

      // Verify state synchronization
      const verifyState = await this.statusService.getPaymentState(flowId);
      if (!verifyState) {
          logger.error('[PaymentOrchestrator] State synchronization failed:', {
              flowId,
              bookingId,
              timestamp: new Date().toISOString()
          });
          throw new Error('State synchronization failed');
      }

      // Update registration with verified state
      await this._updateFlowRegistration(flowId, {
          status: statusState.status,
          statusServiceState: statusState,
          lastUpdated: new Date().toISOString()
      });

      logger.info('[PaymentOrchestrator] Flow initialization completed:', {
          flowId,
          bookingId,
          status: statusState.status,
          timestamp: new Date().toISOString()
      });

      return {
          id: flowId,
          bookingId,
          status: statusState.status
      };

  } catch (error) {
      logger.error('[PaymentOrchestrator] Flow initialization failed:', {
          bookingId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
      });

      // Cleanup on initialization failure
      if (flowId) {
          await this.cleanup(flowId, 'initialization_failed');
      }

      throw error;
  }
}

async handlePaymentInitialization(flowId, options = {}) {
  logger.info('[PaymentOrchestrator] Coordinating payment initialization:', {
    flowId,
    hasSocket: !!PaymentSocketService,
    timestamp: new Date().toISOString()
  });

  const lockKey = `initialization:${flowId}`;
  const lockAcquired = await this.this.statusService.lockManager.acquireLifecycleLock(
    flowId, 
    'initialization'
  );

  if (!lockAcquired) {
    logger.error('[PaymentOrchestrator] Initialization lock acquisition failed:', {
      flowId,
      timestamp: new Date().toISOString()
    });
    return false;
  }

  try {
    // 1. Start with socket connection
    logger.info('[PaymentOrchestrator] Ensuring socket connection:', {
      flowId,
      timestamp: new Date().toISOString()
    });
    
    const socketConnected = await PaymentSocketService.ensureConnection();
    if (!socketConnected) {
      throw new Error('Socket connection failed');
    }

    // 2. Initialize flow before mounting to ensure state exists
    const flowConfig = { flowId, ...options }; // Pass flowId explicitly
    const flow = await this.initializePayment(flowConfig);

    // 3. Start mounting sequence with animation awareness
    await this.handleVisibilityChange(flowId, VISIBILITY_STATES.MOUNTING, {
      source: 'initialization_start',
      hasSocketConnection: true,
      animation: {
        starting: true,
        duration: 200 // Match motion.div transition duration
      }
    });

    // 4. Register cleanup while mounting
    logger.info('[PaymentOrchestrator] Registering socket cleanup:', {
      flowId,
      socketConnected,
      timestamp: new Date().toISOString()
    });

    this.registerSocketCleanup(flowId, () => {
      PaymentSocketService.cleanup(flowId);
    });

    // 5. Wait for state readiness and animation completion
    await Promise.all([
      this.statusService.waitForStateReadiness(flowId),
      new Promise(resolve => setTimeout(resolve, 200)) // Match animation duration
    ]);

    // 6. Complete mount sequence
    await this.handleVisibilityChange(flowId, VISIBILITY_STATES.VISIBLE, {
      source: 'initialization_complete',
      flowId: flow.id,
      socketReady: true,
      animation: {
        complete: true
      }
    });

    logger.info('[PaymentOrchestrator] Payment initialization complete:', {
      flowId,
      flowStatus: flow.status,
      socketConnected,
      timestamp: new Date().toISOString()
    });

    return flow;

  } catch (error) {
    logger.error('[PaymentOrchestrator] Payment initialization failed:', {
      error: error.message,
      flowId, // Add flowId for context
      stack: error.stack,
      timestamp: new Date().toISOString()
  });

    await this.handleVisibilityChange(flowId, VISIBILITY_STATES.ERROR, {
      source: 'initialization_error',
      error: error.message
    });

    throw error;
  } finally {
    this.this.statusService.lockManager.releaseLifecycleLock(flowId, 'initialization');
  }
}

async _atomicFlowUpdate(flowId, updateFn) {
  const lockKey = `flow:${flowId}`;
  
  if (!await this.statusService.lockManager.acquire(lockKey)) {
      throw new Error('Flow update in progress');
  }

  try {
      const flow = this.flows.get(flowId);
      if (!flow) {
          throw new Error('Flow not found');
      }

      const updatedFlow = await updateFn(flow);
      this.flows.set(flowId, {
          ...updatedFlow,
          lastUpdated: new Date().toISOString()
      });

      return updatedFlow;
  } finally {
      this.statusService.lockManager.release(lockKey);
  }
}

_trackFlowLifecycle(flowId, action, metadata = {}) {
  logger.info('[PaymentOrchestrator] Flow lifecycle event:', {
      flowId,
      action,
      currentFlows: Array.from(this.flows.keys()),
      activeFlowIds: Array.from(this._activeFlowIds.entries()),
      preservedFlows: Array.from(this.preservedFlows.keys()),
      confirmationMappings: Array.from(this._confirmationMappings.entries()),
      metadata,
      timestamp: new Date().toISOString()
  });
}
  
  _validateFlowTransition(fromState, toState, metadata = {}) {
    const validTransitions = {
      'initializing': ['pending', 'failed'],
      'pending': ['processing', 'failed'],
      'processing': ['completed', 'failed'],
      'failed': ['pending'],
      'completed': []
    };
  
    const allowedStates = validTransitions[fromState];
    if (!allowedStates) {
      logger.error('[PaymentOrchestrator] Invalid transition - unknown from state:', {
        fromState,
        toState,
        metadata,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    const isValid = allowedStates.includes(toState);
    logger.info('[PaymentOrchestrator] Flow transition validation:', {
      fromState,
      toState,
      isValid,
      metadata,
      timestamp: new Date().toISOString()
    });
  
    return isValid;
  }

async initializePayment(config) {
    const { bookingId, amount, currency, timing = PAYMENT_TIMING.IMMEDIATE } = config;
    logger.info('[PaymentOrchestrator] Starting initialization sequence:', {
      config: { ...config, sensitiveData: undefined },
      existingFlows: Array.from(this.flows.keys()),
      timestamp: new Date().toISOString(),
    });
  
    if (!amount || !currency) throw new Error('Missing required payment parameters');
  
    const flowId = config.flowId || uuidv4();

logger.info(`[Orchestrator - LOG A] ==> Initializing flow. Received bookingId (stable ID): ${bookingId}, flowId (transient ID): ${flowId}`);

    const existingFlow = this.flows.get(flowId);
    if (existingFlow) {
      logger.info('[PaymentOrchestrator] Using existing flow:', {
        flowId,
        status: existingFlow.status,
        timestamp: new Date().toISOString()
      });
      return existingFlow;
    }
  
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.flows.set(flowId, {
          id: flowId,
          bookingId: bookingId,
          status: 'initializing',
          amount,
          currency,
          metadata: {
            ...config.metadata,
            flowType: config.metadata?.isPreBooking ? 'pre_booking' : 'post_booking',
            modalState: config.metadata?.modalState || 'booking',
            paymentStep: config.metadata?.paymentStep || 'method',
          },
          createdAt: new Date().toISOString(),
        });
  
        const statusState = await this.statusService.initializePaymentFlow(
          flowId,
          { amount, currency, timing },
          {
            ...config.metadata,
            flowId,
            confirmationId: config.metadata?.confirmationId,
            modalState: config.metadata?.modalState || 'booking',
            paymentStep: config.metadata?.paymentStep || 'session',
          }
        );
  
        const stateReady = await this.statusService.waitForStateReadiness(flowId);
        if (!stateReady) throw new Error('Payment state initialization failed');
  
         this.socketManager.ensureConnection().catch(err => {
          logger.warn('[PaymentOrchestrator] Background socket connection failed during initialization.', {
            flowId,
            error: err.message,
            timestamp: new Date().toISOString()
          });
        });
  
        this._activeFlowIds.set(bookingId, flowId);

        logger.info(`[Orchestrator - LOG B] ==> Created mapping. Stable ID '${bookingId}' maps to Flow ID '${flowId}'.`);
  
        if (config.metadata?.confirmationId) {
          this._confirmationMappings.set(config.metadata.confirmationId, {
            flowId,
            bookingId: bookingId,
            timestamp: new Date().toISOString(),
            metadata: config.metadata,
          });
        }
  
        logger.info('[PaymentOrchestrator] Payment flow initialized:', {
          flowId,
          bookingId: bookingId,
          confirmationId: config.metadata?.confirmationId,
          attempt,
          timestamp: new Date().toISOString()
        });
  
        return {
          id: flowId,
          bookingId: bookingId,
          status: statusState.status,
          metadata: {
            confirmationId: config.metadata?.confirmationId,
            modalState: statusState.metadata?.modalState || 'booking',
            paymentStep: statusState.metadata?.paymentStep || 'session',
          },
        };
      } catch (error) {
        logger.error('[PaymentOrchestrator] Payment initialization attempt failed:', {
          error: error.message,
          flowId,
          attempt,
          maxAttempts,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
  
        if (attempt === maxAttempts) {
          logger.error('[PaymentOrchestrator] Payment initialization failed after retries:', {
            flowId,
            maxAttempts,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          throw error;
        }
  
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  async processPayment(flowId, paymentMethodId, paymentIntentId, context = {}) {
    const validation = this._validateFlow(flowId);
    if (!validation.valid) {
      const error = new Error(`Invalid payment flow: ${validation.reason}`);
      logger.error('[PaymentOrchestrator] Invalid flow during payment processing:', {
        flowId,
        reason: validation.reason,
        timestamp: new Date().toISOString()
      });
      await this.handlePaymentError(flowId, error);
      throw error;
    }

    const flow = validation.flow; // Orchestrator's flow object (e.g., keyed by pi_... for webinars)
    
    const mongoDBBookingIdForApi = context.bookingId || 
                                 flow?.metadata?.actualBookingId || 
                                 flow?.metadata?.bookingId || 
                                 (flowId.startsWith('pi_') ? null : flowId);

    logger.info('[PaymentOrchestrator] Flow state before processing:', {
      orchestratorFlowId: flowId,
      mongoDBBookingIdForApi,
      contextProvidedBookingId: context.bookingId,
      flowMetadataBookingId: flow?.metadata?.bookingId,
      flowMetadataActualBookingId: flow?.metadata?.actualBookingId,
      timestamp: new Date().toISOString()
    });
    
    if (!mongoDBBookingIdForApi) {
      const error = new Error('Missing MongoDB Booking ID for payment processing API context');
      logger.error('[PaymentOrchestrator] Missing MongoDB Booking ID:', {
        orchestratorFlowId: flowId,
        context,
        flowData: flow,
        timestamp: new Date().toISOString()
      });
      await this.handlePaymentError(flowId, error);
      throw error;
    }
    
    this._activeFlowIds.set(mongoDBBookingIdForApi, flowId);
    this._activeFlowIds.set(flowId, flowId);
    
    const processingLockKey = `processing:${flowId}`;
    if (!await this.statusService.lockManager.acquire(processingLockKey, 30000)) {
      const error = new Error('Payment processing already in progress for this flow');
      logger.warn('[PaymentOrchestrator] Concurrent payment processing attempted:', {
        orchestratorFlowId: flowId,
        mongoDBBookingIdForApi,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    try {
      await this.statusService.trackFlowState(flowId, PAYMENT_STATES.PROCESSING, {
        paymentMethodId,
        paymentIntentId,
        submissionStarted: new Date().toISOString()
      });
      
      await this.statusService.handlePaymentStatusChange(mongoDBBookingIdForApi, PAYMENT_STATES.PROCESSING);
      
      paymentLogger.logFlowEvent(flowId, 'payment_submission_started', {
        bookingId: mongoDBBookingIdForApi,
        paymentMethodId,
        paymentIntentId
      });
      
      const paymentApiContext = {
        bookingId: mongoDBBookingIdForApi,
        flowId: flowId,
        amount: flow.amount,
        currency: flow.currency,
        metadata: {
          ...flow.metadata,
          ...context,
          timestamp: new Date().toISOString()
        }
      };
      
      let resultFromApi = await paymentAPI.confirmPayment(
        paymentIntentId,
        paymentMethodId,
        paymentApiContext
      );
      
      // Webinar-specific response normalization BEFORE it's used by sendNotification inside paymentAPI or returned
      if (flow.metadata?.flowType === 'webinar_registration' && resultFromApi.success) {
        logger.info('[PaymentOrchestrator.processPayment] Webinar payment detected. Raw API response:', {
            orchestratorFlowId: flowId,
            apiResponseData: JSON.parse(JSON.stringify(resultFromApi)) // Deep copy for logging
        });

        const normalizedResult = { ...resultFromApi }; // Create a mutable copy

        if (!normalizedResult.currency && normalizedResult.paymentIntent?.currency) {
          normalizedResult.currency = normalizedResult.paymentIntent.currency.toUpperCase();
          logger.info(`[PaymentOrchestrator.processPayment] Webinar: Adjusted currency to ${normalizedResult.currency} from paymentIntent.`);
        } else if (normalizedResult.currency) {
          normalizedResult.currency = normalizedResult.currency.toUpperCase();
        }


        if (typeof normalizedResult.paymentIntent?.amount === 'number' && (!normalizedResult.amount || normalizedResult.amount === normalizedResult.paymentIntent.amount)) {
          normalizedResult.amount = normalizedResult.paymentIntent.amount / 100;
           logger.info(`[PaymentOrchestrator.processPayment] Webinar: Adjusted amount to ${normalizedResult.amount} from paymentIntent.`);
        }
        
        // Ensure bookingId in the result is the MongoDB ID for consistency upstream
        if (normalizedResult.bookingId !== mongoDBBookingIdForApi) {
            logger.warn(`[PaymentOrchestrator.processPayment] Webinar: API result bookingId (${normalizedResult.bookingId}) differs from context MongoDB ID (${mongoDBBookingIdForApi}). Standardizing.`);
            normalizedResult.bookingId = mongoDBBookingIdForApi;
        }
        if (!normalizedResult.bookingId) { // If bookingId was missing entirely from API result
            normalizedResult.bookingId = mongoDBBookingIdForApi;
        }


        // If the backend's response for "already confirmed" doesn't have top-level amount/currency,
        // but does have paymentIntent, we can source from there.
        if (resultFromApi.message === 'Payment already confirmed' || resultFromApi.alreadyConfirmed) {
            if (!normalizedResult.amount && normalizedResult.paymentIntent?.amount) {
                normalizedResult.amount = normalizedResult.paymentIntent.amount / 100;
            }
            if (!normalizedResult.currency && normalizedResult.paymentIntent?.currency) {
                normalizedResult.currency = normalizedResult.paymentIntent.currency.toUpperCase();
            }
        }
        
        resultFromApi = normalizedResult; // Use the normalized result
        logger.info('[PaymentOrchestrator.processPayment] Webinar: Final normalized API response for upstream:', {
            orchestratorFlowId: flowId,
            finalResult: JSON.parse(JSON.stringify(resultFromApi))
        });
      }
            
      logger.info('[PaymentOrchestrator] Payment confirmed via API (post-potential-normalization):', {
        orchestratorFlowId: flowId,
        mongoDBBookingId: mongoDBBookingIdForApi,
        apiResultStatus: resultFromApi.status,
        isResultSuccess: resultFromApi.success,
        finalResultForUpstream: { success: resultFromApi.success, status: resultFromApi.status, amount: resultFromApi.amount, currency: resultFromApi.currency, bookingId: resultFromApi.bookingId }
      });
      
      await this.statusService.handlePaymentStatusChange(mongoDBBookingIdForApi, resultFromApi.status || 'succeeded', {
        paymentIntentId,
        completedAt: new Date().toISOString(),
        result: resultFromApi 
      });
      
      paymentLogger.logFlowEvent(flowId, 'payment_succeeded', {
        bookingId: mongoDBBookingIdForApi,
        paymentIntentId,
        timestamp: new Date().toISOString()
      });
      
      return {
        ...resultFromApi, 
        bookingId: mongoDBBookingIdForApi, 
        flowId: flowId 
      };
        
    } catch (error) { 
      logger.error('[PaymentOrchestrator.processPayment] Error during payment processing or API confirmation:', {
          orchestratorFlowId: flowId,
          mongoDBBookingIdForApi,
          errorMessage: error.message,
          isAlreadyConfirmedError: error.message?.includes('already succeeded') || error.originalError?.message?.includes('already succeeded'),
          stack: error.stack
      });

      if (error.message?.includes('already succeeded') || error.originalError?.message?.includes('already succeeded') || 
          (error.code === 'payment_intent_unexpected_state' && error.payment_intent?.status === 'succeeded') ||
          (error.raw?.code === 'payment_intent_unexpected_state' && error.raw?.payment_intent?.status === 'succeeded')
         ) {
        logger.info('[PaymentOrchestrator] Handling already confirmed payment from error path:', {
          orchestratorFlowId: flowId,
          mongoDBBookingId: mongoDBBookingIdForApi,
          error: error.message
        });
        
        await this.statusService.handlePaymentStatusChange(mongoDBBookingIdForApi, 'succeeded', {
          paymentIntentId,
          completedAt: new Date().toISOString(),
          alreadyConfirmed: true
        });
        
        // Try to fetch amount/currency from flow for the already confirmed response if possible
        const returnAmount = flow.amount || (error.payment_intent?.amount ? error.payment_intent.amount / 100 : undefined);
        const returnCurrency = flow.currency || (error.payment_intent?.currency ? error.payment_intent.currency.toUpperCase() : undefined);

        return { 
          success: true,
          status: 'succeeded',
          alreadyConfirmed: true,
          bookingId: mongoDBBookingIdForApi,
          flowId: flowId,
          paymentIntentId,
          amount: returnAmount,
          currency: returnCurrency,
          message: 'Payment already confirmed (handled in error path).'
        };
      }
      
      await this.handlePaymentError(flowId, error, { 
        shouldCleanup: false, 
        preserveState: true
      });
      
      throw error; 
    } finally {
      this.statusService.lockManager.release(processingLockKey);
    }
  }

  async handlePaymentStatus(flowId, status, metadata = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    logger.info('[PaymentOrchestrator] Delegating payment status handling:', {
      flowId,
      status,
      bookingId: flow.bookingId,
      timestamp: new Date().toISOString()
    });
  
    try {
      // Use PaymentStatusService for state management
      const updatedState = await this.statusService.trackFlowState(flowId, status, {
        ...metadata,
        flowId,
        bookingId: flow.bookingId
      });
  
      // Update flow metadata but not state
      flow.lastActivity = Date.now();
      flow.metadata = {
        ...flow.metadata,
        lastStatus: status,
        lastStatusUpdate: new Date().toISOString()
      };
      this.flows.set(flowId, flow);
  
      return updatedState;
    } catch (error) {
      logger.error('[PaymentOrchestrator] Status handling failed:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async handlePaymentFailure(flowId, error) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    logger.info('[PaymentOrchestrator] Delegating payment failure handling:', {
      flowId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  
    return this.statusService.handleError(flowId, error, {
      bookingId: flow.bookingId,
      recoverable: error.recoverable
    });
  }

  async handlePaymentError(flowId, error, options = {}) {
    const { shouldCleanup = false, preserveState = true } = options;
    
    logger.error('[PaymentOrchestrator] Handling payment error:', {
      flowId,
      error: error.message,
      shouldCleanup,
      preserveState,
      timestamp: new Date().toISOString()
    });
  
    try {
      // Update state to failed
      await this.statusService.handlePaymentStatusChange(flowId, PAYMENT_STATES.FAILED, {
        error: error.message,
        failedAt: new Date().toISOString(),
        recoverable: error.recoverable !== false
      });
      
      if (shouldCleanup) {
        // Perform controlled cleanup with state preservation if needed
        await this.handleCleanup(flowId, {
          source: 'error_handler',
          reason: 'payment_error',
          preserveState
        });
      }
      
      // Publish error state to all subscribers
      this.publishState(flowId, {
        status: 'failed',
        error: {
          message: error.message,
          code: error.code || 'payment_error',
          recoverable: error.recoverable !== false
        },
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (handlingError) {
      logger.error('[PaymentOrchestrator] Error while handling payment error:', {
        flowId,
        originalError: error.message,
        handlingError: handlingError.message,
        stack: handlingError.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  async safeCleanup(flowId, options = {}) {
    const { preserveState = false, force = false, source = 'manual' } = options;
    
    logger.info('[PaymentOrchestrator] Safe cleanup requested:', {
      flowId,
      preserveState,
      force,
      source,
      timestamp: new Date().toISOString()
    });
    
    // Don't try to clean up non-existent flows
    if (!flowId || !this.flows.has(flowId)) {
      logger.info('[PaymentOrchestrator] Skipping cleanup - flow not found:', {
        flowId,
        timestamp: new Date().toISOString()
      });
      return true;
    }
    
    // Get flow data
    const flow = this.flows.get(flowId);
    
    try {
      // Preserve state if requested
      if (preserveState) {
        await this.statusService.preserveState(flowId, {
          reason: options.reason || 'safe_cleanup',
          source
        });
      }
      
      // Notify subscribers about cleanup
      this.publishState(flowId, {
        status: 'cleanup_initiated',
        reason: options.reason || 'safe_cleanup',
        source,
        timestamp: new Date().toISOString()
      });
      
      // Clean up state and subscriptions
      await this.statusService.cleanup(flowId);
      
      // Remove from active flows
      if (flow.bookingId) {
        this._activeFlowIds.delete(flow.bookingId);
      }
      
      this.flows.delete(flowId);
      
      logger.info('[PaymentOrchestrator] Safe cleanup completed successfully:', {
        flowId,
        bookingId: flow.bookingId,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      logger.error('[PaymentOrchestrator] Error during safe cleanup:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      if (force) {
        // Force remove if requested despite error
        if (flow?.bookingId) {
          this._activeFlowIds.delete(flow.bookingId);
        }
        this.flows.delete(flowId);
        
        logger.warn('[PaymentOrchestrator] Forced cleanup after error:', {
          flowId,
          timestamp: new Date().toISOString()
        });
      }
      
      return false;
    }
  }

  subscribeToFlow(flowId, callback) {
    logger.info('[PaymentOrchestrator] Setting up state subscription:', {
      flowId,
      hasCallback: !!callback,
      hasStatusService: !!this.statusService,
      timestamp: new Date().toISOString()
    });
  
    if (!this.statusService) {
      logger.error('[PaymentOrchestrator] Cannot subscribe - status service not initialized:', {
        flowId,
        timestamp: new Date().toISOString()
      });
      throw new Error('Status service not initialized');
    }
  
    // Track the subscription
    if (!this.statusSubscriptions.has(flowId)) {
      this.statusSubscriptions.set(flowId, new Set());
    }
    this.statusSubscriptions.get(flowId).add(callback);
  
    // Delegate to status service
    const unsubscribe = this.statusService.subscribeToState(flowId, (state) => {
      logger.info('[PaymentOrchestrator] State update received:', {
        flowId,
        state: {
          status: state.status,
          version: state.version
        },
        timestamp: new Date().toISOString()
      });
  
      // Call the callback with orchestrator-formatted state
      callback({
        ...state,
        flowId,
        lastUpdate: new Date().toISOString()
      });
    });
  
    // Return cleanup function
    return () => {
      logger.info('[PaymentOrchestrator] Cleaning up state subscription:', {
        flowId,
        hasSubscriptions: this.statusSubscriptions.has(flowId),
        timestamp: new Date().toISOString()
      });
  
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
  
      if (this.statusSubscriptions.has(flowId)) {
        const subs = this.statusSubscriptions.get(flowId);
        subs.delete(callback);
        if (subs.size === 0) {
          this.statusSubscriptions.delete(flowId);
        }
      }
    };
  }

  async waitForMountCompletion(flowId, timeout = LIFECYCLE_TIMEOUTS.MOUNT) {
    logger.info('[PaymentOrchestrator] Waiting for mount completion:', {
      flowId,
      hasFlow: this.stateManager.getFlow(flowId) !== null,
      currentState: this.stateManager.getState(flowId),
      timeout,
      timestamp: new Date().toISOString()
    });
  
    const flow = this.stateManager.getFlow(flowId);
    if (!flow) {
      logger.error('[PaymentOrchestrator] Cannot wait for mount - flow not found:', {
        flowId,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    try {
      // Get socket state through state manager
      const currentState = this.stateManager.getState(flowId);
      const socketState = currentState?.metadata?.socketState;
  
      if (!socketState?.isSocketConnected) {
        logger.warn('[PaymentOrchestrator] Mount requires socket connection:', {
          flowId,
          currentSocketState: socketState,
          timestamp: new Date().toISOString()
        });
        
        const socketConnected = await PaymentSocketService.ensureConnection();
        if (!socketConnected) {
          throw new Error('Socket connection required for mount completion');
        }
  
        // Update state with new socket connection
        await this.stateManager.setState(flowId, {
          ...currentState,
          metadata: {
            ...currentState?.metadata,
            socketState: await PaymentSocketService.getConnectionState()
          }
        });
      }
  
      // Acquire mount lock
      const mountLock = await this.this.statusService.lockManager.acquireLifecycleLock(
        flowId,
        'mount_completion',
        timeout
      );
  
      if (!mountLock) {
        throw new Error('Could not acquire mount lock');
      }
  
      try {
        // Track mount state through state manager
        await this.stateManager.transition(flowId, 
          this.stateManager.getState(flowId)?.status || 'initializing',
          LIFECYCLE_STATES.MOUNTING,
          {
            source: 'mount_completion',
            socketId: socketState?.socketId,
            timestamp: new Date().toISOString()
          }
        );
  
        return await new Promise((resolve, reject) => {
          const startTime = Date.now();
          const checkInterval = setInterval(() => {
            const state = this.stateManager.getState(flowId);
            
            if (state?.status === VISIBILITY_STATES.VISIBLE) {
              clearInterval(checkInterval);
              resolve(true);
            }
  
            // Log progress every 2 seconds
            if (Date.now() - startTime > 2000) {
              logger.info('[PaymentOrchestrator] Mount progress check:', {
                flowId,
                currentState: state,
                elapsed: Date.now() - startTime,
                timestamp: new Date().toISOString()
              });
            }
          }, 100);
  
          setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Mount completion timeout'));
          }, timeout);
        });
  
      } finally {
        this.this.statusService.lockManager.releaseLifecycleLock(flowId, 'mount_completion');
      }
  
    } catch (error) {
      logger.error('[PaymentOrchestrator] Mount completion failed:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  async updateFlowLifecycle(flowId, lifecycle, metadata = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    logger.info('[PaymentOrchestrator] Delegating lifecycle update:', {
      flowId,
      lifecycle,
      timestamp: new Date().toISOString()
    });
  
    return this.statusService.updateFlowLifecycle(flowId, lifecycle, {
      ...metadata,
      flowId,
      bookingId: flow.bookingId
    });
  }

  async persistFlowState(flowId) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    logger.info('[PaymentOrchestrator] Delegating flow state persistence:', {
      flowId,
      bookingId: flow.bookingId,
      timestamp: new Date().toISOString()
    });
  
    return this.statusService.preserveState(flowId);
  }

  async savePaymentMethod(paymentMethodId, userId) {
    logger.info('[PaymentOrchestrator] Saving payment method:', {
      userId,
      paymentMethodId,
      timestamp: new Date().toISOString()
    });

    try {
      const result = await this.paymentAPI.addPaymentMethod(paymentMethodId, {
        userId,
        isDefault: true,
        retries: 2,
        backoff: true
      });

      logger.info('[PaymentOrchestrator] Payment method saved:', {
        userId,
        paymentMethodId,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.error('[PaymentOrchestrator] Payment method endpoint not found:', {
          error: error.message,
          userId,
          timestamp: new Date().toISOString()
        });
        // Implement fallback or retry logic
        return this._handlePaymentMethodSaveFailure(paymentMethodId, userId, error);
      }
      throw error;
    }
  }

  async _handlePaymentMethodSaveFailure(paymentMethodId, userId, error) {
    // Implement retry logic with backoff
    logger.warn('[PaymentOrchestrator] Attempting payment method save recovery:', {
      userId,
      paymentMethodId,
      timestamp: new Date().toISOString()
    });

    // Add to recovery queue for processing
    return {
      success: false,
      error: error.message,
      recovery: {
        scheduled: true,
        retryAt: new Date(Date.now() + 5000).toISOString()
      }
    };
  }

  async preserveActiveFlow(flowId, options = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    logger.info('[PaymentOrchestrator] Preserving flow state:', {
      flowId,
      bookingId: flow.bookingId,
      timestamp: new Date().toISOString()
    });
  
    // Keep flow ID tracking
    flow.preserved = true;
    flow.preservedAt = new Date().toISOString();
    this.flows.set(flowId, flow);
  
    // Delegate state preservation
    return this.statusService.preserveState(flowId, {
      ...options,
      flowId,
      bookingId: flow.bookingId
    });
  }

  isValidFlow(flowId, bookingId = null) {
    return this._validateFlow(flowId, bookingId).valid;
  }
 

  _isTerminalState(status) {
    return [
      PAYMENT_STATES.SUCCEEDED,
      PAYMENT_STATES.FAILED,
      PAYMENT_STATES.CANCELLED
    ].includes(status);
  }

  _isFlowPreserved(flowId) {
    return this.preservedFlows.has(flowId) || Array.from(this.flows.values())
        .some(flow => flow.metadata?.originalFlowId === flowId);
}

goBack(flowId) {
  logger.info('[PaymentOrchestrator] Handling go back request:', {
    flowId,
    timestamp: new Date().toISOString(),
  });

  const flow = this.flows.get(flowId);
  if (!flow) {
    logger.warn('[PaymentOrchestrator] Cannot go back - flow not found:', {
      flowId,
      timestamp: new Date().toISOString(),
    });
    return false;
  }

  const updatedState = {
    status: flow.status,
    metadata: {
      ...flow.metadata,
      paymentStep: 'method',
      selectedPaymentMethod: null,
      modalState: flow.metadata?.modalState || 'booking',
      source: 'goBack',
      timestamp: new Date().toISOString(),
    }
  };

  this.publishState(flowId, updatedState);
  
  return this.statusService.trackFlowState(flowId, flow.status, updatedState.metadata);
}

  cleanup(flowId, reason = 'manual') {
    if (this._isFlowPreserved(flowId)) {
      logger.info('[PaymentOrchestrator] Skipping cleanup of preserved flow:', {
          flowId,
          reason,
          timestamp: new Date().toISOString()
      });
      return;
  }
    const flow = this.flows.get(flowId);
    if (!flow) return;
  
    // Check for protected state
    if (this._isProtectedState(flowId)) {
      logger.info('[PaymentOrchestrator] Blocking cleanup of protected flow:', {
        flowId,
        lifecycle: this._flowLifecycles.get(flowId),
        reason,
        timestamp: new Date().toISOString()
      });
      return;
    }
  
    logger.info('[PaymentOrchestrator] Starting flow cleanup:', {
      flowId,
      bookingId: flow.bookingId,
      reason,
      timestamp: new Date().toISOString()
    });
  
    // Clean up status service first
    this.statusService.cleanup(flow.bookingId);
  
    // Clean up flow ID mapping
    if (flow.bookingId) {
      this._activeFlowIds.delete(flow.bookingId);
    }
  
    // Clear timeouts
    if (this.cleanupTimeouts.has(flowId)) {
      clearTimeout(this.cleanupTimeouts.get(flowId));
      this.cleanupTimeouts.delete(flowId);
    }
  
    // Handle preserved flows
    if (!this._isTerminalState(flow.status)) {
      this.preservedFlows.set(flowId, {
        ...flow,
        cleanedUp: new Date().toISOString()
      });
      
      setTimeout(() => {
        this.preservedFlows.delete(flowId);
      }, 60000);
    }
  
    this.flows.delete(flowId);
  }
    }

    let orchestratorInstance;

    const createOrGetInstance = () => {
      if (!orchestratorInstance) {
        orchestratorInstance = new PaymentOrchestratorService();
        Object.freeze(orchestratorInstance);
      }
      return orchestratorInstance;
    };
  
    PaymentOrchestratorService.getInstance = createOrGetInstance;
  
    const instance = createOrGetInstance();
    instance.initializeSocketHandlers();
    Object.freeze(instance);
  
    export { 
      PaymentOrchestratorService,
      FLOW_LIFECYCLE,
      instance as PaymentOrchestrator 
    };