import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useStripe, useElements, PaymentElement, Elements } from '@stripe/react-stripe-js';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';
import { Button } from '../ui/button.tsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { Loader2, ShieldCheck, AlertCircle, CreditCard, CheckCircle, X } from 'lucide-react';
import PaymentErrorBoundary from './PaymentErrorBoundary';
import { Card, CardHeader, CardTitle, CardFooter, CardContent } from '../ui/card.tsx';
import SavedPaymentMethodsManager from './SavedPaymentMethodsManager';
import { AuthContext } from '../../contexts/AuthContext';
import { PaymentContext } from '../../contexts/PaymentContext';
import Draggable from 'react-draggable';

const ScaConfirmationModalInternal = ({ clientSecret, onSuccess, onFailure, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation(['payments', 'common']);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isStripeReady, setIsStripeReady] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const { user } = useContext(AuthContext);
  const nodeRef = useRef(null);
  const [confirmationStatus, setConfirmationStatus] = useState('idle'); // 'idle', 'confirmingBackend', 'success', 'error'
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  useEffect(() => {
    if (stripe && elements) {
      setIsStripeReady(true);
      logger.debug('[ScaConfirmationModal] Stripe and Elements ready.', { clientSecret });
    } else {
      logger.debug('[ScaConfirmationModal] Waiting for Stripe/Elements.', { clientSecret });
    }
  }, [stripe, elements, clientSecret]);

  useEffect(() => {
    setSelectedMethodId(null);
    setUseNewCard(false);
    setConfirmationStatus('idle');
    setErrorMessage(null);
    setPaymentIntentId(null);
  }, [clientSecret]);

  const handleSavedMethodSelect = useCallback((methodData) => {
    if (methodData?.id) {
      setSelectedMethodId(methodData.id);
      setUseNewCard(false);
      setErrorMessage(null);
      logger.debug('[ScaConfirmationModal] Saved method selected', { methodId: methodData.id });
    } else {
      setSelectedMethodId(null);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!isStripeReady || !clientSecret) {
      logger.warn('[ScaConfirmationModal] Attempted confirmation before ready or without clientSecret.');
      setErrorMessage(t('payments:error.scaNotReady'));
      return;
    }
    if (!selectedMethodId && !useNewCard) {
       logger.warn('[ScaConfirmationModal] No payment method selected or new card form not active.');
       setErrorMessage(t('payments:error.noMethodSelected'));
       return;
    }

    setConfirmationStatus('confirmingBackend');
    setErrorMessage(null);

    try {
      let stripeError = null;
      let confirmedIntent = null;
      let intentId = null;

      const isSetupIntent = clientSecret.startsWith('seti_');

      if (selectedMethodId) {
        if (isSetupIntent) {
          logger.info('[ScaConfirmationModal] CORRECT PATH: Attempting stripe.confirmCardSetup (Saved Method)', { clientSecret, paymentMethodId: selectedMethodId });
          const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
            payment_method: selectedMethodId,
          });
          stripeError = error;
          confirmedIntent = setupIntent;
          intentId = setupIntent?.id;
        } else { 
          logger.info('[ScaConfirmationModal] CORRECT PATH: Attempting stripe.confirmCardPayment (Saved Method)', { clientSecret, paymentMethodId: selectedMethodId });
          const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: selectedMethodId,
          });
          stripeError = error;
          confirmedIntent = paymentIntent;
          intentId = paymentIntent?.id;
        }
      } else if (useNewCard) {
        logger.info('[ScaConfirmationModal] CORRECT PATH: Attempting elements.submit() then stripe.confirmPayment (New Card)', { clientSecret, isSetupIntent });
        const { error: submitError } = await elements.submit();
        if (submitError) throw submitError;

        const { error, setupIntent, paymentIntent } = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: { return_url: `${window.location.origin}/payment-callback` },
          redirect: 'if_required',
        });
        stripeError = error;
        confirmedIntent = setupIntent || paymentIntent;
        intentId = confirmedIntent?.id;
      } else {
         throw new Error("No payment method specified for confirmation.");
      }

      if (stripeError) {
        logger.error('[ScaConfirmationModal] Stripe confirmation failed client-side', { errorType: stripeError.type, errorMessage: stripeError.message, intentId: stripeError.payment_intent?.id || stripeError.setup_intent?.id });
        setErrorMessage(stripeError.message || t('payments:error.scaConfirmationFailed'));
        setConfirmationStatus('error');
        if (typeof onFailure === 'function') onFailure(stripeError, intentId || null);
      } else if (confirmedIntent && (confirmedIntent.status === 'succeeded' || confirmedIntent.status === 'requires_capture')) {
        setPaymentIntentId(intentId);
        logger.info(`[ScaConfirmationModal] Stripe confirmation successful (status: ${confirmedIntent.status}). Notifying parent component.`);
        setConfirmationStatus('success');
        setTimeout(() => {
          if (typeof onSuccess === 'function') onSuccess(intentId);
        }, 500);
      } else {
        logger.warn('[ScaConfirmationModal] Stripe confirmation resulted in unexpected status', { status: confirmedIntent?.status, intentId });
        const unexpectedError = new Error(t('payments:error.scaUnexpectedStatus', { status: confirmedIntent?.status || 'unknown' }));
        setErrorMessage(unexpectedError.message);
        setConfirmationStatus('error');
        if (typeof onFailure === 'function') onFailure(unexpectedError, intentId || null);
      }
    } catch (err) {
       logger.error('[ScaConfirmationModal] Unexpected error during confirmation process', { errorMessage: err.message, stack: err.stack });
       const displayError = err.message || t('payments:error.scaInternal');
       setErrorMessage(displayError);
       setConfirmationStatus('error');
       if (typeof onFailure === 'function') onFailure(new Error(displayError), null);
    }
  }, [stripe, elements, clientSecret, isStripeReady, selectedMethodId, useNewCard, t, onSuccess, onFailure]);

const renderContent = () => {
    switch (confirmationStatus) {
      case 'confirmingBackend':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center min-h-[120px]">
            <p className="text-muted-foreground">{t('payments:sca.pleaseWait', 'Please wait, this may take a moment.')}</p>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center min-h-[120px]">
            <p className="text-muted-foreground">{t('payments:sca.liveSessionSuccessMessage', 'Your payment method is confirmed. Preparing your session...')}</p>
          </div>
        );

      case 'error':
        return (
          <div className="p-4 space-y-4">
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('payments:error.title')}</AlertTitle>
                <AlertDescription>{errorMessage || t('payments:error.scaInternal')}</AlertDescription>
             </Alert>
              <Button variant="outline" onClick={onClose} className="w-full">
                 {t('common:close', 'Close')}
               </Button>
          </div>
        );

      case 'idle':
      default:
        return (
             <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  <p className="text-sm text-muted-foreground">
                     {t('payments:sca.liveSessionMessage', 'To begin your session, please confirm authorization for an initial time block.')}
                  </p>
                  <SavedPaymentMethodsManager
                     userId={user?.id}
                     onSelect={handleSavedMethodSelect}
                     selectedMethodId={selectedMethodId}
                     disabled={confirmationStatus !== 'idle' || useNewCard}
                     mode="select"
                  />
                 <div className="flex items-center my-4">
                    <div className="flex-grow border-t border-border"></div>
                    <span className="flex-shrink mx-2 text-xs uppercase text-muted-foreground">{t('common:or')}</span>
                    <div className="flex-grow border-t border-border"></div>
                 </div>
                 {!useNewCard ? (
                    <Button
                         variant="outline"
                         className="w-full"
                         onClick={() => { setUseNewCard(true); setSelectedMethodId(null); setErrorMessage(null); }}
                         disabled={confirmationStatus !== 'idle'}
                      >
                         <CreditCard className="mr-2 h-4 w-4" /> {t('payments:useNewCard')}
                      </Button>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="pt-1 text-sm font-medium text-card-foreground">{t('payments:enterNewCardDetails')}</h4>
                      {!isStripeReady ? (
                          <div className="flex items-center justify-center p-4 text-muted-foreground">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            {t('payments:loadingStripe')}
                          </div>
                        ) : (
                           <div className="p-3 bg-transparent border rounded-md border-input">
                             <PaymentElement id="sca-payment-element" />
                           </div>
                        )}
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary hover:text-primary/90" onClick={() => { setUseNewCard(false); setErrorMessage(null); }}>
                        {t('payments:useSavedCardInstead')}
                      </Button>
                     </div>
                  )}
                 <AnimatePresence>
                    {errorMessage && confirmationStatus === 'idle' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Alert variant="destructive" className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>{t('payments:error.title')}</AlertTitle>
                          <AlertDescription>{errorMessage}</AlertDescription>
                        </Alert>
                      </motion.div>
                    )}
                 </AnimatePresence>
               </div>
        );
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
       <motion.div
        key="sca-modal-drag-wrapper"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
      >
        <Draggable handle=".drag-handle" nodeRef={nodeRef} bounds="parent">
          <div ref={nodeRef} className="w-full max-w-md pointer-events-auto">
             <Card className="overflow-hidden rounded-lg shadow-xl">
               <PaymentErrorBoundary
                    onError={(error) => logger.error('[ScaConfirmationModal] Boundary caught error', { error: error.message })}
                    onRetry={() => logger.info('[ScaConfirmationModal] Boundary retry triggered')}
                    onCancel={onClose}
                >
                 <CardHeader className="flex flex-row items-center justify-between p-4 border-b cursor-move drag-handle">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {confirmationStatus === 'success' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                       confirmationStatus === 'error' ? <AlertCircle className="w-5 h-5 text-destructive" /> :
                       confirmationStatus === 'confirmingBackend' ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> :
                       <ShieldCheck className="w-5 h-5 text-primary" />
                       }
                      {confirmationStatus === 'success' ? t('payments:sca.successTitle') :
                       confirmationStatus === 'error' ? t('payments:error.title') :
                       confirmationStatus === 'confirmingBackend' ? t('payments:sca.confirmingBackend') :
                       t('payments:sca.title')
                       }
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 rounded-full" aria-label={t('common:close')}>
                        <X className="w-5 h-5" />
                    </Button>
                 </CardHeader>
                 <CardContent className="p-0">
                   {renderContent()}
                 </CardContent>
                 {confirmationStatus === 'idle' && (
                    <CardFooter className="flex justify-end gap-3 p-4 border-t">
                        <Button variant="outline" onClick={onClose} disabled={confirmationStatus !== 'idle'}>
                          {t('common:cancel')}
                        </Button>
                         <Button
                           onClick={handleConfirm}
                           disabled={confirmationStatus !== 'idle' || !isStripeReady || (!selectedMethodId && !useNewCard)}
                         >
                            <ShieldCheck className="w-4 h-4 mr-2" />
                           {t('payments:sca.confirmButton', 'Confirm Authorization')}
                         </Button>
                    </CardFooter>
                 )}
               </PaymentErrorBoundary>
             </Card>
           </div>
         </Draggable>
      </motion.div>
    </>
  );
};

const ScaConfirmationModal = ({ clientSecret, isOpen, ...props }) => {
    const { stripePromise } = useContext(PaymentContext);

    if (!isOpen || !clientSecret) {
        logger.debug('[ScaConfirmationModalWrapper] Render skipped: No clientSecret or isOpen is false.');
        return null;
    }
    if (!stripePromise) {
         logger.error('[ScaConfirmationModalWrapper] Render skipped: No stripePromise provided.');
         return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                <Alert variant="destructive" className="max-w-md">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Stripe Error</AlertTitle>
                    <AlertDescription>
                        The payment system could not be initialized. Please try again later.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    const options = {
        clientSecret: clientSecret,
        appearance: {
            labels: 'floating',
            variables: {
                colorPrimary: 'hsl(var(--primary))',
                colorBackground: 'hsl(var(--card))',
                colorText: 'hsl(var(--card-foreground))',
                colorDanger: 'hsl(var(--destructive))',
                fontFamily: 'Inter, sans-serif',
                spacingUnit: '4px',
                borderRadius: 'var(--radius)',
             },
             rules: {
                '.Input': {
                  backgroundColor: 'hsl(var(--input))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                },
                '.Input:focus': {
                   borderColor: 'hsl(var(--ring))',
                   boxShadow: 'none',
                },
                '.Tab': {
                    backgroundColor: 'hsl(var(--muted))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--muted-foreground))',
                 },
                 '.Tab:hover': {
                    backgroundColor: 'hsl(var(--accent))',
                    color: 'hsl(var(--accent-foreground))',
                 },
                 '.Tab--selected': {
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--card-foreground))',
                 },
             }
         },
    };

    return (
        <AnimatePresence>
           {isOpen && clientSecret && (
             <Elements stripe={stripePromise} options={options}>
                <ScaConfirmationModalInternal clientSecret={clientSecret} {...props} />
             </Elements>
           )}
         </AnimatePresence>
    );
};

export default ScaConfirmationModal;