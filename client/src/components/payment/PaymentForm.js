import React, { useState, useEffect, useCallback, useContext } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Lock, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { logger } from '../../utils/logger';
import { useUnifiedPayment } from '../../hooks/usePaymentStatus';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import { usePayment } from '../../contexts/PaymentContext';
import { toast } from 'react-hot-toast';
import PaymentSummary from './PaymentSummary';
import PaymentErrorBoundary from './PaymentErrorBoundary';
import { usePaymentActions } from '../../hooks/usePaymentActions';
import SavedPaymentMethodsManager from './SavedPaymentMethodsManager';
import PaymentStepIndicator from './PaymentStepIndicator';
import LoadingStates from './LoadingStates';
import { AuthContext } from '../../contexts/AuthContext';

// Initialize Stripe with publishable key
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const PaymentForm = ({ 
  bookingId, 
  amount, 
  currency = 'CHF', 
  onSuccess, 
  onError,
  onCancel 
}) => {
  const { t } = useTranslation(['common', 'payments']);
  const { user } = useContext(AuthContext);
  useEffect(() => {
    if (!user?.id) {
      logger.error('[PaymentForm] No user ID available');
      onError(new Error(t('payments:userIdentificationError')));
      return;
    }
  }, [user, onError, t]);
  const stripe = useStripe();
  const elements = useElements();
  const { createPaymentIntent, confirmPayment } = usePaymentActions();
  const { state: paymentState, initializePayment, updatePaymentStatus } = usePayment();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [currentStep, setCurrentStep] = useState('method');
  const [showNewCard, setShowNewCard] = useState(!selectedPaymentMethod);
  const [cardComplete, setCardComplete] = useState(false);


  const paymentSteps = ['method', 'review', 'confirm'];

  const handleCardElementChange = useCallback((event) => {
    setCardComplete(event.complete);
    if (event.error) {
      setPaymentError(event.error.message);
    } else {
      setPaymentError(null);
    }
  }, []);

  useEffect(() => {
    logger.info('[PaymentForm] Initializing payment form:', { bookingId, amount, currency });
    initializePayment(bookingId, amount, currency);
  }, [bookingId, amount, currency, initializePayment]);

  useEffect(() => {
    if (selectedPaymentMethod) {
      setShowNewCard(false);
      // Reset any card element errors
      if (elements?.getElement(CardElement)) {
        elements.getElement(CardElement).clear();
      }
    }
  }, [selectedPaymentMethod, elements]);

  const isPaymentDisabled = useCallback(() => {
    if (isProcessing) return true;
    if (!stripe) return true;
    if (selectedPaymentMethod) return false;
    if (showNewCard) return !cardComplete;
    return true;
  }, [isProcessing, stripe, selectedPaymentMethod, showNewCard, cardComplete]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (currentStep === 'method') {
      setCurrentStep('review');
    } else if (currentStep === 'review') {
      setCurrentStep('processing');
      setIsProcessing(true);
      setPaymentError(null);

      try {
        logger.info('[PaymentForm] Initiating payment process:', { bookingId });

        let paymentMethodId = selectedPaymentMethod?.id;

        if (!paymentMethodId) {
          const cardElement = elements.getElement(CardElement);
          const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
          });

          if (error) {
            throw new Error(error.message);
          }

          paymentMethodId = paymentMethod.id;
        }

        const { clientSecret } = await createPaymentIntent(bookingId);
        
        const { paymentIntent, error } = await confirmPayment(clientSecret, paymentMethodId);

        if (error) {
          throw new Error(error.message);
        }

        logger.info('[PaymentForm] Payment successful:', { 
          bookingId, 
          paymentIntentId: paymentIntent.id 
        });

        updatePaymentStatus(bookingId, 'succeeded');
        setCurrentStep('confirm');
        onSuccess(paymentIntent);

      } catch (error) {
        logger.error('[PaymentForm] Payment error:', { 
          bookingId, 
          error: error.message 
        });
        setPaymentError(error.message);
        updatePaymentStatus(bookingId, 'failed', error.message);
        onError(error);
        setCurrentStep('method');
      } finally {
        setIsProcessing(false);
      }
    }
  };
  const handlePaymentMethodSelection = useCallback((method) => {
    if (!method?.id) {
      logger.error('[PaymentForm] Invalid payment method selected:', {
        method,
        bookingId,
        timestamp: new Date().toISOString()
      });
      return;
    }
  
    logger.info('[PaymentForm] Payment method selected:', { 
      bookingId, 
      methodId: method.id,
      brand: method.brand,
      last4: method.last4,
      timestamp: new Date().toISOString()
    });
  
    setSelectedPaymentMethod(method);
  
    // If we're in method selection step, move to review
    if (currentStep === 'method') {
      logger.debug('[PaymentForm] Moving to review step after method selection');
      setCurrentStep('review');
    }
  }, [bookingId, currentStep]);

  useEffect(() => {
    if (selectedPaymentMethod?.id) {
      logger.info('[PaymentForm] Selected payment method updated:', {
        methodId: selectedPaymentMethod.id,
        brand: selectedPaymentMethod.brand,
        last4: selectedPaymentMethod.last4,
        bookingId,
        timestamp: new Date().toISOString()
      });
    }
  }, [selectedPaymentMethod, bookingId]);

  const renderPaymentStep = () => {
    switch (currentStep) {
      case 'processing':
        return <LoadingStates state="processing" />;
      case 'confirming':
        return <LoadingStates state="confirming" />;
      case 'review':
        return (
          <div className="payment-review">
            <PaymentSummary amount={amount} currency={currency} />
            <button
              className="confirm-button"
              onClick={handleSubmit}
              disabled={isProcessing}
            >
              {t('payments:confirmAndPay')}
            </button>
          </div>
        );
      case 'confirm':
        return (
          <div className="payment-confirmation">
            <CheckCircle size={48} className="text-green-500 mb-4" />
            <h3>{t('payments:paymentSuccessful')}</h3>
            <p>{t('payments:bookingConfirmed')}</p>
            <button className="close-button" onClick={onSuccess}>
              {t('common:close')}
            </button>
          </div>
        );
        case 'method':
          default:
            return (
              <>
                <SavedPaymentMethodsManager
                  onSelect={handlePaymentMethodSelection}
                  selectedMethodId={selectedPaymentMethod?.id}
                  userId={user?.id}
                />
                {!showNewCard && selectedPaymentMethod ? (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="selected-payment-method"
  >
    <SavedPaymentMethodsManager
      onSelect={handlePaymentMethodSelection}
      selectedMethodId={selectedPaymentMethod?.id}
      userId={user?.id}
    />
    <button
      type="button"
      onClick={() => {
        setSelectedPaymentMethod(null);
        setShowNewCard(true);
      }}
      className="mt-4 text-sm text-primary hover:text-primary-dark"
    >
      {t('payments:useNewCard')}
    </button>
  </motion.div>
) : (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="new-payment-method"
  >
    {showNewCard && (
      <CardElement
        options={{
          style: {
            base: {
              fontSize: '16px',
              color: '#424770',
              '::placeholder': {
                color: '#aab7c4',
              },
            },
            invalid: {
              color: '#9e2146',
            },
          },
        }}
        onChange={handleCardElementChange}
      />
    )}
    <SavedPaymentMethodsManager
      onSelect={handlePaymentMethodSelection}
      selectedMethodId={selectedPaymentMethod?.id}
      userId={user?.id}
    />
  </motion.div>
)}

              </>
            );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="payment-form"
    >
      <h2>{t('payments:paymentDetails')}</h2>

      <PaymentStepIndicator currentStep={currentStep} steps={paymentSteps} />

      <form onSubmit={handleSubmit}>
        {renderPaymentStep()}
      </form>

      <AnimatePresence>
        {paymentError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="error-message"
          >
            <AlertTriangle size={20} />
            <span>{paymentError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="secure-payment-info">
        <Lock size={16} />
        <span>{t('payments:securePaymentInfo')}</span>
      </div>
    </motion.div>
  );
};

// Wrapper component that provides Stripe context
export const StripePaymentForm = (props) => (
  <PaymentErrorBoundary
    onError={(error, errorInfo) => {
      logger.error('[StripePaymentForm] Payment error caught:', {
        error: error.message,
        info: errorInfo,
        bookingId: props.bookingId
      });
    }}
    onRetry={(attemptNumber) => {
      logger.info('[StripePaymentForm] Retrying payment:', {
        attempt: attemptNumber,
        bookingId: props.bookingId
      });
    }}
    onCancel={(error) => {
      logger.info('[StripePaymentForm] Payment cancelled:', {
        error: error?.message,
        bookingId: props.bookingId
      });
      props.onCancel?.();
    }}
    maxRetries={3}
  >
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  </PaymentErrorBoundary>
);

export default StripePaymentForm;