import { useEffect, useCallback, useState, useRef } from 'react';
import { logger } from '../utils/logger';
import { PAYMENT_STATES } from '../constants/paymentConstants';
import { usePayment } from '../contexts/PaymentContext';
import { useQueryClient } from 'react-query';
import { PaymentOrchestrator } from '../services/PaymentOrchestratorService';

export const usePaymentSocket = (bookingId) => {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Refs for tracking subscription and cleanup
  const subscriptionRef = useRef(null);
  const metricsRef = useRef({
    subscriptionAttempts: 0,
    lastSubscriptionTime: null,
    errors: []
  });

  const handlePaymentUpdate = useCallback((state) => {
    if (!state.bookingId || state.bookingId !== bookingId) return;

    logger.info('[usePaymentSocket] Payment update received:', {
      bookingId,
      status: state.status,
      timestamp: new Date().toISOString()
    });

    setLastUpdate(state.timestamp || new Date().toISOString());
    setIsConnected(true);
    setHasError(false);

    if ([PAYMENT_STATES.SUCCEEDED, PAYMENT_STATES.FAILED, PAYMENT_STATES.CANCELLED].includes(state.status)) {
      logger.info('[usePaymentSocket] Terminal state reached:', {
        bookingId,
        status: state.status,
        timestamp: new Date().toISOString()
      });
      
      queryClient.invalidateQueries(['booking', bookingId]);
      
      if (state.status === PAYMENT_STATES.SUCCEEDED) {
        queryClient.invalidateQueries('notifications');
      }
    }
  }, [bookingId, queryClient]);

  const handleError = useCallback((error) => {
    logger.error('[usePaymentSocket] Subscription error:', {
      bookingId,
      error: error.message,
      attempt: metricsRef.current.subscriptionAttempts,
      timestamp: new Date().toISOString()
    });

    setHasError(true);
    setIsConnected(false);

    // Track error
    metricsRef.current.errors.push({
      message: error.message,
      timestamp: new Date().toISOString()
    });

    // Keep only last 5 errors
    if (metricsRef.current.errors.length > 5) {
      metricsRef.current.errors.shift();
    }
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) {
      logger.debug('[usePaymentSocket] No bookingId provided');
      return;
    }

    let isMounted = true;
    metricsRef.current.subscriptionAttempts++;

    const setupSubscription = async () => {
      try {
        logger.info('[usePaymentSocket] Setting up payment subscription:', {
          bookingId,
          attempt: metricsRef.current.subscriptionAttempts,
          timestamp: new Date().toISOString()
        });

        // Clean up any existing subscription
        const unsubscribe = PaymentOrchestrator.subscribeToState(bookingId, handlePaymentUpdate);

        if (isMounted) {
          subscriptionRef.current = unsubscribe;
          setIsConnected(true);
          setHasError(false);
          metricsRef.current.lastSubscriptionTime = new Date().toISOString();
        } else {
          unsubscribe();
        }

      } catch (error) {
        if (isMounted) {
          handleError(error);
        }
      }
    };

    setupSubscription();

    // Cleanup function
    return () => {
      logger.info('[usePaymentSocket] Cleaning up subscription:', {
        bookingId,
        hasSubscription: !!subscriptionRef.current,
        metrics: {
          attempts: metricsRef.current.subscriptionAttempts,
          lastSubscription: metricsRef.current.lastSubscriptionTime,
          errorCount: metricsRef.current.errors.length
        },
        timestamp: new Date().toISOString()
      });

      isMounted = false;
      
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
    };
  }, [bookingId, handlePaymentUpdate]);

  // Expose subscription metrics for debugging
  const getMetrics = useCallback(() => ({
    isConnected,
    hasError,
    lastUpdate,
    subscriptionAttempts: metricsRef.current.subscriptionAttempts,
    lastSubscriptionTime: metricsRef.current.lastSubscriptionTime,
    recentErrors: [...metricsRef.current.errors],
    timestamp: new Date().toISOString()
  }), [isConnected, hasError, lastUpdate]);

  return {
    isConnected,
    hasError,
    lastUpdate,
    getMetrics
  };
};