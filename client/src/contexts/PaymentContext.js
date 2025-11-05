import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { logger } from '../utils/logger';
import { subscribeToStatusUpdates } from '../services/socketService';
import PaymentDataService from '../services/PaymentDataService';
import { PaymentOrchestrator } from '../services/PaymentOrchestratorService';
import { 
  PAYMENT_STATES, 
  MODAL_STATES, 
  FLOW_STATES, 
  FLOW_LIFECYCLE_STATES 
} from '../constants/paymentConstants';
import { loadStripe } from '@stripe/stripe-js';

export const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

logger.info('[APP STARTUP] PaymentContext.js module loaded, stripePromise created. This should appear once on page load.');

stripePromise
  .then((stripe) => {
    logger.info('[PaymentContext] stripePromise resolved successfully. Stripe.js is loaded and ready.', {
      hasStripe: !!stripe,
      timestamp: new Date().toISOString(),
    });
  })
  .catch((error) => {
    logger.error('[PaymentContext] stripePromise initialization failed', {
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  });

const LOCK_OPERATIONS = {
  INIT: 'initialization',
  UPDATE: 'status_update',
  PAYMENT: 'payment_processing',
  REFUND: 'refund_processing'
};

const PAYMENT_CLEANUP_DELAY = 5000; // 5s delay for cleanup
const PAYMENT_LOCK_TIMEOUT = 10000; // 10s timeout for locks
const PRESERVATION_TIMEOUT = 300000; // 5 minutes
const preservedFlows = new Map();
const initializationLocks = new Map();

stripePromise
  .then((stripe) => {
    logger.info('[PaymentContext] stripePromise resolved successfully', {
      hasStripe: !!stripe,
      timestamp: new Date().toISOString(),
    });
  })
  .catch((error) => {
    logger.error('[PaymentContext] stripePromise initialization failed', {
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  });

const acquireInitLock = async (bookingId) => {
  const existingLock = initializationLocks.get(bookingId);
  if (existingLock) {
    logger.info('[PaymentContext] Init lock exists:', {
      bookingId,
      lockTime: existingLock.timestamp,
      timestamp: new Date().toISOString()
    });
    return existingLock.id;
  }

  const lockId = `${bookingId}-${Date.now()}`;
  initializationLocks.set(bookingId, {
    id: lockId,
    timestamp: Date.now()
  });
  return lockId;
};

const releaseInitLock = (lockId) => {
  const [bookingId] = lockId.split('-');
  const lock = initializationLocks.get(bookingId);
  if (lock?.id === lockId) {
    initializationLocks.delete(bookingId);
  }
};

const PAYMENT_LIFECYCLE = {
  INIT: 'initialization',
  SOCKET_CONNECT: 'socket_connection',
  INTENT_CREATION: 'intent_creation',
  PROCESSING: 'processing',
  CONFIRMATION: 'confirmation',
  COMPLETION: 'completion',
  CLEANUP: 'cleanup'
};

const PaymentContext = createContext(null);

const usePayment = () => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};

const initialState = {
  activePayments: new Map(),
  paymentMethods: [],
  processingPayments: new Set(),
  optimisticUpdates: new Map(),
  lastError: null,
  isInitialized: false,
  activeFlows: new Map(),  // Track active payment flows
  flowHistory: new Map(),   // Track completed flows
  pendingFlows: new Map(),
  paymentLocks: new Map(),
  lifecycleStates: new Map(),
  socketStates: new Map(),
  retryAttempts: new Map(),
  pendingTimeouts: new Map()
};

const PAYMENT_LOCKS = new Map(); // Track payment operation locks
const LOCK_TIMEOUT = 5000; // 5 seconds max lock duration

const paymentReducer = (state, action) => {
  logger.debug('[PaymentContext] Processing action:', {
    type: action.type,
    payload: action.payload ? {
      ...action.payload,
      sensitiveData: undefined
    } : null,
    timestamp: new Date().toISOString()
  });

  // Add lock protection for status updates
  if (action.type === 'UPDATE_PAYMENT_STATUS') {
    const { bookingId, status } = action.payload;
    const currentPayment = state.activePayments.get(bookingId);
    
    if (currentPayment?.status === status) {
      logger.debug('[PaymentContext] Skipping duplicate status update:', {
        bookingId,
        status,
        timestamp: new Date().toISOString()
      });
      return state;
    }
  }

  switch (action.type) {
    case 'INITIALIZE_PAYMENT': {
      const existing = state.activePayments.get(action.payload.bookingId);
      if (existing && !['failed', 'cancelled'].includes(existing.status)) {
        logger.warn('[PaymentContext] Payment already initialized:', {
          bookingId: action.payload.bookingId,
          status: existing.status,
          timestamp: new Date().toISOString()
        });
        return state;
      }
    
      logger.info('[PaymentContext] Initializing payment:', {
        bookingId: action.payload.bookingId,
        flowId: action.payload.flowId,
        amount: action.payload.amount,
        currency: action.payload.currency,
        timestamp: new Date().toISOString()
      });
    
      const lifecycleStates = new Map(state.lifecycleStates);
      lifecycleStates.set(action.payload.bookingId, {
        lifecycle: PAYMENT_LIFECYCLE.INIT,
        startedAt: new Date().toISOString(),
        priceData: {
          amount: action.payload.amount,
          currency: action.payload.currency,
          timestamp: Date.now()
        }
      });
    
      return {
        ...state,
        activePayments: new Map(state.activePayments).set(action.payload.bookingId, {
          status: 'initializing',
          paymentIntent: action.payload.paymentIntent,
          amount: action.payload.amount,
          currency: action.payload.currency,
          metadata: action.payload.metadata,
          priceData: {
            amount: action.payload.amount,
            currency: action.payload.currency,
            timestamp: Date.now()
          },
          retryCount: 0,
          flowId: action.payload.flowId,
          timestamp: Date.now()
        }),
        lifecycleStates
      };
    }
      
    case 'VALIDATE_INITIALIZATION':
        const existingPayment = state.activePayments.get(action.payload.bookingId);
        if (existingPayment && !['failed', 'cancelled'].includes(existingPayment.status)) {
          logger.warn('[PaymentContext] Preventing duplicate initialization:', {
            bookingId: action.payload.bookingId,
            existingStatus: existingPayment.status,
            timestamp: new Date().toISOString()
          });
          return state;
        }
        return state;

    case 'UPDATE_PAYMENT_STATUS':
      const payment = state.activePayments.get(action.payload.bookingId);
      if (!payment) return state;

      const updatedPayments = new Map(state.activePayments);
      updatedPayments.set(action.payload.bookingId, {
        ...payment,
        status: action.payload.status,
        lastUpdate: Date.now(),
        error: action.payload.error || null
      });

      return {
        ...state,
        activePayments: updatedPayments,
        lastError: action.payload.error || state.lastError
      };

    case 'TRACK_FLOW':
        const { flowId, bookingId: flowBookingId, status: flowStatus } = action.payload;
        const updatedFlows = new Map(state.activeFlows);
        const updatedHistory = new Map(state.flowHistory);
  
        if (flowStatus === FLOW_STATES.COMPLETED || 
            flowStatus === FLOW_STATES.FAILED || 
            flowStatus === FLOW_STATES.CANCELLED) {
          // Move to history
          updatedFlows.delete(flowId);
          updatedHistory.set(flowId, {
            bookingId: flowBookingId,
            status: flowStatus,
            completedAt: Date.now()
          });
        } else {
          // Update active flows
          updatedFlows.set(flowId, {
            bookingId: flowBookingId,
            status: flowStatus,
            startedAt: Date.now()
          });
        }
  
        return {
          ...state,
          activeFlows: updatedFlows,
          flowHistory: updatedHistory
        };

    case 'SET_PAYMENT_METHODS':
      return {
        ...state,
        paymentMethods: action.payload,
        isInitialized: true
      };

      case 'INITIALIZE_PAYMENT': {
        const existing = state.activePayments.get(action.payload.bookingId);
        if (existing && !['failed', 'cancelled'].includes(existing.status)) {
          if (action.payload.metadata?.preserveOnUnmount) {
            logger.info('[PaymentContext] Preserving existing payment:', {
              bookingId: action.payload.bookingId,
              flowId: existing.flowId,
              timestamp: new Date().toISOString()
            });
          }
          return state;
        }
      }

    case 'START_PROCESSING':
      const updatedProcessing = new Set(state.processingPayments);
      updatedProcessing.add(action.payload.bookingId);
      return {
        ...state,
        processingPayments: updatedProcessing
      };

      case 'PRESERVE_FLOW': {
        const { bookingId, flowId, metadata } = action.payload;
        
        logger.info('[PaymentContext] Preserving flow state:', {
          bookingId,
          flowId,
          activeFlow: state.activeFlows.get(flowId),
          timestamp: new Date().toISOString()
        });
  
        const flow = state.activeFlows.get(flowId);
        if (!flow) return state;
  
        preservedFlows.set(flowId, {
          ...flow,
          preservedAt: new Date().toISOString(),
          metadata,
          expiresAt: Date.now() + PRESERVATION_TIMEOUT
        });
  
        return state;
      }
  
      case 'RECOVER_FLOW': {
        const { bookingId } = action.payload;
        const preservedFlow = Array.from(preservedFlows.values())
          .find(flow => flow.bookingId === bookingId && flow.expiresAt > Date.now());
  
        if (!preservedFlow) return state;
  
        logger.info('[PaymentContext] Recovering preserved flow:', {
          bookingId,
          flowId: preservedFlow.id,
          preservedAt: preservedFlow.preservedAt,
          timestamp: new Date().toISOString()
        });
  
        return {
          ...state,
          activeFlows: new Map(state.activeFlows).set(preservedFlow.id, preservedFlow),
          flowHistory: new Map(state.flowHistory),
          lifecycleStates: new Map(state.lifecycleStates).set(bookingId, {
            lifecycle: preservedFlow.lifecycle,
            recoveredAt: new Date().toISOString()
          })
        };
      }

    case 'END_PROCESSING':
      const newProcessing = new Set(state.processingPayments);
      newProcessing.delete(action.payload.bookingId);
      return {
        ...state,
        processingPayments: newProcessing
      };

    case 'OPTIMISTIC_UPDATE':
  const optimisticPayments = new Map(state.activePayments);
  const currentPayment = optimisticPayments.get(action.payload.bookingId);
  
  if (currentPayment) {
    optimisticPayments.set(action.payload.bookingId, {
      ...currentPayment,
      status: action.payload.status,
      optimistic: true,
      originalStatus: currentPayment.status,
      timestamp: Date.now()
    });

    return {
      ...state,
      activePayments: optimisticPayments,
      optimisticUpdates: new Map(state.optimisticUpdates).set(action.payload.bookingId, {
        status: action.payload.status,
        timestamp: Date.now()
      })
    };
  }
  return state;

    case 'REVERT_OPTIMISTIC':
  const revertedPayments = new Map(state.activePayments);
  const optimisticPayment = revertedPayments.get(action.payload.bookingId);
  
  if (optimisticPayment?.optimistic) {
    revertedPayments.set(action.payload.bookingId, {
      ...optimisticPayment,
      status: optimisticPayment.originalStatus,
      optimistic: false
    });
  }

  const updatedOptimistic = new Map(state.optimisticUpdates);
  updatedOptimistic.delete(action.payload.bookingId);

  return {
    ...state,
    activePayments: revertedPayments,
    optimisticUpdates: updatedOptimistic
  };

    case 'CLEAR_PAYMENT':
      const clearedPayments = new Map(state.activePayments);
      clearedPayments.delete(action.payload.bookingId);
      return {
        ...state,
        activePayments: clearedPayments
      };
   
    case 'PREPARE_PAYMENT_FLOW':
        return {
          ...state,
          pendingFlows: new Map(state.pendingFlows).set(action.payload.bookingId, {
            status: 'preparing',
            timestamp: Date.now()
          })
        };

    case 'SET_LIFECYCLE_STATE': {
          const { bookingId, lifecycle, metadata = {} } = action.payload;
          logger.info('[PaymentContext] Setting lifecycle state:', {
            bookingId,
            lifecycle,
            previousState: state.lifecycleStates.get(bookingId)?.lifecycle,
            timestamp: new Date().toISOString()
          });
      
          const lifecycleStates = new Map(state.lifecycleStates);
          lifecycleStates.set(bookingId, {
            lifecycle,
            updatedAt: new Date().toISOString(),
            ...metadata
          });
      
          return {
            ...state,
            lifecycleStates
          };
        }
      
    case 'SET_SOCKET_STATE': {
          const { bookingId, connected, error = null } = action.payload;
          const socketStates = new Map(state.socketStates);
          socketStates.set(bookingId, {
            connected,
            error,
            updatedAt: new Date().toISOString()
          });
      
          return {
            ...state,
            socketStates
          };
        }
      
    case 'INCREMENT_RETRY': {
          const { bookingId } = action.payload;
          const currentAttempts = state.retryAttempts.get(bookingId) || 0;
          const retryAttempts = new Map(state.retryAttempts);
          retryAttempts.set(bookingId, currentAttempts + 1);
      
          return {
            ...state,
            retryAttempts
          };
        }
      
    case 'CLEAR_PAYMENT_STATE': {
          const { bookingId } = action.payload;
          const activePayments = new Map(state.activePayments);
          const lifecycleStates = new Map(state.lifecycleStates);
          const socketStates = new Map(state.socketStates);
          const retryAttempts = new Map(state.retryAttempts);
          const pendingTimeouts = new Map(state.pendingTimeouts);
      
          // Clear all state for this payment
          activePayments.delete(bookingId);
          lifecycleStates.delete(bookingId);
          socketStates.delete(bookingId);
          retryAttempts.delete(bookingId);
      
          // Clear any pending timeouts
          const timeout = pendingTimeouts.get(bookingId);
          if (timeout) {
            clearTimeout(timeout);
            pendingTimeouts.delete(bookingId);
          }
      
          return {
            ...state,
            activePayments,
            lifecycleStates,
            socketStates,
            retryAttempts,
            pendingTimeouts
          };
        }
     
    
    case 'RESET':
      return initialState;

    default:
      return state;
  }
};

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

const validatePaymentAmount = (amount, currency) => {
  try {
    if (typeof amount === 'object' && amount !== null) {
      logger.debug('[PaymentContext] Validating structured amount:', {
        amount,
        timestamp: new Date().toISOString()
      });

      const formatted = PaymentDataService.validatePriceData(amount);
      return {
        isValid: true,
        amount: formatted.amount,
        currency: formatted.currency
      };
    }

    if (amount === undefined || amount === null || isNaN(amount)) {
      return {
        isValid: false,
        error: 'Invalid payment amount'
      };
    }

    return {
      isValid: true,
      amount: Number(amount),
      currency
    };
  } catch (error) {
    logger.error('[PaymentContext] Amount validation failed:', {
      error: error.message,
      amount,
      currency,
      timestamp: new Date().toISOString()
    });
    return {
      isValid: false,
      error: error.message
    };
  }
};

const PaymentProvider = ({ children }) => {
  logger.info('[PaymentProvider] Initializing provider');

  const [state, dispatch] = useReducer(paymentReducer, initialState);

  const initializePayment = useCallback(async (bookingId, amount, currency, metadata = {}) => {
    if (!PaymentOrchestrator._acquireLockWithTracking(bookingId, LOCK_OPERATIONS.INIT)) {
      logger.warn('[PaymentContext] Initialization blocked - operation in progress:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return null;
    }

    try {
      const priceValidation = validatePaymentAmount(amount, currency);
      if (!priceValidation.isValid) {
        throw new Error(priceValidation.error);
      }

      const flow = await PaymentOrchestrator.initializePayment({
        flowId: bookingId,
        amount: priceValidation.amount,
        currency: priceValidation.currency || currency,
        metadata: {
          ...metadata,
          priceData: {
            amount: priceValidation.amount,
            currency,
            original: amount
          },
          preserveOnUnmount: metadata.preserveOnUnmount || false
        }
      });

      dispatch({
        type: 'INITIALIZE_PAYMENT',
        payload: {
          bookingId,
          amount: priceValidation.amount,
          currency,
          flowId: flow.id,
          metadata
        }
      });

      return flow.id;
    } catch (error) {
      logger.error('[PaymentContext] Payment initialization failed:', {
        bookingId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    } finally {
      PaymentOrchestrator.releaseLock(bookingId, LOCK_OPERATIONS.INIT);
    }
  }, []);

  const handlePaymentCleanup = useCallback((bookingId, reason = 'manual') => {
    if (!acquireLock(bookingId, 'cleanup')) {
      logger.warn('[PaymentContext] Cleanup blocked - operation in progress:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      PaymentOrchestrator.handleCleanup(bookingId, {
        source: 'payment_context',
        reason,
        metadata: {
          hadActivePayment: state.activePayments.has(bookingId),
          status: state.activePayments.get(bookingId)?.status
        }
      });

      dispatch({
        type: 'CLEAR_PAYMENT_STATE',
        payload: { bookingId }
      });
    } finally {
      releaseLock(bookingId, 'cleanup');
    }
  }, [state.activePayments]);

  useEffect(() => {
    const subscriptions = new Map();
    state.activePayments.forEach((payment, bookingId) => {
      const unsubscribe = PaymentOrchestrator.subscribeToState(bookingId, (newState) => {
        dispatch({
          type: 'UPDATE_PAYMENT_STATUS',
          payload: {
            bookingId,
            status: newState.status,
            error: newState.error
          }
        });
      });
      subscriptions.set(bookingId, unsubscribe);
    });

    return () => {
      subscriptions.forEach((unsubscribe, bookingId) => unsubscribe?.());
    };
  }, [state.activePayments]);

const updatePaymentStatus = useCallback((bookingId, status, error) => {
    PaymentOrchestrator.updateFlow(bookingId, { status, metadata: { error } });
  }, []);

  const getPaymentStatus = useCallback((bookingId) => {
    return state.activePayments.get(bookingId)?.status;
  }, [state.activePayments]);

  const getActiveFlow = useCallback((bookingId) => {
    return PaymentOrchestrator.getActiveFlowId(bookingId);
  }, []);

  const value = useMemo(() => ({
    state,
    dispatch,
    initializePayment,
    updatePaymentStatus,
    clearPayment: handlePaymentCleanup,
    handleCleanup: handlePaymentCleanup,
    getPaymentStatus,
    getActiveFlow,
    stripePromise,
  }), [
    state,
    dispatch,
    initializePayment,
    updatePaymentStatus,
    handlePaymentCleanup,
    getPaymentStatus,
    getActiveFlow
  ]);

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};

export { PaymentProvider, PaymentContext, usePayment };