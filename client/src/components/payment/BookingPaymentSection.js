// src/components/payment/BookingPaymentSection.js

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';
import { usePayment } from '../../contexts/PaymentContext';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import { StripePaymentForm } from './PaymentForm';
import PaymentStatus from './PaymentStatus';
import PaymentSummary from './PaymentSummary';
import { toast } from 'react-hot-toast';

const BookingPaymentSection = ({
  bookingId,
  bookingData,
  onPaymentSuccess,
  onPaymentError,
  onCancel,
  isConnected = false
}) => {
  const { t } = useTranslation(['payments', 'common']);
  const { state: paymentState, initializePayment } = usePayment();
  const {
    startPaymentFlow,
    handlePaymentConfirmation,
    resetFlow,
    isProcessing,
    currentStatus,
    lastError
  } = usePaymentFlow(bookingId);

  const [paymentIntent, setPaymentIntent] = useState(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  useEffect(() => {
    logger.info('[BookingPaymentSection] Component mounted:', {
      bookingId,
      hasBookingData: !!bookingData,
      currentStatus
    });

    // Initialize payment in context when component mounts
    if (bookingData?.price) {
      initializePayment(
        bookingId,
        bookingData.price.final,
        bookingData.price.currency,
        {
          isConnected,
          sessionType: bookingData.sessionType?._id,
          duration: bookingData.duration
        }
      );
    }

    return () => {
      logger.info('[BookingPaymentSection] Component unmounting:', { bookingId });
      resetFlow();
    };
  }, [bookingId, bookingData, initializePayment, resetFlow]);

  // Handle payment status changes
  useEffect(() => {
    if (currentStatus === 'succeeded') {
      logger.info('[BookingPaymentSection] Payment succeeded:', { bookingId });
      onPaymentSuccess(paymentState.activePayments.get(bookingId)?.paymentIntent);
    } else if (lastError) {
      logger.error('[BookingPaymentSection] Payment error:', {
        bookingId,
        error: lastError.message
      });
      onPaymentError(lastError);
    }
  }, [currentStatus, lastError, bookingId, paymentState, onPaymentSuccess, onPaymentError]);

  const handleStartPayment = async () => {
    logger.info('[BookingPaymentSection] Starting payment flow:', { bookingId });
    setPaymentProcessing(true);

    try {
      const { clientSecret } = await startPaymentFlow(
        bookingData.price.final,
        bookingData.price.currency,
        {
          bookingId,
          sessionType: bookingData.sessionType?._id,
          isConnected
        }
      );

      logger.info('[BookingPaymentSection] Payment intent created:', { bookingId });
      setPaymentIntent(clientSecret);

    } catch (error) {
      logger.error('[BookingPaymentSection] Error starting payment:', {
        bookingId,
        error: error.message
      });
      toast.error(t('payments:errorStartingPayment'));
      onPaymentError(error);
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handlePaymentSuccess = async (paymentMethodId) => {
    logger.info('[BookingPaymentSection] Processing payment confirmation:', {
      bookingId,
      paymentMethodId
    });

    try {
      setPaymentProcessing(true);
      await handlePaymentConfirmation(paymentIntent, paymentMethodId);
    } catch (error) {
      logger.error('[BookingPaymentSection] Payment confirmation failed:', {
        bookingId,
        error: error.message
      });
      onPaymentError(error);
    } finally {
      setPaymentProcessing(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        className="booking-payment-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <div className="payment-header">
          <h3 className="text-lg font-semibold flex items-center">
            <CreditCard className="w-5 h-5 mr-2" />
            {t('payments:completePayment')}
          </h3>
        </div>

        <PaymentSummary
          amount={bookingData.price?.final}
          currency={bookingData.price?.currency}
          isConnected={isConnected}
          showVAT={true}
          className="mb-6"
        />

        {currentStatus && currentStatus !== 'initializing' ? (
          <PaymentStatus
            status={currentStatus}
            error={lastError}
            amount={bookingData.price?.final}
            currency={bookingData.price?.currency}
            onRetry={resetFlow}
            className="mb-4"
          />
        ) : null}

        {(!currentStatus || currentStatus === 'initializing' || currentStatus === 'requires_retry') && (
          <StripePaymentForm
            clientSecret={paymentIntent}
            amount={bookingData.price?.final}
            currency={bookingData.price?.currency}
            onPaymentSuccess={handlePaymentSuccess}
            isProcessing={paymentProcessing}
            onCancel={onCancel}
          />
        )}

        {isProcessing && (
          <div className="processing-overlay">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="mt-2">{t('payments:processing')}</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default BookingPaymentSection;