import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, CheckCircle, AlertTriangle, Clock, Loader2, Calendar, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../ui/card.tsx';
import { Alert, AlertTitle, AlertDescription } from '../../ui/alert.tsx';
import { useStripe, useElements } from '@stripe/react-stripe-js';
import { usePayment } from '../../../contexts/PaymentContext';
import PaymentMethodForm from '../forms/PaymentMethodForm';
import SavedPaymentMethodsManager from '../SavedPaymentMethodsManager';
import PaymentStatusIndicator from '../status/PaymentStatusIndicator';
import { Button } from '../../ui/button.tsx';
import PriceBreakdown from '../breakdown/PriceBreakdown';
import DeferredPaymentFlow from './DeferredPaymentFlow';
import PaymentTimingForm from '../forms/PaymentTimingForm';
import { PAYMENT_STATES, PAYMENT_STEPS, VISIBILITY_STATES, FLOW_STATES, MODAL_STATES } from '../../../constants/paymentConstants';
import { logger } from '../../../utils/logger';
import { paymentLogger } from '../../../utils/paymentLogger';
import PaymentDataService from '../../../services/PaymentDataService';
import { PaymentOrchestrator, FLOW_LIFECYCLE } from '../../../services/PaymentOrchestratorService';
import paymentAPI from '../../../services/paymentAPI.js';
import PaymentSocketService from '../../../services/PaymentSocketService';
import PaymentErrorBoundary from '../PaymentErrorBoundary';
import {PAYMENT_EVENTS} from '../../../constants/paymentSocketConstants';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible.jsx';
import { Tag } from 'lucide-react';
import { cn } from '../../../lib/utils';


const MAX_INIT_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

const ELEMENTS_OPTIONS = {
  fonts: [
    {
      cssSrc: 'https://fonts.googleapis.com/css?family=Inter:400,500,600',
    },
  ],
  locale: 'auto',
  appearance: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#0F172A',
      colorBackground: '#ffffff',
      colorText: '#0F172A',
      colorDanger: '#df1b41',
      fontFamily: 'Inter, system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '4px',
    },
  },
};

// Custom hook to check Stripe and Elements readiness
const useStripeReadiness = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [isReady, setIsReady] = useState(false);
  

  useEffect(() => {
    if (stripe && elements) {
      logger.info('[PaymentFlow] Stripe and Elements are ready', {
        hasStripe: !!stripe,
        hasElements: !!elements,
        timestamp: new Date().toISOString(),
      });
      setIsReady(true);
    } else {
      logger.debug('[PaymentFlow] Waiting for Stripe and Elements', {
        hasStripe: !!stripe,
        hasElements: !!elements,
        timestamp: new Date().toISOString(),
      });
    }
  }, [stripe, elements]);

  return isReady;
};

const PaymentFlow = ({
  bookingId,
  amount,
  currency,
  sessionStartTime,
  clientSecret,
  onSuccess,
  onError,
  onCancel,
  priceDetails = null,
  isConnected = false,
  allowDeferred = true,
  onMount,
  paymentStep: propPaymentStep,
  modalState: propModalState,
  orchestratorState = null, 
   isCancelling,
}) => {
 
   const { t } = useTranslation(['payments', 'bookings', 'common']);
  const elements = useElements();
  const stripe = useStripe();

  useEffect(() => {
    logger.info('[PaymentFlow MOUNT] Component has mounted. Checking for Stripe/Elements.');
    if (stripe && elements) {
      logger.info('[PaymentFlow MOUNT] SUCCESS: `stripe` and `elements` instances are available immediately.');
    } else {
      logger.error('[PaymentFlow MOUNT] FAILED: `stripe` or `elements` are NOT available. The global <Elements> provider in App.js is likely missing or misconfigured.');
    }
  }, [stripe, elements]);

  useEffect(() => {
    if (elements && clientSecret) {
      logger.info('[PaymentFlow UPDATE] clientSecret is available. Calling elements.update() to link it to the payment form.', { bookingId });
      elements.update({
        clientSecret: clientSecret,
        appearance: ELEMENTS_OPTIONS.appearance
      });
    }
  }, [elements, clientSecret, bookingId]);

  const [user] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [paymentState, setPaymentState] = useState({
    selectedMethod: null,
    clientSecret: clientSecret || null,
    formattedPrice: null,
    cardComplete: false,
    pendingCard: null,
    flowState: FLOW_STATES.INITIAL,
    visibilityState: VISIBILITY_STATES.INITIAL,
    isProcessing: false,
    currentStatus: null,
    lastError: null,
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const isStripeReady = useStripeReadiness();

  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  const getDiscountDisplayName = (discount, t) => {
    if (!discount) return '';

    if (discount.source === 'manual_code') {
        return t('bookings:discountCodeApplied', { code: discount.code });
    }

    if (discount.isTimeBased) {
        const daysOfWeekMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const translatedDays = discount.dayOfWeek.map(d => t(`common:${daysOfWeekMap[d]}`)).join(', ');
        return t('bookings:timeBasedRateName', {
        days: translatedDays,
        start: discount.timeRange.start,
        end: discount.timeRange.end
        });
    }

    return discount.name || t('bookings:promoApplied', 'Promotion Applied');
  };

    useEffect(() => {
    if (isStripeReady && clientSecret) {
      setIsInitializing(false);
    }
  }, [isStripeReady, clientSecret]);

  const triggerSubmitRef = useRef(null);

  // Subscribe to PaymentOrchestrator for paymentStep and modalState
  useEffect(() => {
    logger.info('[PaymentFlow] Subscribing to PaymentOrchestrator state', {
      bookingId,
      timestamp: new Date().toISOString(),
    });

    const unsubscribe = PaymentOrchestrator.subscribeToState(bookingId, (state) => {
      logger.info('[PaymentFlow] Received state update from Orchestrator', {
        bookingId,
        state: {
          paymentStep: state.paymentStep,
          modalState: state.modalState,
          status: state.status,
        },
        timestamp: new Date().toISOString(),
      });
      logger.info('[PaymentFlow.OrchestratorSubscription] Received state update.', {
        paymentFlowBookingId: bookingId, 
        newStateFromOrchestrator: {
            paymentStep: state.paymentStep,
            modalState: state.modalState,
            flowStatus: state.status,
            hasClientSecret: !!state.clientSecret || !!state.metadata?.clientSecret,
            clientSecretProvided: state.clientSecret || state.metadata?.clientSecret || 'NOT_PROVIDED_IN_THIS_UPDATE'
        },
        currentInternalPaymentStep: paymentState.paymentStep, // Log current internal state for comparison
        timestamp: new Date().toISOString(),
    });
       setPaymentState((prev) => ({
    ...prev,
    paymentStep: state.paymentStep || prev.paymentStep || PAYMENT_STEPS.METHOD,
    modalState: state.modalState || prev.modalState || MODAL_STATES.BOOKING,
    flowState: state.status || prev.flowState,
    selectedMethod: state.metadata?.selectedPaymentMethod,
  }));
    });

    return () => {
      logger.info('[PaymentFlow] Unsubscribing from PaymentOrchestrator state', {
        bookingId,
        timestamp: new Date().toISOString(),
      });
      unsubscribe();
    };
  }, [bookingId]);

const handlePaymentCancel = () => {
  logger.info('[PaymentFlow.handlePaymentCancel] Function CALLED.', {
    paymentFlowBookingId: bookingId,
    currentSelectedMethod: paymentState.selectedMethod ? { id: paymentState.selectedMethod.id } : null,
    timestamp: new Date().toISOString()
  });

  if (paymentState.selectedMethod) {
    logger.info('[PaymentFlow.handlePaymentCancel] Has selectedMethod, calling PaymentOrchestrator.goBack.', { paymentFlowBookingId: bookingId });
    PaymentOrchestrator.goBack(bookingId);
    return;
  }

  logger.info('[PaymentFlow.handlePaymentCancel] No selectedMethod, calling main onCancel prop.', { paymentFlowBookingId: bookingId });
  onCancel();
};

  useEffect(() => {
    logger.info('[PaymentFlow] Setting up socket subscription', {
      bookingId, // This is the paymentIntentId
      timestamp: new Date().toISOString(),
    });

    let unsubscribeSocket = () => { 
      logger.debug('[PaymentFlow] No-op unsubscribe called for socket', { bookingId, timestamp: new Date().toISOString() }); 
    };

    const setupAsyncOperations = async () => {
      try {
        const connected = await PaymentSocketService.ensureConnection({ 
          context: { operation: 'flow_subscription_pf', flowId: bookingId }
        });
        
        logger.info('[PaymentFlow] Socket connection ensured for PaymentFlow', {
          bookingId,
          connected,
          timestamp: new Date().toISOString(),
        });
        
        if (connected) {
          const callbacks = {
            [PAYMENT_EVENTS.STATUS_UPDATE]: (statusData) => {
              logger.info('[PaymentFlow] Received socket update via callback object', {
                bookingId,
                statusData,
                timestamp: new Date().toISOString(),
              });
              logger.info('[PaymentFlow.SocketSubscription] Received socket update.', {
                paymentFlowBookingId: bookingId, // This is the 'bookingId' prop of PaymentFlow
                statusDataFromSocket: statusData,
                timestamp: new Date().toISOString(),
              });
              setPaymentState((prev) => ({
                ...prev,
                flowState: statusData.status || prev.flowState,
                currentStatus: statusData, // Store the whole data object if needed
              }));
            }
          };
  
          const unsubscribe = await PaymentSocketService.subscribeToFlowStatus(bookingId, callbacks);
          if (typeof unsubscribe === 'function') {
            unsubscribeSocket = unsubscribe;
          } else {
            logger.warn('[PaymentFlow] Socket subscription did not return an unsubscribe function', {
              bookingId,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          logger.warn('[PaymentFlow] Socket could not be connected after retries. Payment flow may rely on polling.', {bookingId});
        }
      } catch (error) {
        logger.error('[PaymentFlow] Error during socket setup or subscription', {
          bookingId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
       
      }
    };

    setupAsyncOperations();

    return () => {
      logger.info('[PaymentFlow] Cleaning up socket subscription in PaymentFlow', {
        bookingId,
        timestamp: new Date().toISOString(),
      });
      unsubscribeSocket();
    };
  }, [bookingId]);

  useEffect(() => {
    if (paymentState.clientSecret && paymentState.paymentStep === PAYMENT_STEPS.METHOD) {
      setPaymentState((prev) => ({
        ...prev,
        visibilityState: VISIBILITY_STATES.VISIBLE,
      }));
    } else if (!paymentState.clientSecret) {
      setPaymentState((prev) => ({
        ...prev,
        visibilityState: VISIBILITY_STATES.INITIAL,
      }));
    }
  }, [paymentState.clientSecret, paymentState.paymentStep, bookingId]);



  // Sync clientSecret from props
  useEffect(() => {
    if (clientSecret && clientSecret !== paymentState.clientSecret) {
      logger.info('[PaymentFlow] Updating clientSecret from prop', {
        bookingId,
        clientSecret,
        timestamp: new Date().toISOString(),
      });
      setPaymentState((prev) => ({
        ...prev,
        clientSecret,
        visibilityState: VISIBILITY_STATES.VISIBLE,
      }));
    }
  }, [clientSecret, bookingId]);

  useEffect(() => {
    if (!amount || !currency) return;

  

    const formatted = priceDetails
      ? PaymentDataService.formatPriceForPayment(priceDetails)
      : PaymentDataService.formatPriceForPayment({ amount, currency });

    setPaymentState((prev) => ({
      ...prev,
      formattedPrice: formatted,
    }));
  }, [amount, currency, priceDetails, bookingId]);

  useEffect(() => {
    if (paymentState.selectedMethod) {
        const logPrefix = '[PaymentFlow.useEffect[paymentState.selectedMethod]]';
        const currentPaymentFlowId = bookingId; 

        logger.info(`${logPrefix} Hook triggered.`, {
            paymentFlowId_PROP: currentPaymentFlowId,
            newSelectedMethodId: paymentState.selectedMethod.id,
            timestamp: new Date().toISOString()
        });

        logger.info(`${logPrefix} PRE-getFlowData: Attempting to retrieve flow data from orchestrator.`, { paymentFlowId_PROP: currentPaymentFlowId });
        const currentFlowDataFromOrchestrator = PaymentOrchestrator.getFlowData(currentPaymentFlowId);
        logger.info(`${logPrefix} POST-getFlowData: Data for THIS FLOW from Orchestrator:`, {
            paymentFlowId_PROP: currentPaymentFlowId,
            retrievedData: currentFlowDataFromOrchestrator ? {
                flowId: currentFlowDataFromOrchestrator.flowId,
                status: currentFlowDataFromOrchestrator.status,
                metadataClientSecretExists: !!currentFlowDataFromOrchestrator.metadata?.clientSecret,
                metadataPaymentIntentId: currentFlowDataFromOrchestrator.metadata?.paymentIntentId,
                metadataBookingId: currentFlowDataFromOrchestrator.metadata?.bookingId,
                error_in_data: currentFlowDataFromOrchestrator.error
            } : null,
            timestamp: new Date().toISOString()
        });

        if (!currentFlowDataFromOrchestrator || currentFlowDataFromOrchestrator.status === 'error' || (!currentFlowDataFromOrchestrator.metadata?.clientSecret && !currentFlowDataFromOrchestrator.clientSecret)) {
            logger.error(`${logPrefix} Orchestrator data for flow ID is NULL, ERRORED, or MISSING ClientSecret. This may lead to closure.`, {
                paymentFlowId_PROP: currentPaymentFlowId,
                retrievedDataForProblemCheck: currentFlowDataFromOrchestrator,
            });
            
        } else {
             logger.info(`${logPrefix} Orchestrator data seems VALID post-selection.`, { paymentFlowId_PROP: currentPaymentFlowId });
        }
    } else {
      }
}, [paymentState.selectedMethod, bookingId, onError]); 

  const displayPrice = useMemo(() => {
    if (!paymentState.formattedPrice) return null;

    try {
      const priceStructure = paymentState.formattedPrice.metadata?.priceStructure
        ? JSON.parse(paymentState.formattedPrice.metadata.priceStructure)
        : null;

      return {
        baseAmount: priceStructure?.base?.amount || paymentState.formattedPrice.metadata?.originalAmount,
        finalAmount: paymentState.formattedPrice.amount,
        currency: paymentState.formattedPrice.currency,
        platformFee: paymentState.formattedPrice.metadata?.platformFee,
        vatAmount: paymentState.formattedPrice.metadata?.vatAmount,
      };
    } catch (error) {
      logger.error('[PaymentFlow] Error parsing price structure:', {
        error: error.message,
        bookingId,
        timestamp: new Date().toISOString(),
      });
      return {
        finalAmount: paymentState.formattedPrice.amount,
        currency: paymentState.formattedPrice.currency,
      };
    }
  }, [paymentState.formattedPrice, bookingId]);

  const canSubmitPayment = useMemo(() => {
    return paymentState.selectedMethod || (paymentState.cardComplete && paymentState.pendingCard);
  }, [paymentState.selectedMethod, paymentState.cardComplete, paymentState.pendingCard]);

  const handleCardStatusChange = useCallback((isComplete, cardEvent) => {


    const cardDetails = cardEvent
      ? {
          brand: cardEvent.brand || 'unknown',
          last4: cardEvent.last4 || 'pending',
          complete: isComplete,
        }
      : null;

    setPaymentState((prev) => {
      
      return {
        ...prev,
        cardComplete: isComplete,
        pendingCard: isComplete ? cardDetails : null,
      };
    });
  }, [bookingId]);

  const handleTimingSelection = useCallback((timing) => {

    PaymentOrchestrator.handleStateChange(bookingId, {
      timing,
      nextStep: timing === 'immediate' ? PAYMENT_STEPS.METHOD : PAYMENT_STEPS.DEFERRED,
    });
  }, [bookingId]);

const handlePaymentMethodSelection = useCallback((method) => {
    logger.info('[PaymentFlow.handlePaymentMethodSelection] Received method selection.', {
      selectedMethodObject: method ? { id: method.id, brand: method.brand, last4: method.last4 } : null,
      currentPaymentFlowBookingId: bookingId, 
      currentVisibilityState: paymentState.visibilityState,
      timestamp: new Date().toISOString()
  });
  if (paymentState.visibilityState !== VISIBILITY_STATES.VISIBLE) {
    logger.warn('[PaymentFlow.handlePaymentMethodSelection] Selection ignored, not visible.', { bookingId });
    return;
}   
    setPaymentState((prev) => ({
      ...prev,
      selectedMethod: method,
    }));
    PaymentOrchestrator.updateFlow(bookingId, {
        metadata: {
            selectedPaymentMethod: method
        }
    }).catch(err => {
        logger.error('[PaymentFlow] Failed to update orchestrator with selected method', { error: err.message, bookingId });
    });
  }, [bookingId, paymentState.visibilityState]);


  const handlePaymentSubmit = async (paymentMethod) => {
    const currentFlowIdForOrchestrator = bookingId;
    let paymentIntentIdToUse = null; // Defined here to be accessible in catch/finally for network errors
    let mongoDBBookingIdForApiContext = null; // Defined here for broader scope
    let latestOrchestratorFlowData = null; // Defined here for broader scope

    logger.info('[PaymentFlow] Payment submission start', {
      flowIdForOrchestrator: currentFlowIdForOrchestrator,
      hasPaymentMethod: !!paymentMethod,
      methodId: paymentMethod?.id,
      timestamp: new Date().toISOString(),
    });

    paymentLogger.logFlowEvent(currentFlowIdForOrchestrator, 'payment_submission_start', { hasPaymentMethod: !!paymentMethod });

    try {
      setPaymentState((prev) => ({ ...prev, isProcessing: true }));

      // Determine paymentIntentIdToUse
      if (paymentState.clientSecret && paymentState.clientSecret.includes('_secret_')) {
        paymentIntentIdToUse = paymentState.clientSecret.split('_secret_')[0];
      } else if (clientSecret && clientSecret.includes('_secret_')) {
        paymentIntentIdToUse = clientSecret.split('_secret_')[0];
      } else if (currentFlowIdForOrchestrator && currentFlowIdForOrchestrator.startsWith('pi_')) {
         paymentIntentIdToUse = currentFlowIdForOrchestrator;
      }

      if (!paymentIntentIdToUse) {
        try {
          const paymentDataFromApi = await paymentAPI.getPaymentStatus(currentFlowIdForOrchestrator);
          if (paymentDataFromApi?.paymentIntentId) {
            paymentIntentIdToUse = paymentDataFromApi.paymentIntentId;
          } else if (paymentDataFromApi?.clientSecret && paymentDataFromApi.clientSecret.includes('_secret_')) {
            paymentIntentIdToUse = paymentDataFromApi.clientSecret.split('_secret_')[0];
          }
        } catch (statusError) {
          logger.warn('[PaymentFlow] Error getting payment status during PI determination:', {
            error: statusError.message,
            flowIdForOrchestrator: currentFlowIdForOrchestrator,
            timestamp: new Date().toISOString(),
          });
        }
      }
      
      if (!paymentIntentIdToUse) {
        logger.error('[PaymentFlow] Critical: Could not determine PaymentIntent ID.', {
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          hasLocalClientSecret: !!paymentState.clientSecret,
          hasPropClientSecret: !!clientSecret,
          timestamp: new Date().toISOString(),
        });
        throw new Error('No PaymentIntent ID found to proceed with payment.');
      }

      logger.info('[PaymentFlow] Determined PaymentIntent ID for submission:', {
        paymentIntentIdToUse,
        flowIdForOrchestrator: currentFlowIdForOrchestrator,
        timestamp: new Date().toISOString(),
      });

      let paymentMethodId = paymentMethod?.id;

      if (!paymentMethodId && paymentState.cardComplete && triggerSubmitRef.current) {
        logger.info('[PaymentFlow] Triggering new card submission', {
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          timestamp: new Date().toISOString(),
        });
        await triggerSubmitRef.current();
        return;
      }

      if (!paymentMethodId) {
        logger.error('[PaymentFlow] No valid payment method ID provided or obtained.', {
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          paymentMethodArg: paymentMethod ? JSON.stringify(paymentMethod) : 'null',
          timestamp: new Date().toISOString(),
        });
        throw new Error('No valid payment method ID provided for submission.');
      }

      logger.info('[PaymentFlow] Preparing to process payment with Orchestrator', {
        flowIdForOrchestrator: currentFlowIdForOrchestrator,
        paymentMethodId,
        paymentIntentIdToUse,
        timestamp: new Date().toISOString(),
      });

      latestOrchestratorFlowData = PaymentOrchestrator.getFlowData(currentFlowIdForOrchestrator);

      if (!latestOrchestratorFlowData) {
        logger.error('[PaymentFlow] CRITICAL: Could not retrieve flow data from orchestrator.', {
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Payment flow data is missing or corrupted in orchestrator.');
      }

      mongoDBBookingIdForApiContext =
        latestOrchestratorFlowData.metadata?.actualBookingId ||
        latestOrchestratorFlowData.metadata?.bookingId ||
        (currentFlowIdForOrchestrator && currentFlowIdForOrchestrator.startsWith('pi_') ? null : currentFlowIdForOrchestrator);

      if (!mongoDBBookingIdForApiContext) {
        logger.error('[PaymentFlow] CRITICAL: MongoDB Booking ID for API context could not be determined from orchestrator data.', {
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          orchestratorMetadata: latestOrchestratorFlowData.metadata,
          orchestratorBookingId: latestOrchestratorFlowData.bookingId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Associated MongoDB Booking ID is missing in payment flow data.');
      }

      logger.info('[PaymentFlow] MongoDB Booking ID for API context determined:', {
          mongoDBBookingIdForApiContext,
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          sourceFields: {
              metadataActualBookingId: latestOrchestratorFlowData.metadata?.actualBookingId,
              metadataBookingId: latestOrchestratorFlowData.metadata?.bookingId,
              directOrchestratorBookingId: latestOrchestratorFlowData.bookingId
          },
          timestamp: new Date().toISOString()
      });

      const contextForProcessPayment = {
        bookingId: mongoDBBookingIdForApiContext,
        retryOnNetworkError: true,
        maxRetries: 2,
      };

      await PaymentSocketService.ensureReliableConnection({
        context: {
          operation: 'payment_submission',
          flowId: currentFlowIdForOrchestrator,
          paymentIntentId: paymentIntentIdToUse,
        },
      }).catch((socketError) => {
        logger.warn('[PaymentFlow] Socket connection issue detected, continuing with API only', {
          error: socketError.message,
          flowIdForOrchestrator: currentFlowIdForOrchestrator,
          timestamp: new Date().toISOString(),
        });
      });

      logger.info('[PaymentFlow] Calling PaymentOrchestrator.processPayment with:', {
        flowIdArg: currentFlowIdForOrchestrator,
        paymentMethodIdArg: paymentMethodId,
        paymentIntentIdArg: paymentIntentIdToUse,
        contextArg: contextForProcessPayment,
        timestamp: new Date().toISOString(),
      });

      const result = await PaymentOrchestrator.processPayment(
        currentFlowIdForOrchestrator,
        paymentMethodId,
        paymentIntentIdToUse,
        contextForProcessPayment
      );

      logger.info('[PaymentFlow] processPayment result received:', {
        flowIdForOrchestrator: currentFlowIdForOrchestrator,
        resultStatus: result.status,
        resultBookingId: result.bookingId,
        hasResult: !!result,
        timestamp: new Date().toISOString(),
      });

      onSuccess?.({
        ...result,
        bookingId: mongoDBBookingIdForApiContext,
        paymentIntentId: paymentIntentIdToUse
      });

    } catch (error) {
      logger.error('[PaymentFlow] Payment processing failed', {
        error: error.message,
        flowIdForOrchestrator: currentFlowIdForOrchestrator,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      let enhancedError = error;
      const originalFlowIdForError = currentFlowIdForOrchestrator;
      
      // Ensure latestOrchestratorFlowData is accessible if an error occurred before its assignment in try,
      // or if it was assigned but we need to re-check for the mongoDBIdForError.
      // This might be slightly redundant if the error happened *after* its assignment, but safe.
      if (!latestOrchestratorFlowData) {
          try {
              latestOrchestratorFlowData = PaymentOrchestrator.getFlowData(originalFlowIdForError);
          } catch (orchestratorFetchError) {
              logger.warn('[PaymentFlow] Could not fetch orchestrator data in error handler for mongoDBIdForError', { flowId: originalFlowIdForError, fetchError: orchestratorFetchError.message });
          }
      }

      const mongoDBIdForError = latestOrchestratorFlowData?.metadata?.actualBookingId ||
                              latestOrchestratorFlowData?.metadata?.bookingId ||
                              (originalFlowIdForError && originalFlowIdForError.startsWith('pi_') ? null : originalFlowIdForError);


      if (error.message?.includes('Network Error') || error.code === 'ECONNABORTED') {
        logger.warn('[PaymentFlow] Network error detected, attempting to verify payment status', {
          flowIdForError: originalFlowIdForError,
          timestamp: new Date().toISOString(),
        });

        try {
          const status = await paymentAPI.getPaymentStatus(paymentIntentIdToUse || originalFlowIdForError);
          if (status?.status === 'succeeded') {
            logger.info('[PaymentFlow] Payment succeeded despite network error', {
              flowIdForError: originalFlowIdForError,
              paymentIntentId: paymentIntentIdToUse,
              status: status.status,
              timestamp: new Date().toISOString(),
            });
            const successResult = {
              success: true,
              status: 'succeeded',
              recoveredFromError: true,
              bookingId: mongoDBIdForError || originalFlowIdForError,
              paymentIntentId: paymentIntentIdToUse,
              originalError: error.message,
            };
            onSuccess?.(successResult);
            return;
          }
        } catch (statusError) {
          logger.error('[PaymentFlow] Error checking payment status after network error', {
            error: statusError.message,
            originalError: error.message,
            flowIdForError: originalFlowIdForError,
            timestamp: new Date().toISOString(),
          });
        }

        enhancedError = new Error(`Payment failed due to network issues. Your card has not been charged.`);
        enhancedError.originalError = error;
        enhancedError.recoverable = true;
      }

      setPaymentState((prev) => ({ ...prev, lastError: enhancedError }));
      onError?.(enhancedError);
    } finally {
      setPaymentState((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const handleDeferredPaymentSchedule = useCallback(
    async (scheduledTime) => {
      try {
        logger.info('[PaymentFlow] Scheduling deferred payment:', {
          bookingId,
          scheduledTime: scheduledTime.toISOString(),
          timestamp: new Date().toISOString(),
        });

        const result = await PaymentOrchestrator.updateFlow(bookingId, {
          status: 'deferred',
          metadata: {
            amount,
            currency,
            scheduledTime: scheduledTime.toISOString(),
            type: 'deferred_payment',
          },
        });

        logger.info('[PaymentFlow] Deferred payment scheduled:', {
          bookingId,
          scheduledTime: scheduledTime.toISOString(),
          timestamp: new Date().toISOString(),
        });

        onSuccess?.({
          type: 'deferred',
          scheduledTime,
          ...result,
        });
      } catch (error) {
        logger.error('[PaymentFlow] Deferred payment scheduling failed:', {
          error: error.message,
          bookingId,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        setPaymentState((prev) => ({ ...prev, lastError: error }));
        onError?.(error);
      }
    },
    [bookingId, amount, currency, onSuccess, onError]
  );

const handleSavePaymentMethod = async (paymentMethod) => {
    if (!user?.id) {
      logger.warn('[PaymentFlow] Cannot save payment method - no user ID');
      return;
    }

    try {
      logger.info('[PaymentFlow] Saving payment method:', {
        paymentMethodId: paymentMethod.id,
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      const { data } = await paymentAPI.addPaymentMethod(user.id, paymentMethod.id, true);

      logger.info('[PaymentFlow] Payment method saved successfully:', {
        paymentMethodId: paymentMethod.id,
        timestamp: new Date().toISOString(),
      });

      return data;
    } catch (error) {
      logger.error('[PaymentFlow] Failed to save payment method:', {
        error: error.message,
        paymentMethodId: paymentMethod.id,
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  };


  const renderPaymentStep = () => {

    logger.info('[PaymentFlow] renderPaymentStep called', {
      bookingId,
      paymentStep: paymentState.paymentStep,
      isInitializing,
      isStripeReady,
   
      hasClientSecret: !!paymentState.clientSecret,
      timestamp: new Date().toISOString(),
    });

    if (isInitializing) {
      logger.debug('[PaymentFlow] Waiting for dependencies to initialize', {
        bookingId,
        isStripeReady,
      
        hasClientSecret: !!clientSecret,
        timestamp: new Date().toISOString(),
      });
      return (
        <motion.div
          key={`initializing-${bookingId}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">{t('payments:loading')}</p>
          </div>
        </motion.div>
      );
    }

    switch (paymentState.paymentStep) {
      case PAYMENT_STEPS.TIMING:
        return (
          <motion.div
            key={`timing-${bookingId}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <PaymentTimingForm
              onSelect={handleTimingSelection}
              selectedTiming={paymentState.flowState.timing}
              sessionStartTime={sessionStartTime}
              isConnected={isConnected}
              disabled={paymentState.isProcessing}
            />
          </motion.div>
        );
       case PAYMENT_STEPS.METHOD:
          logger.info('[PaymentFlow] Rendering METHOD step', {
            bookingId,
            hasClientSecret: !!clientSecret,
            hasSelectedMethod: !!paymentState.selectedMethod,
            timestamp: new Date().toISOString(),
          });
          return (
            <motion.div
              key={`method-${bookingId}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
                <SavedPaymentMethodsManager
                  onSelect={handlePaymentMethodSelection}
                  selectedMethodId={paymentState.selectedMethod?.id}
                  disabled={paymentState.isProcessing}
                  userId={user?.id}
                  bookingId={bookingId}
                />
                <AnimatePresence>
                 {!paymentState.selectedMethod?.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                  <PaymentMethodForm
                    onSubmit={handlePaymentSubmit}
                    onCardStatusChange={handleCardStatusChange}
                    onCancel={onCancel}
                    showSaveOption={true}
                    defaultSave={true}
                    disabled={paymentState.isProcessing}
                    onSave={handleSavePaymentMethod}
                    processingText={t('payments:processing')}
                    bookingId={bookingId}
                    isStripeReady={isStripeReady}
                    triggerSubmit={triggerSubmitRef}
                  />
                    </motion.div>
                  )}
                </AnimatePresence>
            </motion.div>
          );
        case PAYMENT_STEPS.DEFERRED:
        return (
          <motion.div
            key={`deferred-${bookingId}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DeferredPaymentFlow
              bookingId={bookingId}
              sessionStartTime={sessionStartTime}
              amount={amount}
              currency={currency}
              onSchedule={handleDeferredPaymentSchedule}
              onCancel={() =>
                PaymentOrchestrator.handleStateChange(bookingId, {
                  nextStep: PAYMENT_STEPS.TIMING,
                })
              }
            />
          </motion.div>
        );
      case PAYMENT_STEPS.PROCESSING:
        return (
          <motion.div
            key={`processing-${bookingId}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center"
          >
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground mt-4">{t('payments:processingMessage')}</p>
          </motion.div>
        );
      default:
        return null;
    }
  };

   logger.info('[PaymentFlow] Rendering with state and props:', {
    bookingId,
    amount,
    currency,
    orchestratorState: {
      status: orchestratorState?.status,
      amount: orchestratorState?.amount,
      currency: orchestratorState?.currency,
      keys: orchestratorState ? Object.keys(orchestratorState) : null,
    },
    paymentState: {
      flowState: paymentState?.flowState,
      paymentStep: paymentState?.paymentStep,
      visibilityState: paymentState?.visibilityState,
    },
    timestamp: new Date().toISOString()
  });

 return (
    <Card
      className={`w-full ${
        paymentState.visibilityState === VISIBILITY_STATES.VISIBLE ? 'opacity-100' : 'opacity-0'
     }`}
       data-state={paymentState.visibilityState}
       data-flow-status={paymentState.flowState}
    >

<CardHeader className="p-4">
    <div className="flex items-center justify-between gap-4">
        <CardTitle className="text-lg font-semibold text-foreground">
          {paymentState.paymentStep === PAYMENT_STEPS.TIMING
            ? t('payments:selectTiming')
            : paymentState.paymentStep === PAYMENT_STEPS.DEFERRED
            ? t('payments:scheduledPayment')
            : t('payments:paymentDetails')}
        </CardTitle>
        {paymentState.flowState && <PaymentStatusIndicator status={paymentState.flowState} />}
    </div>
</CardHeader>

      <CardContent>
      <PaymentErrorBoundary 
    onError={(error) => {
      logger.error('[PaymentFlow] Payment processing error caught by boundary', {
        bookingId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }}
    onRetry={(attempt) => {
      logger.info('[PaymentFlow] Retrying after error', {
        bookingId,
        attempt,
        timestamp: new Date().toISOString()
      });
      
      // Reset state for retry
      setPaymentState(prev => ({
        ...prev,
        lastError: null,
        isProcessing: false
      }));
    }}
    onCancel={() => {
      logger.info('[PaymentFlow] Cancelling due to error', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      
      PaymentOrchestrator.handleCleanup(bookingId, { 
        source: 'error_boundary', 
        reason: 'payment_error' 
      });
      
      onCancel?.();
    }}
    maxRetries={3}
  >
        {paymentState.visibilityState === VISIBILITY_STATES.ERROR && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('payments:error.initialization')}</AlertTitle>
            <AlertDescription>{paymentState.lastError?.message}</AlertDescription>
          </Alert>
        )}
        <AnimatePresence>
          {paymentState.lastError && (
            <motion.div
              key={`error-${bookingId}-${paymentState.lastError.code}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ outline: '1px solid yellow' }}
              className="mb-4"
            >
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('payments:error.title')}</AlertTitle>
                <AlertDescription>
                  {paymentState.lastError.message}
                  {paymentState.lastError.recoveryInstructions && (
                    <p className="mt-2 text-sm">{paymentState.lastError.recoveryInstructions}</p>
                  )}
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
         {!paymentState.clientSecret || isInitializing ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">{t('payments:loadingStripe')}</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`step-${bookingId}-${paymentState.paymentStep}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="payment-step-content"
              style={{ outline: 'none' }}
            >
              {renderPaymentStep()}
             
            </motion.div>
          </AnimatePresence>
        )}
        </PaymentErrorBoundary>
      </CardContent>

<CardFooter className="flex flex-col items-stretch gap-4 pt-4">
    {paymentState.paymentStep !== PAYMENT_STEPS.PROCESSING && (
        <>
            {priceDetails && paymentState.paymentStep === PAYMENT_STEPS.METHOD && (
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-medium">
                                <CreditCard className="h-5 w-5 text-muted-foreground" />
                                <span>{t('bookings:total')}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setIsBreakdownOpen(p => !p)} className="group h-auto px-2 py-1 text-base">
                                {priceDetails._calculationDetails?.winningDiscount && (
                                  <span className="mr-2 font-semibold text-muted-foreground line-through">
                                      {priceDetails.base?.amount?.amount?.toFixed(2)}
                                  </span>
                                )}
                               <span className="font-semibold">
                                {priceDetails.final?.amount?.amount?.toFixed(2)} {priceDetails.currency}
                               </span>
                                <ChevronDown size={18} className="ml-2 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </Button>
                        </div>

                        <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
                            <CollapsibleContent className="space-y-3 border-t pt-3">
                                <div className="space-y-1.5 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">{t('bookings:listPrice')}</span>
                                    <span>{priceDetails.base?.amount?.amount?.toFixed(2)} {priceDetails.currency}</span>
                                  </div>

                                  {priceDetails._calculationDetails?.winningDiscount && (
                                    <div className="flex items-center justify-between text-green-600 dark:text-green-500">
                                      <span className="font-medium flex items-center gap-2">
                                        <Tag size={16} />
                                        {getDiscountDisplayName(priceDetails._calculationDetails.winningDiscount, t)}
                                      </span>
                                      <span className="font-medium">- {priceDetails._calculationDetails.winningDiscount.amountDeducted?.toFixed(2)} {priceDetails.currency}</span>
                                    </div>
                                  )}

                                  <div className="mt-2 flex items-center justify-between border-t pt-2">
                                    <span className="text-muted-foreground">{t('common:subtotal')}</span>
                                    <span className="font-semibold">{priceDetails.final?.amount?.amount?.toFixed(2)} {priceDetails.currency}</span>
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                     <span className="pl-4 text-muted-foreground">{t('payments:vatIncluded')} ({Number(priceDetails.vat?.rate).toFixed(1)}%)</span>
                                     <span className="text-muted-foreground">{priceDetails.vat?.amount?.toFixed(2)} {priceDetails.currency}</span>
                                  </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between border-t pt-3">
                                  <span className="text-base font-semibold text-foreground">{t('bookings:total')}</span>
                                  <span className="text-base font-semibold text-foreground">{priceDetails.final?.amount?.amount?.toFixed(2)} {priceDetails.currency}</span>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </CardContent>
                </Card>
            )}

            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                    variant="ghost"
                    onClick={handlePaymentCancel}
                    disabled={paymentState.isProcessing || isCancelling}
                    className="w-full sm:w-auto"
                >
                    {paymentState.selectedMethod ? t('payments:goBack', 'Go Back') : t('common:cancel')}
                </Button>

                {paymentState.paymentStep === PAYMENT_STEPS.METHOD && (
                <Button
                    onClick={() => {
                        logger.info('[PaymentFlow.CardFooterButton] "Pay Now" button clicked.', {
                        paymentFlowBookingId: bookingId,
                        selectedMethod: paymentState.selectedMethod ? { id: paymentState.selectedMethod.id } : null,
                        cardComplete: paymentState.cardComplete,
                        canTriggerSubmitRef: !!triggerSubmitRef.current,
                        timestamp: new Date().toISOString()
                    });
                        if (paymentState.selectedMethod) {
                        handlePaymentSubmit(paymentState.selectedMethod);
                        } else if (paymentState.cardComplete && triggerSubmitRef.current) {
                        triggerSubmitRef.current();
                        } else {
                        logger.warn('[PaymentFlow] Pay Now clicked but no valid action', {
                            bookingId,
                            cardComplete: paymentState.cardComplete,
                            hasTrigger: !!triggerSubmitRef.current,
                            timestamp: new Date().toISOString(),
                        });
                        }
                    }}
                    disabled={paymentState.isProcessing || (!paymentState.selectedMethod && !paymentState.cardComplete)}
                    className="w-full sm:w-auto"
                    >
                    {paymentState.isProcessing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    {t('payments:confirmPayment', 'Confirm Payment')}
                    </Button>
                )}
            </div>
        </>
    )}
</CardFooter>

      {paymentState.paymentStep === PAYMENT_STEPS.PROCESSING && (
       <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
          <div className="p-4 rounded-lg bg-card shadow-lg text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">{t('payments:processingMessage')}</p>
          </div>
        </div>
      )}
    </Card>
  );
};

export default PaymentFlow;