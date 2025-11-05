// src/components/payment/forms/PaymentMethodForm.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Lock, Save, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { logger } from '../../../utils/logger';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card.tsx';

const PAYMENT_LOG_KEYS = {
  INIT: 'payment_initialization',
  FLOW: 'payment_flow',
  STATE: 'payment_state',
  ERROR: 'payment_error',
  CLEANUP: 'payment_cleanup',
};

const PaymentMethodForm = ({
  onSubmit,
  onSave,
  onCancel,
  showSaveOption = true,
  defaultSave = true,
  processingText,
  bookingId,
  onCardStatusChange,
  isStripeReady, // Prop to control rendering
  triggerSubmit,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saveCard, setSaveCard] = useState(defaultSave);
  const { t } = useTranslation(['payments']);
  const [transitionLock, setTransitionLock] = useState(false);
  const retryTimeoutRef = useRef(null);

  // Wait for both isStripeReady and stripe/elements to be available
  useEffect(() => {
    if (isStripeReady && stripe && elements) {
      logger.info('[PaymentMethodForm] Component mounted with Stripe fully ready', {
        hasStripe: !!stripe,
        hasElements: !!elements,
        showSaveOption,
        defaultSave,
        bookingId,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.debug('[PaymentMethodForm] Waiting for Stripe readiness', {
        isStripeReady,
        hasStripe: !!stripe,
        hasElements: !!elements,
        bookingId,
        timestamp: new Date().toISOString(),
      });
    }

    return () => {
      logger.debug('[PaymentMethodForm] Component cleanup');
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [stripe, elements, isStripeReady]);

  useEffect(() => {
    logger.debug('[PaymentMethodForm] Stripe context update:', {
      hasStripe: !!stripe,
      hasElements: !!elements,
      isStripeReady,
      bookingId,
      timestamp: new Date().toISOString(),
    });
  }, [stripe, elements, isStripeReady]);

  const handleTriggerSubmit = () => {
    logger.info('[PaymentMethodForm] Triggering submit via prop', {
      bookingId,
      timestamp: new Date().toISOString(),
    });
    // Simulate event with a minimal preventDefault
    handleSubmit({ preventDefault: () => logger.debug('[PaymentMethodForm] Simulated preventDefault called') });
  };

  if (triggerSubmit) {
    triggerSubmit.current = handleTriggerSubmit; // Expose via ref-like prop
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || transitionLock || !isStripeReady) {
      logger.error('[PaymentMethodForm] Cannot submit:', {
        hasStripe: !!stripe,
        hasElements: !!elements,
        isLocked: transitionLock,
        isStripeReady,
        bookingId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    setTransitionLock(true);
    setProcessing(true);
    setError(null);

    try {
      logger.info('[PaymentMethodForm] Creating payment method', {
        bookingId,
        timestamp: new Date().toISOString(),
      });

      const cardElement = elements.getElement(CardElement);
      const { error: createError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (createError) {
        logger.error('[PaymentMethodForm] Payment method creation error:', {
          error: createError.message,
          type: createError.type,
          bookingId,
          timestamp: new Date().toISOString(),
        });
        throw createError;
      }

      logger.info('[PaymentMethodForm] Payment method created:', {
        paymentMethodId: paymentMethod.id,
        shouldSave: saveCard,
        bookingId,
        timestamp: new Date().toISOString(),
      });

      // Try saving card first if requested
      if (saveCard) {
        try {
          await onSave?.(paymentMethod);
        } catch (saveError) {
          logger.warn('[PaymentMethodForm] Failed to save card but continuing:', {
            error: saveError.message,
            paymentMethodId: paymentMethod.id,
            bookingId,
            timestamp: new Date().toISOString(),
          });
          // Don't throw - continue with payment even if save fails
        }
      }

      await onSubmit(paymentMethod);

    } catch (error) {
      logger.error('[PaymentMethodForm] Submission error:', {
        error: error.message,
        code: error.code,
        stack: error.stack,
        bookingId,
        timestamp: new Date().toISOString(),
      });

      setError(error.message);

      // Setup retry timeout for recoverable errors
      if (error.recoverable) {
        retryTimeoutRef.current = setTimeout(() => {
          setTransitionLock(false);
          setProcessing(false);
          logger.info('[PaymentMethodForm] Unlocked for retry', {
            bookingId,
            timestamp: new Date().toISOString(),
          });
        }, 2000); // 2 second cooldown
      }
    } finally {
      if (!error?.recoverable) {
        setTransitionLock(false);
        setProcessing(false);
      }
    }
  };

  const handleCardChange = (event) => {
    if (transitionLock) return;

    logger.debug('[PaymentMethodForm] Card input changed:', {
      empty: event.empty,
      complete: event.complete,
      error: event.error?.message,
      bookingId,
      timestamp: new Date().toISOString(),
    });

    setCardComplete(event.complete);
    setError(event.error?.message || null);
    onCardStatusChange?.(event.complete, event);
  };

  if (!isStripeReady || !stripe || !elements) {
    logger.debug('[PaymentMethodForm] Waiting for Stripe initialization', {
      isStripeReady,
      hasStripe: !!stripe,
      hasElements: !!elements,
      bookingId,
      timestamp: new Date().toISOString(),
    });
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t('payments:cardDetails')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#333333',
                    '::placeholder': {
                      color: '#666666',
                    },
                  },
                  invalid: {
                    color: '#ef4444',
                  },
                },
                hidePostalCode: true,
              }}
              onChange={handleCardChange}
              className="p-3 border rounded-md shadow-sm"
            />

            <AnimatePresence mode="wait">
              {cardComplete && !error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500"
                >
                  <CheckCircle className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {showSaveOption && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveCard}
                onChange={(e) => setSaveCard(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-gray-600">
                {t('payments:saveCardForFuture')}
              </span>
            </label>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-md"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-xs text-center text-gray-500 mt-4">
            <Lock className="h-3 w-3 inline-block mr-1" />
            {t('payments:securePaymentInfo')}
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

export default PaymentMethodForm;