import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom'; // Add this import
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { logger } from '../../utils/logger';
import PaymentFlow from './flows/PaymentFlow';
import PaymentErrorBoundary from './PaymentErrorBoundary';
import PropTypes from 'prop-types';
import { PaymentOrchestrator } from '../../services/PaymentOrchestratorService';

const PaymentPopup = ({
  isOpen,
  onClose,
  onCancel,
  onComplete,
  bookingId,
  amount,
  currency,
  sessionStartTime,
  clientSecret,
  isCancelling,
  priceDetails,
}) => {
  logger.info('[PaymentPopup] Component rendered', { bookingId, isOpen, timestamp: new Date().toISOString() });
  const [paymentStep, setPaymentStep] = useState('method');
  const [modalState, setModalState] = useState('payment_active');
  const [orchestratorState, setOrchestratorState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

const handleClose = useCallback((source = 'unknown') => {
  logger.info('[PaymentPopup.handleClose_PROP_CALLER] Function CALLED, about to call main onClose prop.', {
    popupBookingId: bookingId,
    sourceOfCloseCall: source, 
    currentPaymentStep: paymentStep,
    currentModalState: modalState,
    timestamp: new Date().toISOString(),
  });
  onClose(); // Just call the prop directly.
}, [onClose, bookingId, paymentStep, modalState]);

  useEffect(() => {
    logger.info('[PaymentPopup] Mounting with isOpen', { bookingId, isOpen, timestamp: new Date().toISOString() });
    if (!bookingId || !isOpen) {
      logger.warn('[PaymentPopup] Skipping subscription due to missing bookingId or isOpen', {
        bookingId,
        isOpen,
        timestamp: new Date().toISOString(),
      });
      return;
    }

   logger.info('[PaymentPopup] Attempting to subscribe to state.', {
      bookingId: bookingId,
      timestamp: new Date().toISOString()
    });

    const unsubscribe = PaymentOrchestrator.subscribeToState(bookingId, (state) => {
      logger.info('[PaymentPopup] SUCCESS: State update received from Orchestrator.', {
        bookingId: bookingId,
        receivedStateId: state.id,
        status: state.status,
        timestamp: new Date().toISOString(),
      });
      setPaymentStep(state.paymentStep || 'method');
      setModalState(state.modalState || 'payment_active');
      setOrchestratorState(state);
      setIsLoading(false);
    });

    return () => {
      logger.info('[PaymentPopup] Unmounting with isOpen', { bookingId, isOpen, timestamp: new Date().toISOString() });
      unsubscribe();
    };
  }, [bookingId, isOpen]);

  useEffect(() => {
    logger.debug('[PaymentPopup] State updated', {
      bookingId,
      paymentStep,
      modalState,
      isLoading,
      orchestratorStateKeys: orchestratorState ? Object.keys(orchestratorState) : [],
      timestamp: new Date().toISOString(),
    });
  }, [paymentStep, modalState, isLoading, orchestratorState, bookingId]);

  if (!isOpen) {
    logger.debug('[PaymentPopup] Not rendering due to isOpen false', { bookingId, timestamp: new Date().toISOString() });
    return null;
  }

  const handlePaymentSuccess = (paymentDetails) => {
    logger.info('[PaymentPopup.handlePaymentSuccess] Function CALLED.', {
        popupBookingId: bookingId,
        paymentDetails,
        timestamp: new Date().toISOString()
    });
    logger.info('[PaymentPopup] Payment succeeded', {
      bookingId,
      timestamp: new Date().toISOString(),
    });
    if (onComplete) {
      onComplete(true); // Notify success
    }
    handleClose();
  };

  const handlePaymentError = (error) => {
    logger.error('[PaymentPopup] Payment failed', {
      bookingId,
      errorMessage: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    logger.info('[PaymentPopup.handlePaymentError] Function CALLED.', {
      popupBookingId: bookingId, // This is the bookingId prop of PaymentPopup
      errorMessage: error.message,
      timestamp: new Date().toISOString()
  });
    if (onComplete) {
      onComplete(false); // Notify failure
    }
    handleClose();
  };

const handlePaymentCancel = () => {
  logger.info('[PaymentPopup.handlePaymentCancel] Function CALLED.', {
    popupBookingId: bookingId,
    currentPaymentStep: paymentStep,
    timestamp: new Date().toISOString()
  });

  if (paymentStep !== 'method' && orchestratorState?.selectedPaymentMethod) {
    logger.info('[PaymentPopup] User clicked Go Back, returning to previous step', {
      bookingId,
      currentStep: paymentStep,
      timestamp: new Date().toISOString(),
    });
    PaymentOrchestrator.goBack(bookingId);
    return;
  }
  
  logger.info('[PaymentPopup] Payment flow cancelled by user, calling onCancel prop.', {
    bookingId,
    paymentStep,
    modalState,
    timestamp: new Date().toISOString(),
  });
  onCancel();
};

  const popupContent = (
    <motion.div
      className="payment-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        e.stopPropagation();
        handlePaymentCancel();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 2147483100,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <motion.div
        className="payment-flow-popup"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <PaymentErrorBoundary>
          {isLoading ? (
            <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}>
              <Loader2 className="animate-spin" size={32} />
              <span style={{ marginTop: '16px', fontSize: '16px', color: '#374151' }}>
                Loading payment options...
              </span>
            </div>
          ) : (
            <PaymentFlow
              bookingId={bookingId}
              amount={amount}
              currency={currency}
              sessionStartTime={sessionStartTime}
              clientSecret={clientSecret}
              isCancelling={isCancelling}
              orchestratorState={orchestratorState}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={handlePaymentCancel}
              priceDetails={priceDetails}
              logger={logger.info('[PaymentPopup] Rendering PaymentFlow with props:', {
                  bookingId,
                  amount,
                  currency,
                  hasClientSecret: !!clientSecret,
                  timestamp: new Date().toISOString()
              })}
            />
          )}
        </PaymentErrorBoundary>
      </motion.div>
    </motion.div>
  );

  // Portal the content to the root of the DOM
  const portalContainer = document.body;
  logger.info('[PaymentPopup] Rendering with portal', {
    bookingId,
    isOpen,
    portalContainerExists: !!portalContainer,
    timestamp: new Date().toISOString(),
  });

  return createPortal(popupContent, portalContainer);
};

PaymentPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onComplete: PropTypes.func,
  bookingId: PropTypes.string.isRequired,
  amount: PropTypes.number.isRequired,
  currency: PropTypes.string.isRequired,
  sessionStartTime: PropTypes.instanceOf(Date).isRequired,
  clientSecret: PropTypes.string,
  priceDetails: PropTypes.shape({
    base: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    final: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    currency: PropTypes.string,
    vat: PropTypes.shape({
      rate: PropTypes.number,
      amount: PropTypes.number
    }),
    platformFee: PropTypes.shape({
      percentage: PropTypes.number,
      amount: PropTypes.oneOfType([PropTypes.number, PropTypes.object])
    })
  }),
};

export default PaymentPopup;