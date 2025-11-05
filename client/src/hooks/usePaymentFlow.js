import { useState, useCallback, useEffect, useRef } from 'react';
import { PaymentOrchestrator } from '../services/PaymentOrchestratorService';
import { PAYMENT_STATES } from '../constants/paymentConstants';
import { logger } from '../utils/logger';
import paymentAPI from '../services/paymentAPI';
import PaymentDataService from '../services/PaymentDataService';

const RECOVERY_MAX_ATTEMPTS = 3;
const PROCESSING_TIMEOUT = 60000;

export const usePaymentFlow = (bookingId) => {
  const [state, setState] = useState({
    isProcessing: false,
    recoveryAttempts: 0,
    currentStatus: null,
    lastError: null,
    paymentStatus: null,
  });
  const [flowId, setFlowId] = useState(bookingId); // Add flowId state

  const paymentStatusRef = useRef(null);

  useEffect(() => {
    if (!bookingId) {
      logger.warn('[usePaymentFlow] No bookingId provided, skipping subscription');
      return;
    }

    let mounted = true;

    logger.info('[usePaymentFlow] Subscription setup:', {
      bookingId,
      currentState: state,
      timestamp: new Date().toISOString(),
    });

    logger.info('[usePaymentFlow] Subscribing to state:', { bookingId });
    const unsubscribe = PaymentOrchestrator.subscribeToState(bookingId, (newState) => {
      if (!mounted) {
        logger.debug('[usePaymentFlow] Ignoring update - component unmounted', { bookingId });
        return;
      }
      logger.info('[usePaymentFlow] State update received:', {
        bookingId,
        newState: {
          status: newState.status,
          flowId: newState.flowId,
          modalState: newState.metadata?.modalState,
          paymentStep: newState.metadata?.paymentStep,
        },
      });
      const updatedState = {
        isProcessing: newState.status === 'processing',
        recoveryAttempts: newState.metadata?.retryCount || 0,
        currentStatus: newState.status,
        lastError: newState.error || null,
        paymentStatus: newState.status || null,
      };
      setState(updatedState);
      setFlowId(newState.flowId || bookingId); // Sync flowId with orchestrator
      paymentStatusRef.current = updatedState.paymentStatus;
    });

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
        logger.debug('[usePaymentFlow] Unsubscribed successfully:', { bookingId });
      } else {
        logger.warn('[usePaymentFlow] Unsubscribe function missing:', { bookingId });
      }
    };
  }, [bookingId]);

  const getPaymentStatus = useCallback(() => paymentStatusRef.current, []);

  const startPaymentFlow = useCallback(async (amount, currency, metadata = {}) => {
    if (!metadata?.bookingId) {
      logger.error('[usePaymentFlow] Missing booking ID for payment flow');
      throw new Error('Missing booking ID');
    }

    logger.info('[usePaymentFlow] Starting payment flow', {
      flowId: metadata.bookingId,
      rawAmount: amount,
      currency,
      metadataKeys: Object.keys(metadata),
      timestamp: new Date().toISOString(),
    });

    const normalizedPrice = PaymentDataService.formatPriceForPayment({
      amount,
      currency,
      ...metadata.priceDetails,
    });

    const flow = await PaymentOrchestrator.initializePayment({
      flowId: metadata.bookingId,
      amount: normalizedPrice.amount,
      currency: normalizedPrice.currency,
      metadata: {
        ...metadata,
        priceStructure: normalizedPrice.metadata?.priceStructure,
      },
    });

    logger.info('[usePaymentFlow] Calling updateFlow pre-intent creation', {
      flowId: metadata.bookingId,
      updates: {
        status: 'initializing',
        metadata: { bookingId: metadata.bookingId, modalState: 'payment_active', paymentStep: 'method' },
      },
      timestamp: new Date().toISOString(),
    });
    await PaymentOrchestrator.updateFlow(metadata.bookingId, {
      status: 'initializing',
      metadata: { bookingId: metadata.bookingId, modalState: 'payment_active', paymentStep: 'method' },
    });

    const result = await paymentAPI.createPaymentIntent(metadata.bookingId, {
      metadata: {
        amount: normalizedPrice.amount,
        currency: normalizedPrice.currency,
      },
    });

    logger.info('[usePaymentFlow] Payment intent created', {
      flowId: metadata.bookingId,
      hasClientSecret: !!result?.clientSecret,
      timestamp: new Date().toISOString(),
    });

    setFlowId(metadata.bookingId); // Ensure flowId is updated post-intent
    return {
      ...result,
      amount: normalizedPrice.amount,
      currency: normalizedPrice.currency,
    };
  }, [bookingId]);

  const handlePaymentConfirmation = useCallback(async (paymentMethodId, options = {}) => {
    const targetBookingId = options.bookingId || bookingId;

    logger.info('[usePaymentFlow] Starting payment confirmation:', { bookingId: targetBookingId });

    PaymentOrchestrator.updateFlow(targetBookingId, { status: PAYMENT_STATES.PROCESSING });

    let processingTimeout = setTimeout(() => {
      logger.error('[usePaymentFlow] Payment confirmation timeout:', { bookingId: targetBookingId });
      PaymentOrchestrator.updateFlow(targetBookingId, {
        status: 'timeout',
        metadata: { error: { message: 'Payment processing timeout', recoverable: true, code: 'PROCESSING_TIMEOUT' } },
      });
    }, PROCESSING_TIMEOUT);

    try {
      const result = await paymentAPI.confirmPayment(paymentMethodId, { bookingId: targetBookingId });

      clearTimeout(processingTimeout);
      processingTimeout = null;

      if (result.success) {
        logger.info('[usePaymentFlow] Payment confirmation successful:', { bookingId: targetBookingId });
        PaymentOrchestrator.updateFlow(targetBookingId, { status: PAYMENT_STATES.SUCCEEDED });
        return result;
      } else {
        throw new Error(result.error || 'Payment confirmation failed');
      }
    } catch (error) {
      if (processingTimeout) {
        clearTimeout(processingTimeout);
        processingTimeout = null;
      }

      const enhancedError = {
        message: error.message,
        code: error.code || 'payment_confirmation_failed',
        recoverable: state.recoveryAttempts < RECOVERY_MAX_ATTEMPTS,
      };

      if (enhancedError.recoverable) {
        const newAttempts = state.recoveryAttempts + 1;
        setState((prev) => ({ ...prev, recoveryAttempts: newAttempts }));
        PaymentOrchestrator.updateFlow(targetBookingId, {
          status: PAYMENT_STATES.REQUIRES_RETRY,
          metadata: { retryCount: newAttempts },
        });
        return { requiresRetry: true, error: enhancedError };
      }

      PaymentOrchestrator.updateFlow(targetBookingId, { status: PAYMENT_STATES.FAILED, metadata: { error: enhancedError } });
      throw enhancedError;
    }
  }, [bookingId]);

  const resetFlow = useCallback(async (options = {}) => {
    const targetBookingId = options.bookingId || bookingId;

    logger.info('[usePaymentFlow] Resetting payment flow:', { bookingId: targetBookingId });

    setState((prev) => ({ ...prev, recoveryAttempts: 0, isProcessing: false }));
    PaymentOrchestrator.updateFlow(targetBookingId, { status: 'initial' });
  }, [bookingId]);

  const stopPolling = useCallback(() => {
    // No-op, polling handled by PaymentOrchestrator if needed
  }, []);

  return {
    startPaymentFlow,
    handlePaymentConfirmation,
    resetFlow,
    isProcessing: state.isProcessing,
    recoveryAttempts: state.recoveryAttempts,
    currentStatus: state.currentStatus,
    lastError: state.lastError,
    paymentStatus: state.paymentStatus,
    stopPolling,
    getPaymentStatus,
    flowId, // Expose flowId
  };
};