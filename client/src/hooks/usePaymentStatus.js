import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import paymentAPI from '../services/paymentAPI';
import { subscribeToStatusUpdates } from '../services/socketService';
import { usePayment } from '../contexts/PaymentContext';
import PaymentFlowService from '../services/PaymentFlowService';
import PaymentSocketService from '../services/PaymentSocketService';
import { PaymentOrchestrator } from '../services/PaymentOrchestratorService';
import { PAYMENT_STATES } from '../constants/paymentConstants';

const MAX_POLLING_RETRIES = 5;
const DEFAULT_POLLING_INTERVAL = 3000;

export const usePaymentStatus = (bookingId) => {
  const { t } = useTranslation(['payments']);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const pollingTimeoutRef = useRef(null);
  const { updatePaymentStatus } = usePayment();
  const activeFlowIdRef = useRef(null);
  const queryClient = useQueryClient();
  const socketSubscriptionRef = useRef(null);

  logger.debug('[usePaymentStatus] Initializing hook:', {
    bookingId,
    isPolling,
    retryCount,
    timestamp: new Date().toISOString()
  });

  const clearPollingTimeout = useCallback(() => {
    if (pollingTimeoutRef.current) {
      logger.debug('[usePaymentStatus] Clearing polling timeout:', {
        bookingId,
        flowId: activeFlowIdRef.current,
        timestamp: new Date().toISOString()
      });
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, [bookingId]);

  const stopPolling = useCallback(() => {
    logger.info('[usePaymentStatus] Stopping status polling:', {
      bookingId,
      flowId: activeFlowIdRef.current,
      wasPolling: isPolling,
      timestamp: new Date().toISOString()
    });

    setIsPolling(false);
    setRetryCount(0);
    clearPollingTimeout();
    activeFlowIdRef.current = null;
  }, [bookingId, isPolling, clearPollingTimeout]);

  useEffect(() => {
    if (!bookingId) return;
  
    const handleFlowUpdate = (event) => {
      const { detail } = event;
      if (detail.bookingId !== bookingId) return;
  
      logger.debug('[useUnifiedPayment] Received flow update:', {
        bookingId,
        status: detail.status,
        previousStatus: detail.previousStatus,
        timestamp: detail.timestamp
      });
  
      // Update payment context with new status
      updatePaymentStatus(bookingId, detail.status, {
        ...detail.metadata,
        flowId: detail.flowId,
        timestamp: detail.timestamp
      });
  
      // Handle terminal states
      if (['succeeded', 'failed', 'cancelled', 'expired'].includes(detail.status)) {
        stopPolling();
        queryClient.invalidateQueries(['payment', 'status', bookingId]);
      }
    };
  
    window.addEventListener('payment_flow_update', handleFlowUpdate);
    return () => window.removeEventListener('payment_flow_update', handleFlowUpdate);
  }, [bookingId, updatePaymentStatus, stopPolling, queryClient]);

  const setupPaymentSubscription = useCallback((targetBookingId) => {
    logger.info('[usePaymentStatus] Setting up payment subscription:', {
      bookingId: targetBookingId,
      hasExistingSubscription: !!socketSubscriptionRef.current,
      timestamp: new Date().toISOString()
    });
  
    // Cleanup existing subscription if any
    if (typeof socketSubscriptionRef.current === 'function') {
      logger.debug('[usePaymentStatus] Cleaning up existing subscription');
      socketSubscriptionRef.current();
      socketSubscriptionRef.current = null;
    }
  
    if (!targetBookingId) {
      logger.warn('[usePaymentStatus] Cannot setup subscription - no bookingId provided');
      return;
    }
  
    const callbacks = {
      'payment_status': (data) => {
        logger.debug('[usePaymentStatus] Received socket status update:', {
          bookingId: targetBookingId,
          status: data.status,
          timestamp: new Date().toISOString()
        });
  
        queryClient.setQueryData(['payment', 'status', targetBookingId], {
          ...data,
          timestamp: new Date().toISOString()
        });
  
        updatePaymentStatus(targetBookingId, data.status, {
          ...data,
          source: 'socket',
          timestamp: new Date().toISOString()
        });
  
        if (['succeeded', 'failed', 'cancelled'].includes(data.status)) {
          stopPolling();
          queryClient.invalidateQueries(['payment', 'status', targetBookingId]);
        }
      },
      'payment_error': (error) => {
        logger.error('[usePaymentStatus] Received socket error:', {
          bookingId: targetBookingId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        setError(error);
      }
    };
  
    try {
      const unsubscribe = PaymentSocketService.subscribeToPayment(targetBookingId, callbacks);
      
      // Store the unsubscribe function
      socketSubscriptionRef.current = unsubscribe;
      
      logger.info('[usePaymentStatus] Payment subscription setup complete:', {
        bookingId: targetBookingId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('[usePaymentStatus] Socket subscription failed:', {
        bookingId: targetBookingId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      socketSubscriptionRef.current = null;
    }
  }, [queryClient, updatePaymentStatus, stopPolling]);


  const checkPaymentStatus = useCallback(async (options = {}) => {
    const { interval = DEFAULT_POLLING_INTERVAL, maxAttempts = MAX_POLLING_RETRIES } = options;
    
    if (!bookingId || !isPolling) {
      logger.debug('[usePaymentStatus] Skipping status check:', {
        bookingId,
        flowId: activeFlowIdRef.current,
        reason: !bookingId ? 'no bookingId' : 'polling stopped',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (activeFlowIdRef.current !== options.flowId) {
      logger.warn('[usePaymentStatus] Skipping status check - flow ID mismatch:', {
        bookingId,
        currentFlowId: activeFlowIdRef.current,
        requestedFlowId: options.flowId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const status = await PaymentOrchestrator.getFlowStatus(activeFlowIdRef.current);
      
      if (!status) {
        throw new Error('Invalid status response');
      }

      logger.info('[usePaymentStatus] Payment status updated:', {
        bookingId,
        flowId: activeFlowIdRef.current,
        status: status.status,
        timestamp: new Date().toISOString()
      });

      updatePaymentStatus(bookingId, status.status, {
        ...status,
        flowId: activeFlowIdRef.current
      });

      // Handle terminal states
      if ([PAYMENT_STATES.SUCCEEDED, PAYMENT_STATES.FAILED, PAYMENT_STATES.CANCELLED].includes(status.status)) {
        logger.info('[usePaymentStatus] Payment reached terminal state:', {
          bookingId,
          flowId: activeFlowIdRef.current,
          status: status.status,
          timestamp: new Date().toISOString()
        });
        stopPolling();
        return;
      }

      // Continue polling for non-terminal states
      if (isPolling) {
        pollingTimeoutRef.current = setTimeout(
          () => checkPaymentStatus(options),
          interval
        );
      }

    } catch (error) {
      logger.error('[usePaymentStatus] Error checking payment status:', {
        bookingId,
        flowId: activeFlowIdRef.current,
        error: error.message,
        retryCount,
        timestamp: new Date().toISOString()
      });

      if (error.response?.status === 404 || retryCount >= maxAttempts) {
        stopPolling();
        updatePaymentStatus(bookingId, PAYMENT_STATES.FAILED, {
          message: error.response?.status === 404 ? 'Payment not found' : 'Payment status check failed',
          code: error.response?.status === 404 ? 'payment_not_found' : 'payment_status_check_failed',
          retries: retryCount,
          originalError: error,
          timestamp: new Date().toISOString()
        });
        return;
      }

      setRetryCount(prev => prev + 1);
      const backoffDelay = interval * Math.pow(2, retryCount);
      
      logger.info('[usePaymentStatus] Scheduling retry:', {
        bookingId,
        attempt: retryCount + 1,
        delay: backoffDelay,
        timestamp: new Date().toISOString()
      });

      pollingTimeoutRef.current = setTimeout(
        () => checkPaymentStatus(options),
        backoffDelay
      );
    }
  }, [bookingId, isPolling, retryCount, updatePaymentStatus, stopPolling]);

  const startPolling = useCallback((newBookingId, options = {}) => {
    const { flowId, interval, maxAttempts } = options;

    if (!PaymentSocketService.isConnectionHealthy().connected) {
      logger.info('[useUnifiedPayment] Socket unhealthy, relying on polling:', {
        bookingId: newBookingId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate flow before starting polling
    const isValidFlow = PaymentFlowService.ensureFlowValidity(newBookingId);
    if (!isValidFlow) {
      logger.warn('[useUnifiedPayment] Cannot start polling - invalid flow:', {
        bookingId: newBookingId,
        flowId,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Prevent multiple polling sessions for the same flow
    if (isPolling && activeFlowIdRef.current === flowId) {
      logger.warn('[useUnifiedPayment] Polling already active for flow:', {
        bookingId: newBookingId,
        flowId,
        currentFlowId: activeFlowIdRef.current,
        timestamp: new Date().toISOString()
      });
      return;
    }
  
    // Stop any existing polling before starting new
    if (isPolling) {
      logger.info('[useUnifiedPayment] Stopping existing polling before starting new:', {
        bookingId: newBookingId,
        oldFlowId: activeFlowIdRef.current,
        newFlowId: flowId,
        timestamp: new Date().toISOString()
      });
      stopPolling();
    }
  
    logger.info('[useUnifiedPayment] Starting payment status polling:', {
      bookingId: newBookingId,
      flowId,
      interval,
      maxAttempts,
      timestamp: new Date().toISOString()
    });
  
    // Store the new flow ID
    activeFlowIdRef.current = flowId;
    
    setIsPolling(true);
    setRetryCount(0);
    clearPollingTimeout();
  
    // Add initial status check with slight delay to avoid race conditions
    setTimeout(() => {
      checkPaymentStatus({
        interval: interval || DEFAULT_POLLING_INTERVAL,
        maxAttempts: maxAttempts || MAX_POLLING_RETRIES,
        flowId
      });
    }, 100);
  }, [checkPaymentStatus, clearPollingTimeout, isPolling, stopPolling]);

  // Cleanup on unmount or bookingId change
  useEffect(() => {
    return () => {
      if (isPolling) {
        logger.info('[useUnifiedPayment] Cleaning up payment polling:', {
          bookingId,
          flowId: activeFlowIdRef.current,
          timestamp: new Date().toISOString()
        });
        stopPolling();
      }
    };
  }, [bookingId, isPolling, stopPolling]);


  // Main payment status query
  const {
    data: paymentStatus,
    isLoading: isLoadingStatus,
    error: statusError
  } = useQuery(
    ['payment', 'status', bookingId],
    () => paymentAPI.getPaymentStatus(bookingId),
    {
      enabled: !!bookingId,
      staleTime: 3000, // Consider data fresh for 3 seconds
      cacheTime: 5 * 60 * 1000, // Cache for 5 minutes
      
      // Refined polling logic
      refetchInterval: (data, query) => {
        // Stop polling if we're not in polling mode
        if (!isPolling) {
          return false;
        }
  
        // Stop polling if we have a 404 error
        if (query.state.error?.response?.status === 404) {
          stopPolling();
          return false;
        }
  
        // Don't poll for terminal or uninitialized states
        if (data?.status) {
          const isTerminalState = ['succeeded', 'failed', 'cancelled'].includes(data.status);
          const isNotInitialized = data.status === 'not_initialized';
          
          if (isTerminalState || isNotInitialized) {
            stopPolling();
            return false;
          }
        }
  
        // Continue polling for active states
        return 3000;
      },
  
      // Error retry logic
      retry: (failureCount, error) => {
        // Don't retry on 404s
        if (error.response?.status === 404) {
          stopPolling();
          return false;
        }
        
        // Limit retries for other errors
        return failureCount < 3;
      },
  
      // Success handling
      onSuccess: (data) => {
        logger.debug('[useUnifiedPayment] Payment status updated:', {
          bookingId,
          status: data.status,
          hasPaymentMethod: !!data.paymentMethod,
          timestamp: new Date().toISOString()
        });
  
        // Stop polling on terminal states
        if (['succeeded', 'failed', 'cancelled'].includes(data.status)) {
          stopPolling();
        }
  
        // Update payment context
        updatePaymentStatus(bookingId, data.status, {
          ...data,
          timestamp: new Date().toISOString()
        });
      },
  
      // Error handling
      onError: (error) => {
        logger.error('[useUnifiedPayment] Error fetching payment status:', {
          error: error.message,
          bookingId,
          timestamp: new Date().toISOString()
        });
  
        // Stop polling and set error state
        stopPolling();
        setError(error);
      }
    }
  );

  // Payment intent creation mutation
  const createPaymentIntent = useMutation(
    (data) => paymentAPI.createPaymentIntent(data),
    {
      onSuccess: (data) => {
        logger.info('[useUnifiedPayment] Payment intent created:', {
          bookingId: data.bookingId,
          status: data.status
        });
        queryClient.invalidateQueries(['payment', 'status', bookingId]);
        startPolling();
      },
      onError: (error) => {
        logger.error('[useUnifiedPayment] Error creating payment intent:', {
          error: error.message,
          bookingId
        });
        setError(error);
        toast.error(t('payments:errorCreatingPaymentIntent'));
      }
    }
  );

  // Payment confirmation mutation
  const confirmPayment = useMutation(
    ({ paymentIntentId, paymentMethodId }) =>
      paymentAPI.confirmPayment(paymentIntentId, paymentMethodId),
    {
      onSuccess: (data) => {
        logger.info('[useUnifiedPayment] Payment confirmed:', {
          paymentIntentId: data.id,
          status: data.status
        });
        queryClient.invalidateQueries(['payment', 'status', bookingId]);
        startPolling();
      },
      onError: (error) => {
        logger.error('[useUnifiedPayment] Error confirming payment:', {
          error: error.message,
          bookingId
        });
        setError(error);
        toast.error(t('payments:errorConfirmingPayment'));
      }
    }
  );

  // Socket subscription for real-time updates
  useEffect(() => {
    if (!bookingId) {
      logger.debug('[usePaymentStatus] No bookingId provided for subscription');
      return;
    }
  
    logger.info('[usePaymentStatus] Initializing payment subscription:', {
      bookingId,
      timestamp: new Date().toISOString()
    });
  
    setupPaymentSubscription(bookingId);
  
    return () => {
      logger.info('[usePaymentStatus] Cleaning up payment subscription:', {
        bookingId,
        hasCleanupFunction: typeof socketSubscriptionRef.current === 'function',
        timestamp: new Date().toISOString()
      });
  
      if (typeof socketSubscriptionRef.current === 'function') {
        try {
          socketSubscriptionRef.current();
        } catch (error) {
          logger.error('[usePaymentStatus] Error during subscription cleanup:', {
            bookingId,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
        socketSubscriptionRef.current = null;
      }
    };
  }, [bookingId, setupPaymentSubscription]);

  useEffect(() => {
    if (activeFlowIdRef.current) {
      PaymentOrchestrator.getFlowStatus(activeFlowIdRef.current)
        .catch(err => {
          logger.error('[usePaymentStatus] Error getting flow status:', {
            error: err.message,
            flowId: activeFlowIdRef.current,
            timestamp: new Date().toISOString()
          });
          setError(err);
        });
    }
  }, [activeFlowIdRef.current]);


  return {
    paymentStatus: activeFlowIdRef.current ? 
      PaymentOrchestrator.getFlowStatus(activeFlowIdRef.current) : 
      null,
    isLoadingStatus,
    error: error || statusError,
    isPolling,
    createPaymentIntent,
    confirmPayment,
    startPolling,
    stopPolling,
    retryCount
  };
};

// Maintain backward compatibility
export { usePaymentStatus as useUnifiedPayment };