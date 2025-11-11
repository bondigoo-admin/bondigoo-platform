import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Trash2, AlertTriangle, Loader2, PlusCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { logger } from '../../utils/logger';
import paymentAPI from '../../services/paymentAPI';
import { AuthContext } from '../../contexts/AuthContext';
import { PaymentContext } from '../../contexts/PaymentContext';
import PaymentErrorBoundary from './PaymentErrorBoundary';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { useStripe, useElements } from '@stripe/react-stripe-js';
import PaymentMethodForm from './forms/PaymentMethodForm';
import { cn } from '../../lib/utils';

const cardVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      type: "spring",
      stiffness: 400,
      damping: 25
    }
  }),
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }
};

const AddCardFormBody = ({ onSuccess, onCancel, userId, paymentMethods }) => {
    const { t } = useTranslation(['payments', 'common']);
    const [isProcessing, setIsProcessing] = useState(false);
    const triggerSubmitRef = useRef(null);
    const stripe = useStripe();
    const elements = useElements();
    const isStripeReady = !!stripe && !!elements;
    const [cardIsComplete, setCardIsComplete] = useState(false);

    const handleSaveNewCard = async (paymentMethod) => {
        setIsProcessing(true);
        try {
            const isFirstMethod = paymentMethods.length === 0;
            await paymentAPI.addPaymentMethod(userId, paymentMethod.id, isFirstMethod);
            toast.success(t('payments:paymentMethodAdded'));
            onSuccess();
        } catch (error) {
            logger.error('[SPMM] Failed to add payment method', { error: error.message, userId });
            toast.error(t('payments:errorAddingMethod'));
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <>
            <div className="py-4">
                <PaymentMethodForm
                    onSubmit={handleSaveNewCard}
                    onCardStatusChange={(isComplete) => setCardIsComplete(isComplete)}
                    isStripeReady={isStripeReady}
                    showSaveOption={false}
                    triggerSubmit={triggerSubmitRef}
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
                    {t('common:cancel', 'Cancel')}
                </Button>
                <Button onClick={() => triggerSubmitRef.current?.()} disabled={isProcessing || !cardIsComplete || !isStripeReady}>
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('payments:addCard', 'Add Card')}
                </Button>
            </DialogFooter>
        </>
    );
};

const SavedPaymentMethodsManager = ({ userId, onSelect, selectedMethodId, mode = 'select', disabled = false }) => {
  const { t } = useTranslation(['payments']);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadPaymentMethods = useCallback(async () => {
    if (!userId) {
      logger.error('[SPMM] Cannot load methods: Missing userId');
      setError(t('payments:userIdentificationError'));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setError(null);
      const methods = await paymentAPI.getPaymentMethods(userId);
      setPaymentMethods(methods);
    } catch (err) {
      logger.error('[SPMM] Error loading payment methods:', { error: err.message, userId });
      setError(t('payments:errorLoadingMethods'));
      toast.error(t('payments:errorLoadingMethods'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  const handleMethodClick = (method) => {
    if (disabled || !onSelect || mode === 'manage') return;
    const newSelectedMethod = selectedMethodId === method.id ? null : method;
    onSelect(newSelectedMethod);
  };

  const handleDelete = async (event, methodId) => { 
    event.stopPropagation();
    try {
      await paymentAPI.deletePaymentMethod(methodId);
      toast.success(t('payments:methodDeleted'));
      await loadPaymentMethods(); // Refresh list
      if (selectedMethodId === methodId && onSelect) {
        onSelect(null);
      }
    } catch (err) {
      logger.error('[SPMM] Error deleting payment method:', { error: err.message, methodId });
      toast.error(t('payments:errorDeletingMethod'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        <span>{t('payments:loadingMethods')}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20" role="alert">
        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <PaymentErrorBoundary onRetry={loadPaymentMethods}>
      <div className="space-y-2 mb-2">
        <AnimatePresence>
          {paymentMethods.map((method, i) => (
            <motion.div
              key={method.id}
              layout
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => handleMethodClick(method)}
              onKeyPress={(e) => !disabled && mode !== 'manage' && (e.key === 'Enter' || e.key === ' ') && handleMethodClick(method)}
              className={cn(
                "flex items-center justify-between p-3.5 rounded-lg border transition-all duration-200 ease-in-out group focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500",
                selectedMethodId === method.id
                  ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-500/10'
                  : 'border-input bg-card hover:border-slate-400 dark:hover:border-slate-600',
                disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : (mode === 'manage' ? 'cursor-default' : 'cursor-pointer')
              )}
              role={mode !== 'manage' ? 'radio' : undefined}
              aria-checked={mode !== 'manage' ? selectedMethodId === method.id : undefined}
              tabIndex={disabled ? -1 : 0}
            >
              <div className="flex-grow flex items-center min-w-0 mr-4">
                <CreditCard className="w-6 h-6 mr-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium text-sm text-card-foreground truncate">
                    {method.brand?.toUpperCase() ?? 'Card'} •••• {method.last4}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('payments:expiresLabel', 'Expires:')} {String(method.expMonth).padStart(2, '0')}/{String(method.expYear).slice(-2)}
                  </span>
                </div>
              </div>

              {mode === 'manage' ? (
                !disabled && (
                  <Button variant="ghost" size="icon-sm" onClick={(e) => handleDelete(e, method.id)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label={t('payments:deleteMethod')}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )
              ) : (
                <div className="flex items-center pl-2" aria-hidden="true">
                  <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors duration-200",
                      selectedMethodId === method.id ? 'border-indigo-600' : 'border-slate-300 dark:border-slate-700'
                  )}>
                    <AnimatePresence>
                      {selectedMethodId === method.id && (
                        <motion.div
                          className="w-2.5 h-2.5 bg-indigo-600 rounded-full"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {mode === 'manage' && (
        <div className="mt-5">
          <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('payments:addMethod', 'Add New Payment Method')}
          </Button>
        </div>
      )}

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payments:addMethodTitle', 'Add New Payment Method')}</DialogTitle>
            <DialogDescription>{t('payments:addMethodDesc', 'Your new payment method will be securely stored.')}</DialogDescription>
          </DialogHeader>
          <AddCardFormBody
            userId={userId}
            paymentMethods={paymentMethods}
            onSuccess={() => {
              setIsAddModalOpen(false);
              loadPaymentMethods();
            }}
            onCancel={() => setIsAddModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </PaymentErrorBoundary>
  );
};

export default SavedPaymentMethodsManager;