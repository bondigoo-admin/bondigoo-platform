import { logger } from '../utils/logger';
import { PAYMENT_STATES } from '../constants/paymentConstants';
import { LIFECYCLE_TIMEOUTS } from '../constants/paymentSocketConstants';

const PAYMENT_UI_STATES = {
  INITIAL: 'initial',
  PENDING: 'payment_pending',
  ACTIVE: 'payment_active',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  FAILED: 'failed'
};

const FLOW_LIFECYCLE_STATES = {
  INIT: 'initialization',
  ACTIVE: 'active',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

const FLOW_PRESERVATION = {
  TIMEOUT: 300000, // 5 minutes
  CLEANUP_DELAY: 1000
};

const STATE_READINESS = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  ERROR: 'error'
};

const stateInitPromise = new Map();

class StateSubscriptionManager {
  constructor() {
    this._subscribers = new Map();
    this._stateCache = new Map();
    this._subscriptionMetrics = new Map();
    
  /*  logger.info('[StateSubscriptionManager] Initialized:', {
      timestamp: new Date().toISOString()
    });*/
  }

  hasSubscribers(flowId) {
    return this._subscribers.has(flowId) && this._subscribers.get(flowId).size > 0;
  }

  getSubscriberCount(flowId) {
    return this._subscribers.get(flowId)?.size || 0;
  }

  subscribe(flowId, callback, options = {}) {
    logger.info('[StateSubscriptionManager] New subscription request:', {
      flowId,
      hasCallback: !!callback,
      options,
      existingSubscribers: this._subscribers.get(flowId)?.size || 0,
      timestamp: new Date().toISOString()
    });
  
    if (!callback) {
      logger.error('[StateSubscriptionManager] Invalid subscription - no callback');
      return () => { 
        logger.debug('[StateSubscriptionManager] Called no-op unsubscribe');
      };
    }
  
    if (!this._subscribers.has(flowId)) {
      this._subscribers.set(flowId, new Set());
      this._stateCache.set(flowId, options.initialState || null);
    }

    const subscribers = this._subscribers.get(flowId);
    subscribers.add(callback);

    // Track subscription metrics
    this._subscriptionMetrics.set(callback, {
      flowId,
      subscribedAt: new Date().toISOString(),
      lastNotified: null,
      notificationCount: 0,
      errorCount: 0
    });

    // Emit current state if exists and requested
    if (options.emitCurrent !== false) {
      const cachedState = this._stateCache.get(flowId);
      if (cachedState) {
        try {
          callback(cachedState);
          this._updateMetrics(callback, 'initial_state');
        } catch (error) {
          this._handleCallbackError(flowId, callback, error);
        }
      }
    }

    return () => this.unsubscribe(flowId, callback);
  }

  unsubscribe(flowId, callback) {
    const subscribers = this._subscribers.get(flowId);
    if (subscribers?.delete(callback)) {
      this._subscriptionMetrics.delete(callback);
      
      logger.info('[StateSubscriptionManager] Unsubscribed callback:', {
        flowId,
        remainingSubscribers: subscribers.size,
        timestamp: new Date().toISOString()
      });

      if (subscribers.size === 0) {
        this._subscribers.delete(flowId);
        this._stateCache.delete(flowId);
      }
    }
  }

  publish(flowId, state, options = {}) {
    logger.info('[StateSubscriptionManager] Publishing state:', {
      flowId,
      status: state?.status,
      subscriberCount: this._subscribers.get(flowId)?.size || 0,
      source: options.source,
      timestamp: new Date().toISOString()
    });

    const subscribers = this._subscribers.get(flowId);
    if (!subscribers?.size) {
      this._stateCache.set(flowId, state);
      return false;
    }

    // Update cache before notifying subscribers
    this._stateCache.set(flowId, state);

    // Notify subscribers with error handling
    subscribers.forEach(callback => {
      try {
        callback(state);
        this._updateMetrics(callback, 'state_update');
      } catch (error) {
        this._handleCallbackError(flowId, callback, error);
      }
    });

    return true;
  }

  _handleCallbackError(flowId, callback, error) {
    const metrics = this._subscriptionMetrics.get(callback);
    if (!metrics) return;

    metrics.errorCount++;
    metrics.lastError = {
      message: error.message,
      timestamp: new Date().toISOString()
    };

    logger.error('[StateSubscriptionManager] Callback error:', {
      flowId,
      errorCount: metrics.errorCount,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Remove problematic subscriber after too many errors
    if (metrics.errorCount >= 3) {
      this.unsubscribe(flowId, callback);
      logger.warn('[StateSubscriptionManager] Removed problematic subscriber:', {
        flowId,
        errorCount: metrics.errorCount,
        timestamp: new Date().toISOString()
      });
    }
  }

  _updateMetrics(callback, event) {
    const metrics = this._subscriptionMetrics.get(callback);
    if (metrics) {
      metrics.lastNotified = new Date().toISOString();
      metrics.notificationCount++;
      metrics.lastEvent = event;
    }
  }

  cleanup(flowId) {
    const subscribers = this._subscribers.get(flowId);
    if (subscribers) {
      logger.info('[StateSubscriptionManager] Cleaning up flow:', {
        flowId,
        subscriberCount: subscribers.size,
        timestamp: new Date().toISOString()
      });

      subscribers.forEach(callback => {
        this._subscriptionMetrics.delete(callback);
      });

      this._subscribers.delete(flowId);
      this._stateCache.delete(flowId);
    }
  }
}

class LockManager {
  constructor() {
    this._locks = new Map();
    this._timeouts = new Map();
  }

  async acquire(key, timeout = 5000) {
    if (this._locks.has(key)) {
      return false;
    }

    this._locks.set(key, Date.now());
    
    const timeoutId = setTimeout(() => {
      this.release(key);
      logger.warn('[PaymentOrchestrator] Lock timeout:', {
        key,
        duration: timeout,
        timestamp: new Date().toISOString()
      });
    }, timeout);

    this._timeouts.set(key, timeoutId);
    return true;
  }

  release(key) {
    const timeoutId = this._timeouts.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this._timeouts.delete(key);
    }
    this._locks.delete(key);
  }

  isLocked(key) {
    return this._locks.has(key);
  }

  async acquireLifecycleLock(flowId, lifecycle, timeout = LIFECYCLE_TIMEOUTS.TRANSITION) {
    const lockKey = `lifecycle:${flowId}:${lifecycle}`;

    logger.info('[LockManager] Lock acquisition details:', {
      flowId,
      lifecycle,
      timeout,
      existingLocks: Array.from(this._locks.keys()),
      timestamp: new Date().toISOString()
    });
    
    // Check for existing lock
    if (this._locks.has(lockKey)) {
      logger.warn('[PaymentOrchestrator] Lifecycle lock acquisition failed:', {
        flowId,
        lifecycle,
        existingLocks: Array.from(this._locks.keys()),
        timestamp: new Date().toISOString()
      });
      return null;
    }
  
    const lock = {
      id: `${lockKey}-${Date.now()}`,
      flowId,
      lifecycle,
      acquiredAt: Date.now(),
      timeout
    };
  
    this._locks.set(lockKey, lock);
  
    // Set timeout for lock expiration
    setTimeout(() => {
      const currentLock = this._locks.get(lockKey);
      if (currentLock?.id === lock.id) {
        logger.warn('[PaymentOrchestrator] Lock timeout:', {
          key: lockKey,
          duration: timeout,
          timestamp: new Date().toISOString()
        });
        this._locks.delete(lockKey);
      }
    }, timeout);
  
    return lock;
  }
  

  async releaseLifecycleLock(flowId, lifecycle) {
    const lockKey = `lifecycle:${flowId}:${lifecycle}`;
    logger.info('[PaymentOrchestrator] Releasing lifecycle lock:', {
      flowId,
      lifecycle,
      timestamp: new Date().toISOString()
    });
    this.release(lockKey);
  }
}

class PaymentStatusService {
  constructor() {
    const preCheck = {
      hasPaymentStates: !!this.paymentStates,
      paymentStatesType: typeof this.paymentStates
    };
  

    // Existing maps initialization
    this.activePolling = new Map();
    this.priceCache = new Map();
    this.paymentStates = new Map();
    this.pollingConfig = {
        maxAttempts: 5,
        baseInterval: 3000,
        maxInterval: 15000,
        exponentialFactor: 1.5
    };
    this.uiStates = new Map();

    // State management maps with proper initialization
    this._flowStates = new Map();
    this._preservedStates = new Map();
    this._flowLifecycles = new Map();
    this._submissionStates = new Map();
    this._stateTransitions = new Map();
    this._recoveryQueue = new Map();
    this.stateVersions = new Map();
    this.pendingUpdates = new Map();
    this._preservationTimeouts = new Map(); 
    this.flowSubscribers = new Map(); 
    this._stateInitQueue = new Map();
    this.lockManager = new LockManager();  
      

    this._initialized = false;
    this._initializeMaps();
    this.stateSubscriptions = new StateSubscriptionManager();
  
    /*logger.info('[PaymentStatusService] Initialized with subscription manager:', {
      hasPaymentStates: !!this.paymentStates,
      hasFlowStates: !!this._flowStates,
      hasSubscriptionManager: !!this.stateSubscriptions,
      timestamp: new Date().toISOString()
    });*/

   /* logger.info('[PaymentStatusService] Service initialized:', {
        hasPaymentStates: this.paymentStates.size > 0,
        hasFlowStates: this._flowStates.size > 0,
        timestamp: new Date().toISOString()
    });*/
    if (!this.paymentStates || !this._flowStates) {
      logger.error('[PaymentStatusService] Critical initialization failure:', {
          hasPaymentStates: !!this.paymentStates,
          hasFlowStates: !!this._flowStates,
          timestamp: new Date().toISOString()
      });
      throw new Error('Failed to initialize payment status service');
  }
  const postCheck = {
    hasPaymentStates: !!this.paymentStates,
    paymentStatesType: typeof this.paymentStates,
    isMap: this.paymentStates instanceof Map,
    hasKeys: !!this.paymentStates?.keys
  };

}

_initializeCoreMaps() {

if (this._initialized) {

  return;
}

 

  this.paymentStates = this.paymentStates || new Map();
  this._flowStates = this._flowStates || new Map();
  this._preservedStates = this._preservedStates || new Map();
  this._stateTransitions = this._stateTransitions || new Map();
  this._submissionStates = this._submissionStates || new Map();
  this._flowLifecycles = this._flowLifecycles || new Map();
  this.stateVersions = this.stateVersions || new Map();
  this.pendingUpdates = this.pendingUpdates || new Map();
  this._recoveryQueue = this._recoveryQueue || new Map();
  this._preservationTimeouts = this._preservationTimeouts || new Map();

  this._initialized = true;


}

_ensureStateMaps(flowId) {
 

  // Initialize maps if they don't exist or aren't Maps
  if (!this.paymentStates || !(this.paymentStates instanceof Map)) {
    logger.warn('[PaymentStatusService] Reinitializing invalid paymentStates', {
      flowId,
      previousState: this.paymentStates,
      timestamp: new Date().toISOString()
    });
    this.paymentStates = new Map();
    this._initialized = true;
  }
  if (!this._flowStates || !(this._flowStates instanceof Map)) {
    logger.warn('[PaymentStatusService] Reinitializing invalid flowStates', {
      flowId,
      previousState: this._flowStates,
      timestamp: new Date().toISOString()
    });
    this._flowStates = new Map();
  }
  if (!this.stateVersions || !(this.stateVersions instanceof Map)) {
    logger.warn('[PaymentStatusService] Reinitializing invalid stateVersions', {
      flowId,
      previousState: this.stateVersions,
      timestamp: new Date().toISOString()
    });
    this.stateVersions = new Map();
  }

  if (!flowId) {
    logger.error('[PaymentStatusService] Invalid flow ID, aborting state map setup', {
      flowId,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Use full flowId directly instead of baseId for consistency
  if (!this.paymentStates.has(flowId)) {
    this.paymentStates.set(flowId, {
      status: 'initializing',
      version: 1,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      updates: [],
      metadata: {}
    });
    logger.info('[PaymentStatusService] Initialized paymentStates for flow', {
      flowId,
      state: this.paymentStates.get(flowId),
      timestamp: new Date().toISOString()
    });
  }

  if (!this._flowStates.has(flowId)) {
    this._flowStates.set(flowId, {
      status: 'initializing',
      version: 1,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      transitions: []
    });
    logger.info('[PaymentStatusService] Initialized flowStates for flow', {
      flowId,
      state: this._flowStates.get(flowId),
      timestamp: new Date().toISOString()
    });
  }

  if (!this.stateVersions.has(flowId)) {
    this.stateVersions.set(flowId, 1);
    logger.info('[PaymentStatusService] Initialized stateVersions for flow', {
      flowId,
      version: 1,
      timestamp: new Date().toISOString()
    });
  }

  logger.info('[PaymentStatusService] State maps ensured', {
    flowId,
    mapSizes: {
      paymentStates: this.paymentStates.size,
      flowStates: this._flowStates.size,
      stateVersions: this.stateVersions.size
    },
    paymentState: this.paymentStates.get(flowId),
    flowState: this._flowStates.get(flowId),
    timestamp: new Date().toISOString()
  });
}

async initializeFlowState(flowId, initialState = {}, options = {}) {
  logger.info('[PaymentStatusService] Initializing flow state:', {
    flowId,
    hasInitialState: !!initialState,
    options,
    timestamp: new Date().toISOString()
  });

  this._ensureStateMaps(flowId);

  const baseState = {
    status: 'initializing',
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    updates: [],
    metadata: {},
    ...initialState,
    clientSecret: initialState.clientSecret || initialState.metadata?.clientSecret || null,
  };

  // Atomic state initialization
  this.paymentStates.set(flowId, baseState);
  this._flowStates.set(flowId, {
    ...baseState,
    transitions: []
  });
  this.stateVersions.set(flowId, 1);

  logger.info('[PaymentStatusService] Flow state initialized:', {
    flowId,
    state: baseState.status,
    timestamp: new Date().toISOString()
  });

  return baseState;
}

_initializeMaps() {
  if (this._initialized) return;

  logger.info('[PaymentStatusService] Initializing state maps...', {
    timestamp: new Date().toISOString()
  });

  // Ensure all maps exist
  this.paymentStates = this.paymentStates || new Map();
  this._flowStates = this._flowStates || new Map();
  this._preservedStates = this._preservedStates || new Map();
  this._stateTransitions = this._stateTransitions || new Map();
  this._submissionStates = this._submissionStates || new Map();
  this._flowLifecycles = this._flowLifecycles || new Map();
  this.stateVersions = this.stateVersions || new Map();
  this.pendingUpdates = this.pendingUpdates || new Map();
  this._recoveryQueue = this._recoveryQueue || new Map();
  this._preservationTimeouts = this._preservationTimeouts || new Map();
  this.flowSubscribers = this.flowSubscribers || new Map();

  this._initialized = true;

  /*logger.info('[PaymentStatusService] Maps initialized:', {
    mapStates: {
      paymentStates: !!this.paymentStates,
      flowStates: !!this._flowStates,
      preservedStates: !!this._preservedStates,
      preservationTimeouts: !!this._preservationTimeouts
    },
    timestamp: new Date().toISOString()
  });*/
}

_validateStateStructure(flowId, requireComplete = true) {
  if (!flowId) return false;

  const matchingKey = this._findByTimestamp(flowId, this.paymentStates);
  const lookupId = matchingKey || flowId;

  const validation = {
    hasPaymentState: this.paymentStates?.has(lookupId),
    hasFlowState: this._flowStates?.has(lookupId),
    hasStateVersion: this.stateVersions?.has(lookupId),
    hasTransitions: this._stateTransitions?.has(lookupId),
    timestamp: new Date().toISOString()
  };



  if (requireComplete) {
    return Object.values(validation).every(v => v === true);
  }

  return validation.hasPaymentState && validation.hasFlowState;
}

_ensureStateMapsExist(flowId) {
  if (!this.paymentStates.has(flowId)) {
      logger.info('[PaymentStatusService] Initializing state maps for flow:', {
          flowId,
          timestamp: new Date().toISOString()
      });
      this.paymentStates.set(flowId, new Map());
  }
  
  if (!this._flowStates.has(flowId)) {
      this._flowStates.set(flowId, {
          status: 'initializing',
          version: 1,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
      });
  }

  // Ensure other maps exist
  if (!this._stateTransitions.has(flowId)) {
      this._stateTransitions.set(flowId, []);
  }
  if (!this.stateVersions.has(flowId)) {
      this.stateVersions.set(flowId, 1);
  }
}

  initializePaymentTracking(bookingId, priceDetails, options = {}) {
   
    if (!bookingId) {
      logger.error('[PaymentStatusService] Cannot initialize without bookingId');
      throw new Error('Missing bookingId');
    }

    logger.info('[PaymentStatusService] Initializing payment tracking:', {
      bookingId,
      amount: priceDetails?.final || priceDetails?.amount,
      currency: priceDetails?.currency,
      timestamp: new Date().toISOString()
    });

    // Validate price data
    if (!this._validatePriceDetails(priceDetails)) {
      logger.error('[PaymentStatusService] Invalid price details:', {
        bookingId,
        priceDetails,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid price details');
    }

    // Normalize and cache price details
    const normalizedPrice = this._normalizePriceDetails(priceDetails);
    this.priceCache.set(bookingId, {
      ...normalizedPrice,
      originalData: priceDetails,
      timestamp: Date.now()
    });

    const paymentState = {
      status: PAYMENT_STATES.INITIALIZING,
      amount: normalizedPrice.amount,
      currency: normalizedPrice.currency,
      startedAt: Date.now(),
      updates: [],
      retryCount: 0,
      pollingAttempts: 0,
      metadata: options.metadata || {}
    };

    this.paymentStates.set(bookingId, paymentState);
    return paymentState;
  }


async _restorePreservedState(flowId, preservedState) {
  logger.info('[PaymentStatusService] Restoring preserved state:', {
      flowId,
      originalId: preservedState.preservationMetadata?.originalId,
      preservedAt: preservedState.preservedAt,
      timestamp: new Date().toISOString()
  });

  const restoredState = {
      ...preservedState,
      restored: true,
      restoredAt: new Date().toISOString(),
      version: (preservedState.version || 0) + 1
  };

  this._flowStates.set(flowId, restoredState);
  this.stateVersions.set(flowId, restoredState.version);
  this._preservedStates.delete(flowId);

  // Clear any pending timeout
  const timeoutId = this._preservationTimeouts.get(flowId);
  if (timeoutId) {
      clearTimeout(timeoutId);
      this._preservationTimeouts.delete(flowId);
  }

  return restoredState;
}

async _atomicStateTransition(oldId, newId, state, metadata = {}) {
  const actualOldId = oldId;
  const transitionKey = `transition:${actualOldId}:${newId}`;
  
  // Acquire a lock for this transition to ensure atomicity
  if (!await this.lockManager.acquire(transitionKey, 10000)) {
    logger.error('[PaymentStatusService] Cannot acquire transition lock - operation in progress:', {
      oldId: actualOldId,
      newId,
      timestamp: new Date().toISOString()
    });
    throw new Error('State transition already in progress');
  }

  logger.info('[PaymentStatusService] Pre-transition state check:', {
    ids: {
      providedOldId: oldId,
      actualOldId,
      newId
    },
    stateCheck: {
      hasOldState: this.paymentStates?.has(actualOldId),
      hasNewState: this.paymentStates?.has(newId),
      oldStateKeys: Array.from(this.paymentStates?.keys() || []),
      flowStateKeys: Array.from(this._flowStates?.keys() || [])
    },
    timestamp: new Date().toISOString()
  });

  try {
    // First, create a backup of the old state
    const oldState = this.paymentStates.get(actualOldId);
    if (!oldState) {
      logger.error('[PaymentStatusService] Transition failed - Original state not found:', {
        oldId: actualOldId,
        newId,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Original state not found for ID: ${actualOldId}`);
    }

    // Create a backup for recovery if needed
    const backupState = JSON.parse(JSON.stringify(oldState));
    this._preservedStates.set(`backup:${actualOldId}:${newId}`, {
      ...backupState,
      preservedAt: new Date().toISOString(),
      preservationReason: 'transition_backup'
    });
    
    this._initializeCoreMaps();

    if (oldState.metadata) {
      logger.info('[PaymentStatusService] Preserving state metadata:', {
        oldId: actualOldId,
        newId,
        timestamp: new Date().toISOString()
      });
    }

    // Create new state with version increment
    const oldVersion = this.stateVersions.get(actualOldId) || 0;
    const newState = {
      ...oldState,
      ...state,
      id: newId,
      lastUpdated: new Date().toISOString(),
      version: oldVersion + 1,
      metadata: {
        ...oldState.metadata,
        ...state.metadata,
        ...metadata,
        transitionedFrom: actualOldId,
        transitionTimestamp: new Date().toISOString()
      }
    };

    // First check if target state doesn't already exist
    if (this.paymentStates.has(newId)) {
      logger.warn('[PaymentStatusService] Target state already exists, will merge:', {
        oldId: actualOldId,
        newId,
        timestamp: new Date().toISOString()
      });
      // Merge instead of overwriting completely
      const existingState = this.paymentStates.get(newId);
      newState.metadata = {
        ...existingState.metadata,
        ...newState.metadata,
        mergedAt: new Date().toISOString()
      };
    }

    // Set the new state
    this.paymentStates.set(newId, newState);
    
    // Update flow state record
    const oldFlowState = this._flowStates.get(actualOldId);
    if (oldFlowState) {
      this._flowStates.set(newId, {
        ...oldFlowState,
        id: newId,
        lastUpdated: new Date().toISOString(),
        version: oldVersion + 1
      });
    }

    // Update version tracking
    this.stateVersions.set(newId, oldVersion + 1);

    // Verify the new state was properly set
    const verifyNewState = this.paymentStates.get(newId);
    if (!verifyNewState) {
      throw new Error('New state verification failed');
    }

    // Only delete original state after successful verification
    this.paymentStates.delete(actualOldId);
    this._flowStates.delete(actualOldId);
    this.stateVersions.delete(actualOldId);
    
    // Record transitions for debugging and recovery
    if (!this._stateTransitions) this._stateTransitions = new Map();
    if (!this._stateTransitions.has(newId)) this._stateTransitions.set(newId, []);
    
    this._stateTransitions.get(newId).push({
      from: actualOldId,
      to: newId,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        version: oldVersion + 1
      }
    });

    logger.info('[PaymentStatusService] State transition completed:', {
      oldId: actualOldId,
      newId,
      success: true,
      verification: {
        hasNewState: this.paymentStates.has(newId),
        newStateId: this.paymentStates.get(newId)?.id,
        stateKeys: Array.from(this.paymentStates.keys())
      },
      timestamp: new Date().toISOString()
    });

    // Publish the update to notify subscribers
    this._publishStateUpdate(newId, newState, {
      source: 'transition',
      previousId: actualOldId,
      metadata: {
        ...metadata,
        transitionTimestamp: new Date().toISOString()
      }
    });

    return true;
  } catch (error) {
    logger.error('[PaymentStatusService] State transition failed:', {
      oldId: actualOldId,
      newId,
      error: error.message,
      stack: error.stack,
      stateKeys: Array.from(this.paymentStates.keys()),
      timestamp: new Date().toISOString()
    });
    
    // Attempt recovery from backup if available
    try {
      const backupKey = `backup:${actualOldId}:${newId}`;
      const backup = this._preservedStates.get(backupKey);
      if (backup) {
        logger.info('[PaymentStatusService] Attempting recovery from backup after failed transition:', {
          oldId: actualOldId,
          newId,
          hasBackup: !!backup,
          timestamp: new Date().toISOString()
        });
        // Don't delete the original state if we failed
        // This ensures we don't lose data during recovery
      }
    } catch (recoveryError) {
      logger.error('[PaymentStatusService] Recovery also failed:', {
        oldId: actualOldId,
        newId,
        error: recoveryError.message,
        timestamp: new Date().toISOString()
      });
    }
    
    return false;
  } finally {
    // Always release the lock
    this.lockManager.release(transitionKey);
  }
}

async initializePaymentFlow(bookingId, priceDetails, options = {}) {
  // Check for existing initialization
  if (this._stateInitQueue.has(bookingId)) {
    logger.info('[PaymentStatusService] Waiting for existing initialization:', {
      bookingId,
      timestamp: new Date().toISOString()
    });
    return this._stateInitQueue.get(bookingId);
  }

  // Create initialization promise for state readiness tracking
  const initPromise = new Promise((resolve, reject) => {
    stateInitPromise.set(bookingId, {
      resolve,
      reject,
      timestamp: new Date().toISOString()
    });
  });

  // Create atomic initialization promise
  const statePromise = (async () => {
    logger.info('[PaymentStatusService] Flow initialization entry:', {
      bookingId,
      mapsState: {
        hasPaymentStates: !!this.paymentStates,
        paymentStatesSize: this.paymentStates?.size,
        existingKeys: Array.from(this.paymentStates?.keys() || [])
      },
      priceDetails: {
        amount: priceDetails?.amount,
        currency: priceDetails?.currency,
        timing: priceDetails?.timing
      },
      options,
      existingState: this.paymentStates.get(bookingId),
      stack: new Error().stack,
      timestamp: new Date().toISOString()
    });

    // Initialize maps if needed
    this._ensureStateMaps(bookingId);

    // Check for preserved state first
    const preservedState = this._preservedStates.get(bookingId);
    if (preservedState && !options.force) {
      logger.info('[PaymentStatusService] Restoring preserved state:', {
        bookingId,
        preservedAt: preservedState.preservedAt,
        timestamp: new Date().toISOString()
      });
      const restored = await this._restorePreservedState(bookingId, preservedState);
      stateInitPromise.get(bookingId)?.resolve(restored);
      return restored;
    }

    const initialState = {
      id: bookingId,
      bookingId,
      status: 'initializing',
      amount: priceDetails.amount,
      currency: priceDetails.currency,
      metadata: {
        ...options,
        flowType: bookingId.includes('pre-confirmation') ? 'pre_booking' : 'post_booking'
      },
      version: 1,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      transitions: []
    };

    logger.info('[PaymentStatusService] Initial state creation:', {
      bookingId,
      flowId: options.flowId,
      stateDetails: {
        hasPaymentStates: !!this.paymentStates,
        hasFlowStates: !!this._flowStates,
        initialState: {
          ...initialState,
          metadata: {
            ...initialState.metadata,
            sensitiveData: undefined
          }
        },
        mapsStatus: {
          paymentStates: Array.from(this.paymentStates.keys()),
          flowStates: Array.from(this._flowStates.keys())
        }
      },
      timestamp: new Date().toISOString()
    });

    try {
      // Atomic state initialization
      this.paymentStates.set(bookingId, initialState);
      this._flowStates.set(bookingId, initialState);
      this.stateVersions.set(bookingId, 1);

      logger.info('[PaymentStatusService] State maps synchronized:', {
        bookingId,
        verification: {
          paymentStates: this.paymentStates.has(bookingId),
          flowStates: this._flowStates.has(bookingId),
          stateVersions: this.stateVersions.has(bookingId)
        },
        timestamp: new Date().toISOString()
      });

      stateInitPromise.get(bookingId)?.resolve(initialState);
      return initialState;

    } catch (error) {
      stateInitPromise.get(bookingId)?.reject(error);
      throw error;
    } finally {
      stateInitPromise.delete(bookingId);
    }
  })();

  // Queue initialization
  this._stateInitQueue.set(bookingId, statePromise);

  try {
    return await statePromise;
  } finally {
    this._stateInitQueue.delete(bookingId);
  }
}

async waitForStateReadiness(bookingId) {
  if (!stateInitPromise.has(bookingId)) {
    logger.debug('[PaymentStatusService] No pending initialization:', {
      bookingId,
      timestamp: new Date().toISOString()
    });
    return true;
  }

  logger.info('[PaymentStatusService] Waiting for state initialization:', {
    bookingId,
    timestamp: new Date().toISOString()
  });

  try {
    await stateInitPromise.get(bookingId).promise;
    return true;
  } catch (error) {
    logger.error('[PaymentStatusService] State initialization failed:', {
      bookingId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}
  
async updateFlowState(flowId, newState, metadata = {}) {
  logger.info('[PaymentStatusService] Starting flow state update', {
    flowId,
    newState: {
      status: newState?.status || newState,
      metadata: newState?.metadata
    },
    currentState: {
      paymentStates: this.paymentStates?.has(flowId) ? {
        status: this.paymentStates.get(flowId).status,
        version: this.paymentStates.get(flowId).version
      } : 'not found',
      flowStates: this._flowStates?.has(flowId) ? {
        status: this._flowStates.get(flowId).status
      } : 'not found',
      version: this.stateVersions?.get(flowId) || 0,
      paymentKeys: this.paymentStates ? Array.from(this.paymentStates.keys()) : 'uninitialized',
      flowKeys: this._flowStates ? Array.from(this._flowStates.keys()) : 'uninitialized'
    },
    timestamp: new Date().toISOString()
  });

  this._ensureStateMaps(flowId);

  const resolvedId = newState?.metadata?.bookingId || flowId;

  try {
    const currentState = this.paymentStates.get(resolvedId) || {};
    const currentVersion = this.stateVersions.get(resolvedId) || 0;

    const updatedState = {
      ...currentState,
      ...newState,
      id: resolvedId,
      version: currentVersion + 1,
      lastUpdated: new Date().toISOString(),
      metadata: {
        ...(currentState.metadata || {}),
        ...newState.metadata,
        ...metadata
      }
    };

    this.paymentStates.set(resolvedId, updatedState);
    this._flowStates.set(resolvedId, {
      ...this._flowStates.get(resolvedId) || {},
      status: updatedState.status,
      version: updatedState.version,
      lastUpdated: updatedState.lastUpdated,
      metadata: updatedState.metadata
    });
    this.stateVersions.set(resolvedId, updatedState.version);

    this._publishStateUpdate(resolvedId, updatedState, {
      source: 'updateFlowState',
      metadata: {
        ...metadata,
        updateTimestamp: new Date().toISOString()
      }
    });

    logger.info('[PaymentStatusService] Flow state updated successfully', {
      flowId,
      resolvedId,
      state: {
        status: updatedState.status,
        version: updatedState.version,
        metadataKeys: Object.keys(updatedState.metadata || {})
      }
    });

    return updatedState;
  } catch (error) {
    logger.error('[PaymentStatusService] Flow state update failed', {
      flowId,
      resolvedId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

  // Add robust flow validation
  validateFlow(flowId, expectedState = null) {
    const state = this.paymentStates.get(flowId);
    
    logger.info('[PaymentStatusService] Validating flow:', {
      flowId,
      hasState: !!state,
      expectedState,
      actualState: state?.status,
      timestamp: new Date().toISOString()
    });

    if (!state) {
      return {
        isValid: false,
        error: 'Flow not found',
        code: 'FLOW_NOT_FOUND'
      };
    }

    if (expectedState && state.status !== expectedState) {
      return {
        isValid: false,
        error: 'Invalid flow state',
        code: 'INVALID_STATE',
        expected: expectedState,
        actual: state.status
      };
    }

    return {
      isValid: true,
      state
    };
  }

  async reconcileState(flowId, metadata = {}) {
    const state = this.paymentStates.get(flowId);
    if (!state) return null;

    logger.info('[PaymentStatusService] Starting state reconciliation:', {
      flowId,
      currentState: state.status,
      metadata,
      timestamp: new Date().toISOString()
    });

    // Check for preserved state
    const preservedState = this._preservedStates.get(flowId);
    if (preservedState && preservedState.version > state.version) {
      logger.info('[PaymentStatusService] Restoring preserved state:', {
        flowId,
        preservedVersion: preservedState.version,
        currentVersion: state.version,
        timestamp: new Date().toISOString()
      });
      
      await this.updateFlowState(flowId, {
        ...preservedState,
        restored: true,
        metadata: {
          ...preservedState.metadata,
          restoredAt: new Date().toISOString()
        }
      });
    }

    return this.paymentStates.get(flowId);
  }


  startPolling(bookingId, interval = this.pollingConfig.baseInterval) {
    if (this.activePolling.has(bookingId)) {
      logger.info('[PaymentStatusService] Polling already active:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const paymentState = this.paymentStates.get(bookingId);
    if (!paymentState) {
      logger.error('[PaymentStatusService] Cannot start polling - payment not initialized:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    logger.info('[PaymentStatusService] Starting status polling:', {
      bookingId,
      interval,
      priceAmount: paymentState.amount,
      timestamp: new Date().toISOString()
    });

    const pollerId = setInterval(async () => {
      await this._executePollCycle(bookingId);
    }, interval);

    this.activePolling.set(bookingId, {
      id: pollerId,
      interval,
      startedAt: Date.now()
    });
  }


  async trackFlowState(flowId, state, metadata = {}) {
    const currentState = this._flowStates.get(flowId);
    const currentVersion = this.stateVersions.get(flowId) || 0;

    logger.info('[PaymentStatusService] Tracking state transition:', {
        flowId,
        from: currentState?.status,
        to: state,
        version: currentVersion + 1,
        metadata,
        timestamp: new Date().toISOString()
    });

    const transition = {
        from: currentState?.status,
        to: state,
        version: currentVersion + 1,
        timestamp: new Date().toISOString(),
        metadata
    };

    // Track transition history
    if (!this._stateTransitions.has(flowId)) {
        this._stateTransitions.set(flowId, []);
    }
    this._stateTransitions.get(flowId).push(transition);

    // Update state with versioning
    const updatedState = {
        ...(currentState || {}),
        status: state,
        version: currentVersion + 1,
        lastUpdated: new Date().toISOString(),
        metadata: {
            ...(currentState?.metadata || {}),
            ...metadata
        }
    };

    this._flowStates.set(flowId, updatedState);
    this.stateVersions.set(flowId, currentVersion + 1);

    // Notify subscribers
    this._notifySubscribers(flowId, updatedState);

    return updatedState;
}

async _atomicStateUpdate(bookingId, updatedState) {
  logger.info('[PaymentStatusService] Attempting atomic state update:', {
      bookingId,
      status: updatedState.status,
      version: updatedState.version,
      timestamp: new Date().toISOString()
  });

  this._ensureStateMaps(bookingId);
  const flowId = updatedState.flowId || bookingId;

  try {
      // Verify state exists
      const currentState = this.paymentStates.get(bookingId);
      if (!currentState) {
          logger.error('[PaymentStatusService] State not found for update:', {
              bookingId,
              flowId,
              timestamp: new Date().toISOString()
          });
          // Try to recover from preserved states
          const recoveredState = await this._attemptStateRecovery(bookingId);
          if (!recoveredState) {
              throw new Error('Payment state not found and recovery failed');
          }
      }

      // Update payment state
      this.paymentStates.set(bookingId, updatedState);
      this._flowStates.set(flowId, {
          ...this._flowStates.get(flowId) || {},
          status: updatedState.status,
          lastUpdated: new Date().toISOString(),
          version: updatedState.version
      });

      logger.info('[PaymentStatusService] State updated successfully:', {
          bookingId,
          flowId,
          newStatus: updatedState.status,
          version: updatedState.version,
          timestamp: new Date().toISOString()
      });

      return updatedState;
  } catch (error) {
      logger.error('[PaymentStatusService] State update failed:', {
          bookingId,
          flowId,
          error: error.message,
          timestamp: new Date().toISOString()
      });
      throw error;
  }
}

async handlePaymentStatusChange(bookingId, status, metadata = {}) {
  logger.info('[PaymentStatusService] Handling payment status change:', {
      bookingId,
      status,
      hasMetadata: !!metadata,
      timestamp: new Date().toISOString()
  });

  const currentState = this.paymentStates.get(bookingId);
  if (!currentState) {
      logger.error('[PaymentStatusService] No payment state found:', {
          bookingId,
          status,
          timestamp: new Date().toISOString()
      });
      return null;
  }

  // Check for preserved states during transition
  if (metadata.isTransition && this._preservedStates.has(currentState.flowId)) {
      const preservedState = this._preservedStates.get(currentState.flowId);
      if (preservedState.version > (currentState.version || 0)) {
          logger.info('[PaymentStatusService] Restoring preserved state during transition:', {
              bookingId,
              flowId: currentState.flowId,
              preservedVersion: preservedState.version,
              currentVersion: currentState.version,
              timestamp: new Date().toISOString()
          });
          
          // Ensure clean state reconciliation
          const reconciled = await this.reconcileState(currentState.flowId);
          if (!reconciled) {
              logger.error('[PaymentStatusService] State reconciliation failed:', {
                  bookingId,
                  flowId: currentState.flowId,
                  timestamp: new Date().toISOString()
              });
              throw new Error('State reconciliation failed during transition');
          }
          // Use reconciled state as current
          currentState = reconciled;
      }
  }

  const updatedState = {
      ...currentState,
      status,
      version: (currentState.version || 0) + 1,
      lastUpdated: new Date().toISOString(),
      updates: [
          ...(currentState.updates || []),
          {
              status,
              timestamp: new Date().toISOString(),
              metadata: {
                  ...metadata,
                  version: (currentState.version || 0) + 1,
                  recovered: !!metadata.recovered
              }
          }
      ]
  };

  // Atomic state update with verification
  await this._atomicStateUpdate(bookingId, updatedState);

  // Track state in flow states with version info
  const flowId = currentState.flowId;
  if (flowId) {
      await this.trackFlowState(flowId, status, {
          ...metadata,
          version: updatedState.version,
          isStatusChange: true
      });
  }

  this._notifySubscribers(bookingId, updatedState);

  return updatedState;
}
  
  trackSubmission(flowId, submissionData) {
    logger.info('[PaymentStatusService] Tracking payment submission:', {
      flowId,
      hasExistingSubmission: this._submissionStates.has(flowId),
      timestamp: new Date().toISOString()
    });
  
    const submission = {
      ...submissionData,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      attempts: (this._submissionStates.get(flowId)?.attempts || 0) + 1
    };
  
    this._submissionStates.set(flowId, submission);
    return submission;
  }

  async _attemptStateRecovery(flowId) {
    const preservedState = this._preservedStates.get(flowId);
    if (!preservedState) {
        logger.info('[PaymentStatusService] No preserved state found:', {
            flowId,
            timestamp: new Date().toISOString()
        });
        return null;
    }

    logger.info('[PaymentStatusService] Attempting state recovery:', {
        flowId,
        preservedAt: preservedState.preservedAt,
        originalState: preservedState.status,
        timestamp: new Date().toISOString()
    });

    try {
        // Check if preserved state is still valid
        const isExpired = Date.now() - new Date(preservedState.preservedAt).getTime() > FLOW_PRESERVATION.TIMEOUT;
        if (isExpired) {
            logger.warn('[PaymentStatusService] Preserved state expired:', {
                flowId,
                preservedAt: preservedState.preservedAt,
                timestamp: new Date().toISOString()
            });
            this._preservedStates.delete(flowId);
            return null;
        }

        // Queue recovery if there are pending operations
        if (this._submissionStates.get(flowId)) {
            this._queueRecovery(flowId, preservedState);
            return null;
        }

        // Restore state
        return this._restoreState(flowId, preservedState);
    } catch (error) {
        logger.error('[PaymentStatusService] State recovery failed:', {
            flowId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        return null;
    }
}
  
  async preserveState(flowId, options = {}) {
    logger.info('[PaymentStatusService] Preserve state entry:', {
      flowId,
      allMapSizes: {
          paymentStates: this.paymentStates.size,
          flowStates: this._flowStates.size,
          stateVersions: this.stateVersions.size
      },
      hasTargetState: this.paymentStates.has(flowId),
      currentKeys: Array.from(this.paymentStates.keys()),
      timestamp: new Date().toISOString()
  });
  if (!this._preservedStates) {
    logger.error('[PaymentStatusService] Preserved states map not initialized');
    this._preservedStates = new Map();
  }
  const matchingKey = this._findByTimestamp(flowId, this.paymentStates);
  const lookupId = matchingKey || flowId;
    const state = this.getPaymentState(flowId);
    if (!state) {
        logger.warn('[PaymentStatusService] Cannot preserve - state not found:', {
            flowId,
            timestamp: new Date().toISOString()
        });
        return null;
    }

    logger.info('[PaymentStatusService] Preserving state:', {
        flowId,
        currentStatus: state.status,
        preservationReason: options.reason,
        timestamp: new Date().toISOString()
    });

    const preservedState = {
        ...state,
        preservedAt: new Date().toISOString(),
        preservationMetadata: {
            reason: options.reason,
            originalId: flowId,
            targetId: options.transitionTarget
        },
        flowState: this._flowStates.get(flowId),
        transitions: this._stateTransitions.get(flowId) || [],
        version: this.stateVersions.get(flowId),
    };

    this._preservedStates.set(flowId, preservedState);

    // Set cleanup timeout with recovery attempt
    const timeoutId = setTimeout(() => {
        this._attemptStateRecovery(flowId).catch(error => {
            logger.error('[PaymentStatusService] State recovery failed:', {
                flowId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        });
    }, FLOW_PRESERVATION.TIMEOUT);

    this._preservationTimeouts.set(flowId, timeoutId);

    return preservedState;
}
  
  getFlowState(flowId) {
    return {
      current: this._flowStates.get(flowId),
      transitions: this._stateTransitions.get(flowId) || [],
      submission: this._submissionStates.get(flowId),
      preserved: this._preservedStates.get(flowId)
    };
  }

  async _executePollCycle(bookingId) {
    logger.info('[PaymentStatusService] Poll cycle execution:', {
      bookingId,
      currentState: paymentState?.status,
      pollingAttempts: paymentState?.pollingAttempts,
      hasSubscribers: this.statusSubscribers.has(bookingId),
      timestamp: new Date().toISOString()
    });
    const paymentState = this.paymentStates.get(bookingId);
    if (!paymentState) {
      this.stopPolling(bookingId);
      return;
    }

    try {
      paymentState.pollingAttempts++;
      
      if (paymentState.pollingAttempts >= this.pollingConfig.maxAttempts) {
        logger.warn('[PaymentStatusService] Max polling attempts reached:', {
          bookingId,
          attempts: paymentState.pollingAttempts,
          timestamp: new Date().toISOString()
        });
        this.stopPolling(bookingId);
        return;
      }

      const status = await this._checkPaymentStatus(bookingId);
      
      // Ensure price consistency during status updates
      const cachedPrice = this.priceCache.get(bookingId);
      if (cachedPrice) {
        status.amount = cachedPrice.amount;
        status.currency = cachedPrice.currency;
      }

      this._updatePaymentState(bookingId, status);
      this._notifySubscribers(bookingId, status);

      if (this._isTerminalState(status.state)) {
        logger.info('[PaymentStatusService] Terminal state reached:', {
          bookingId,
          state: status.state,
          finalAmount: status.amount,
          timestamp: new Date().toISOString()
        });
        this.stopPolling(bookingId);
      }
    } catch (error) {
      logger.error('[PaymentStatusService] Polling error:', {
        bookingId,
        error: error.message,
        attempt: paymentState.pollingAttempts,
        timestamp: new Date().toISOString()
      });
      
      paymentState.lastError = error.message;
      paymentState.retryCount++;

      // Implement exponential backoff
      const currentPolling = this.activePolling.get(bookingId);
      if (currentPolling) {
        const newInterval = Math.min(
          currentPolling.interval * this.pollingConfig.exponentialFactor,
          this.pollingConfig.maxInterval
        );
        
        clearInterval(currentPolling.id);
        this.startPolling(bookingId, newInterval);
      }
    }
  }

  async attemptStateRecovery(flowId) {
    const preservedState = this._preservedStates.get(flowId);
    if (!preservedState) return null;
  
    logger.info('[PaymentStatusService] Attempting state recovery:', {
      flowId,
      preservedAt: preservedState.preservedAt,
      originalState: preservedState.status,
      timestamp: new Date().toISOString()
    });
  
    try {
      // Check if preserved state is still valid
      const isExpired = Date.now() - new Date(preservedState.preservedAt).getTime() > FLOW_PRESERVATION.TIMEOUT;
      if (isExpired) {
        logger.warn('[PaymentStatusService] Preserved state expired:', {
          flowId,
          preservedAt: preservedState.preservedAt,
          timestamp: new Date().toISOString()
        });
        this._preservedStates.delete(flowId);
        return null;
      }
  
      // Queue recovery if there are pending operations
      if (this._submissionStates.get(flowId)) {
        this._queueRecovery(flowId, preservedState);
        return null;
      }
  
      // Restore state
      return this._restoreState(flowId, preservedState);
    } catch (error) {
      logger.error('[PaymentStatusService] State recovery failed:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return null;
    }
  }
  
  _queueRecovery(flowId, state) {
    if (this._recoveryQueue.has(flowId)) return;
  
    logger.info('[PaymentStatusService] Queueing state recovery:', {
      flowId,
      originalState: state.status,
      timestamp: new Date().toISOString()
    });
  
    this._recoveryQueue.set(flowId, {
      state,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    });
  
    // Schedule recovery attempt
    setTimeout(() => this._processRecoveryQueue(flowId), 5000);
  }
  
  async _processRecoveryQueue(flowId) {
    const recovery = this._recoveryQueue.get(flowId);
    if (!recovery) return;
  
    recovery.attempts++;
    
    logger.info('[PaymentStatusService] Processing recovery queue:', {
      flowId,
      attempt: recovery.attempts,
      maxAttempts: recovery.maxAttempts,
      timestamp: new Date().toISOString()
    });
  
    try {
      const restored = await this._restoreState(flowId, recovery.state);
      if (restored) {
        this._recoveryQueue.delete(flowId);
        return restored;
      }
  
      // Schedule next attempt if needed
      if (recovery.attempts < recovery.maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, recovery.attempts), 15000);
        setTimeout(() => this._processRecoveryQueue(flowId), delay);
      } else {
        logger.error('[PaymentStatusService] Recovery attempts exceeded:', {
          flowId,
          attempts: recovery.attempts,
          timestamp: new Date().toISOString()
        });
        this._recoveryQueue.delete(flowId);
      }
    } catch (error) {
      logger.error('[PaymentStatusService] Recovery attempt failed:', {
        flowId,
        attempt: recovery.attempts,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async _restoreState(flowId, preservedState) {
    logger.info('[PaymentStatusService] Restoring preserved state:', {
      flowId,
      preservedAt: preservedState.preservedAt,
      status: preservedState.status,
      timestamp: new Date().toISOString()
    });
  
    // Restore all state components
    this._flowStates.set(flowId, preservedState.flowState);
    this._stateTransitions.set(flowId, preservedState.transitions || []);
    if (preservedState.submission) {
      this._submissionStates.set(flowId, preservedState.submission);
    }
  
    // Add restoration marker
    const restoredState = {
      ...preservedState,
      restoredAt: new Date().toISOString(),
      originalPreservation: preservedState.preservedAt
    };
  
    // Update payment state through existing mechanism
    await this.updateFlowState(flowId, restoredState);
  
    this._preservedStates.delete(flowId);
    return restoredState;
  }
  
  // Flow lifecycle management
  updateFlowLifecycle(flowId, lifecycle, metadata = {}) {
    const currentLifecycle = this._flowLifecycles.get(flowId);
    
    logger.info('[PaymentStatusService] Updating flow lifecycle:', {
      flowId,
      fromState: currentLifecycle?.state,
      toState: lifecycle,
      timestamp: new Date().toISOString()
    });
  
    const lifecycleState = {
      state: lifecycle,
      enteredAt: new Date().toISOString(),
      metadata: {
        ...currentLifecycle?.metadata,
        ...metadata
      }
    };
  
    this._flowLifecycles.set(flowId, lifecycleState);
  
    // Track as state transition
    this.trackFlowState(flowId, lifecycle, {
      type: 'lifecycle_change',
      ...metadata
    });
  
    return lifecycleState;
  }
  
  getFlowLifecycle(flowId) {
    return this._flowLifecycles.get(flowId);
  }
  
  // State transition validation
  validateTransition(flowId, fromState, toState) {
    const currentState = this._flowStates.get(flowId)?.state;
    
    logger.info('[PaymentStatusService] Validating state transition:', {
      flowId,
      fromState,
      toState,
      currentState,
      timestamp: new Date().toISOString()
    });
  
    // Prevent transitions from terminal states
    if (this._isTerminalState(fromState)) {
      logger.warn('[PaymentStatusService] Invalid transition from terminal state:', {
        flowId,
        fromState,
        toState,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    // Validate state sequence
    if (currentState && currentState !== fromState) {
      logger.error('[PaymentStatusService] State mismatch in transition:', {
        flowId,
        expectedState: fromState,
        actualState: currentState,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    return true;
  }

  
  // Enhanced error handling
  handleError(flowId, error, options = {}) {
    const state = this._flowStates.get(flowId);
    if (!state) return;
  
    logger.error('[PaymentStatusService] Handling flow error:', {
      flowId,
      error: error.message,
      currentState: state.state,
      timestamp: new Date().toISOString()
    });
  
    // Track error state
    const errorState = {
      error: error.message,
      occurredAt: new Date().toISOString(),
      recoverable: options.recoverable ?? true,
      state: state.state
    };
  
    if (!this._stateTransitions.has(flowId)) {
      this._stateTransitions.set(flowId, []);
    }
    this._stateTransitions.get(flowId).push({
      type: 'error',
      ...errorState
    });
  
    // Update lifecycle if error is fatal
    if (!errorState.recoverable) {
      this.updateFlowLifecycle(flowId, FLOW_LIFECYCLE_STATES.ERROR, {
        error: error.message,
        fatal: true
      });
    }
  
    return errorState;
  }

  _validatePriceDetails(priceDetails) {
    if (!priceDetails) return false;

    const amount = priceDetails.final || priceDetails.amount;
    return (
      amount !== undefined &&
      amount !== null &&
      !isNaN(amount) &&
      priceDetails.currency
    );
  }

  _normalizePriceDetails(priceDetails) {
    const amount = priceDetails.final || priceDetails.amount;
    return {
      amount: typeof amount === 'object' ? amount.amount || amount.value : amount,
      currency: priceDetails.currency,
      original: priceDetails
    };
  }

  _extractTimestamp(id) {
    if (!id) return null;
    const matches = id.match(/\d{13}/g);
    return matches ? matches[0] : null;
  }
  
  _findByTimestamp(id, collection) {
    const timestamp = this._extractTimestamp(id);
    if (!timestamp || !collection) return null;
    return Array.from(collection.keys())
      .find(key => key.includes(timestamp));
  }

  getPaymentState(bookingId) {
    let state = this.paymentStates.get(bookingId);
    
    if (!state) {
      logger.info('[PaymentStatusService] State requested for unknown payment:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return null;
    }
    
    const priceDetails = this.priceCache.get(bookingId);
    const uiState = this.uiStates.get(bookingId);
    
    return {
      ...state,
      ...uiState,
      priceDetails: priceDetails || {
        amount: state.amount,
        currency: state.currency
      }
    };
  }

  stopPolling(bookingId) {
    const polling = this.activePolling.get(bookingId);
    if (polling) {
      logger.info('[PaymentStatusService] Stopping polling:', {
        bookingId,
        duration: Date.now() - polling.startTime,
        errorCount: polling.errorCount || 0,
        timestamp: new Date().toISOString()
      });

      if (polling.id) {
        clearInterval(polling.id);
      }
      if (polling.controller) {
        polling.controller.abort();
      }
      this.activePolling.delete(bookingId);
    }
  }

  cleanup(bookingId, flowId) {
    logger.info('[PaymentStatusService] Cleaning up payment tracking:', {
      bookingId,
      hadState: this.paymentStates.has(bookingId),
      hadPolling: this.activePolling.has(bookingId),
      timestamp: new Date().toISOString()
    });

    this.stopPolling(bookingId);
    this.paymentStates.delete(bookingId);
    this.priceCache.delete(bookingId);
    this.stateSubscriptions.cleanup(bookingId);
    this.uiStates.delete(bookingId);
    this.flowSubscribers.delete(bookingId);

    if (flowId) {
      this._flowStates.delete(flowId);
      this._stateTransitions.delete(flowId);
      this._submissionStates.delete(flowId);
      this._flowLifecycles.delete(flowId);
      this._preservedStates.delete(flowId);
    }
  
    logger.info('[PaymentStatusService] Completed state cleanup:', {
      bookingId,
      flowId,
      timestamp: new Date().toISOString()
    });
  }

  _updatePaymentState(bookingId, status) {
    logger.info('[PaymentStatusService] Updating payment state:', {
      bookingId,
      status,
      currentState: this.paymentStates.get(bookingId),
      timestamp: new Date().toISOString()
    });
    const currentState = this.paymentStates.get(bookingId);
    if (!currentState) return;

    const priceDetails = this.priceCache.get(bookingId);
    const updatedState = {
      ...currentState,
      status: status.state,
      lastUpdated: Date.now(),
      amount: priceDetails?.final || currentState.amount,
      currency: priceDetails?.currency || currentState.currency,
      updates: [...currentState.updates, {
        status: status.state,
        timestamp: Date.now()
      }]
    };

    this.paymentStates.set(bookingId, updatedState);
  }

  async subscribeToState(flowId, callback) {
    logger.info('[PaymentStatusService] Setting up state subscription:', {
      flowId,
      hasExistingState: this.paymentStates.has(flowId),
      hasStateManager: !!this.stateSubscriptions,
      timestamp: new Date().toISOString()
    });
  
    logger.info('[PaymentStatusService] Subscription request:', {
      flowId,
      stateExists: this.paymentStates.has(flowId),
      stateDetails: this.paymentStates.get(flowId) || 'none',
      timestamp: new Date().toISOString()
    });
  
    await this.waitForStateReadiness(flowId);
    
    const currentState = this.paymentStates.get(flowId) || null;
    logger.info('[PaymentStatusService] Preparing subscription:', {
      flowId,
      currentState: currentState ? {
        status: currentState.status,
        modalState: currentState.metadata?.modalState,
        paymentStep: currentState.metadata?.paymentStep
      } : 'null',
      timestamp: new Date().toISOString()
    });
  
    try {
      const unsubscribe = this.stateSubscriptions.subscribe(flowId, callback, {
        emitCurrent: true,
        initialState: currentState
      });
  
      return typeof unsubscribe === 'function' ? unsubscribe : () => {
        logger.debug('[PaymentStatusService] Executing fallback unsubscribe:', {
          flowId,
          timestamp: new Date().toISOString()
        });
      };
    } catch (error) {
      logger.error('[PaymentStatusService] Subscription setup failed:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      return () => {
        logger.debug('[PaymentStatusService] Executing error case unsubscribe:', {
          flowId,
          timestamp: new Date().toISOString()
        });
      };
    }
  }
  
  _publishStateUpdate(flowId, state, options = {}) {
    if (!stateInitPromise.has(flowId) && !this.paymentStates.has(flowId)) {
      logger.warn('[PaymentStatusService] Attempted to publish before state ready:', {
        flowId,
        status: state.status,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    logger.info('[PaymentStatusService] Publishing state update:', {
      flowId,
      status: state.status,
      hasSubscribers: this.stateSubscriptions._subscribers.has(flowId),
      subscriberCount: this.stateSubscriptions._subscribers.get(flowId)?.size || 0,
      timestamp: new Date().toISOString()
    });
    
    const result = this.stateSubscriptions.publish(flowId, state, options);
  
    logger.info('[PaymentStatusService] State publish completed:', {
      flowId,
      status: state.status,
      modalState: state.metadata?.modalState,
      paymentStep: state.metadata?.paymentStep,
      published: result,
      timestamp: new Date().toISOString()
    });
  
    return result;
  }

  _notifySubscribers(flowId, state, options = {}) {
    logger.info('[PaymentStatusService] Notifying subscribers:', {
      flowId,
      status: state?.status,
      hasStateSubscriptions: !!this.stateSubscriptions,
      timestamp: new Date().toISOString()
    });
  
    if (!this.stateSubscriptions) {
      logger.debug('[PaymentStatusService] No state subscription manager', {
        flowId,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  
    try {
      // Use the StateSubscriptionManager to publish the state
      return this.stateSubscriptions.publish(flowId, state, {
        source: 'status_service',
        ...options
      });
    } catch (error) {
      logger.error('[PaymentStatusService] Error notifying subscribers:', {
        flowId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }
  
  _removeSubscriber(bookingId, callback) {
    const subscribers = this.subscribers.get(bookingId);
    if (subscribers?.has(callback)) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscribers.delete(bookingId);
        this.stopPolling(bookingId);
      }
    }
  }

  _isTerminalState(state) {
    return [
      PAYMENT_STATES.SUCCEEDED,
      PAYMENT_STATES.FAILED,
      PAYMENT_STATES.CANCELLED
    ].includes(state);
  }

  async _checkPaymentStatus(bookingId) {
    // Implementation remains the same
    return {
      state: PAYMENT_STATES.PROCESSING,
      timestamp: new Date().toISOString()
    };
  }
}

const instance = new PaymentStatusService();
/*logger.info('[PaymentStatusService] Creating singleton instance:', {
  hasInstance: !!instance,
  hasPaymentStates: !!instance.paymentStates,
  paymentStatesType: typeof instance.paymentStates,
  timestamp: new Date().toISOString()
});*/
Object.freeze(instance);
Object.freeze(instance);
export { PaymentStatusService, instance as default };