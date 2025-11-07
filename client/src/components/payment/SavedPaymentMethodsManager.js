import React, { useState, useEffect, useContext, useRef } from 'react';
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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30
    }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: { duration: 0.2 }
  }
};

/**
 * @typedef {Object} PaymentMethod
 * @property {string} id - Unique identifier
 * @property {string} brand - Card brand
 * @property {string} last4 - Last 4 digits
 * @property {number} expMonth - Expiration month
 * @property {number} expYear - Expiration year
 * @property {boolean} isDefault - Whether this is the default method
 */

const SavedPaymentMethodsManager = ({ userId, onSelect, selectedMethodId, mode, disabled = false, bookingId = null }) => {
  useEffect(() => {
    logger.info('[SPMM] Component Props Received', { userId, mode, selectedMethodId, disabled, hasOnSelect: !!onSelect });
  }, [userId, mode, selectedMethodId, disabled, onSelect]);
  const { t } = useTranslation(['payments']);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { user } = useContext(AuthContext);
  const { state: paymentState } = useContext(PaymentContext);
  const { stripePromise } = useContext(PaymentContext);

    const AddCardFormBody = ({ onSuccess, onCancel }) => {
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
                <Button onClick={() => triggerSubmitRef.current?.()} disabled={isProcessing || !cardIsComplete}>
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('payments:addCard', 'Add Card')}
                </Button>
            </DialogFooter>
        </>
    );
  };

  const loadPaymentMethods = async () => {
    try {
      if (!userId) {
        logger.error('[SavedPaymentMethodsManager] Cannot load payment methods: Missing userId');
        setError(t('payments:userIdentificationError'));
        return;
      }

      setIsLoading(true);
      setError(null);
      
      logger.info('[SavedPaymentMethodsManager] Loading payment methods:', {
        userId,
        currentState: {
          hasExistingMethods: paymentMethods.length > 0,
          selectedMethodId
        },
        timestamp: new Date().toISOString()
      });
      
      const methods = await paymentAPI.getPaymentMethods(userId);
      
      logger.debug('[SavedPaymentMethodsManager] Payment methods loaded:', {
        count: methods.length,
        methods: methods.map(m => ({
          id: m.id,
          brand: m.brand,
          last4: m.last4,
          isDefault: m.isDefault,
          hasMethodId: !!m.id
        })),
        timestamp: new Date().toISOString()
      });
      
      setPaymentMethods(methods);
    } catch (error) {
      logger.error('[SavedPaymentMethodsManager] Error loading payment methods:', {
        error: error.message,
        userId,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      setError(t('payments:errorLoadingMethods'));
      toast.error(t('payments:errorLoadingMethods'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentMethods();
  }, [userId]);

  const getAriaLabel = (method) => {
    return t('payments:methodAriaLabel', {
      brand: method.brand,
      last4: method.last4,
      month: method.expMonth.toString().padStart(2, '0'),
      year: method.expYear,
      isDefault: method.isDefault
    });
  };

  const handleSetDefault = async (event, method) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      if (!method?.id || !userId) {
        logger.error('[SavedPaymentMethodsManager] Cannot set default: Missing required data', {
          hasMethodId: !!method?.id,
          hasUserId: !!userId,
          timestamp: new Date().toISOString()
        });
        toast.error(t('payments:errorSettingDefault'));
        return;
      }
  
      logger.info('[SavedPaymentMethodsManager] Setting default payment method:', {
        methodId: method.id,
        brand: method.brand,
        last4: method.last4,
        userId,
        timestamp: new Date().toISOString()
      });
      
      await paymentAPI.setDefaultPaymentMethod(method.id, userId);
      await loadPaymentMethods();
      
      toast.success(t('payments:defaultMethodSet'));
    } catch (error) {
      logger.error('[SavedPaymentMethodsManager] Error setting default method:', {
        error: error.message,
        methodId: method?.id,
        userId,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      toast.error(t('payments:errorSettingDefault'));
    }
  };

  const handleMethodClick = (method) => {
    if (disabled || !onSelect) return;

    logger.info('[SPMM.handleMethodClick] Method selected. Calling onSelect.', {
      methodId: method.id,
      brand: method.brand,
      last4: method.last4,
      currentSelectedMethodIdProp: selectedMethodId,
      bookingIdProp: bookingId,
      disabledProp: disabled,
      modeProp: mode,
      timestamp: new Date().toISOString()
    });

    const newSelectedMethod = selectedMethodId === method.id ? null : method;
    onSelect(newSelectedMethod);
  };

  const handleDelete = async (event, methodId) => { 
    event.stopPropagation(); 
    try {
      logger.info('[SavedPaymentMethodsManager] Deleting payment method:', {
        methodId,
        userId,
        timestamp: new Date().toISOString()
      });
      await paymentAPI.deletePaymentMethod(methodId);
      await loadPaymentMethods();
      toast.success(t('payments:methodDeleted'));
      if (selectedMethodId === methodId && onSelect) {
        onSelect(null);
      }
    } catch (error) {
      logger.error('[SavedPaymentMethodsManager] Error deleting payment method:', {
        error: error.message, methodId, userId, stack: error.stack, timestamp: new Date().toISOString()
      });
      toast.error(t('payments:errorDeletingMethod'));
    }
  };

  if (!userId) {
    logger.error('[SavedPaymentMethodsManager] Missing required userId');
    return (
      <div className="flex items-center p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20" role="alert">
        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
        <span>{t('payments:userIdentificationError')}</span>
      </div>
    );
  }

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
    <PaymentErrorBoundary
      onError={(error) => {
        logger.error('[SavedPaymentMethodsManager] Boundary caught error:', {
          error: error.message, userId, timestamp: new Date().toISOString()
        });
      }}
      onRetry={() => {
        logger.info('[SavedPaymentMethodsManager] Retrying after error');
        loadPaymentMethods();
      }}
      maxRetries={3}
    >
      <div className="space-y-2">
        {!isLoading && !error && paymentMethods.length === 0 && (
           <p className="text-sm text-muted-foreground py-2 px-1">{t('payments:noSavedMethods')}</p>
        )}
                <AnimatePresence>
          {!isLoading && !error && paymentMethods.map((method) => (
            <motion.div
              key={method.id}
              layout
              onClick={mode !== 'manage' ? () => handleMethodClick(method) : undefined}
              className={`relative flex items-center justify-between p-3 border rounded-lg transition-all duration-150 ease-in-out group
                ${selectedMethodId === method.id 
                  ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary' 
                  : 'border-input bg-card hover:bg-muted/50 dark:hover:bg-muted/20'}
                ${disabled ? 'opacity-60 cursor-not-allowed' : (mode === 'manage' ? 'cursor-default' : 'cursor-pointer')}
              `}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={cardVariants}
              role="radio"
              tabIndex={disabled ? -1 : 0}
              onKeyPress={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && handleMethodClick(method)}
              aria-checked={selectedMethodId === method.id}
              aria-labelledby={`method-details-${method.id}`}
              aria-disabled={disabled}
            >
              <div className="flex-grow flex items-center min-w-0 mr-2">
                <CreditCard className={`w-6 h-6 mr-3 flex-shrink-0 ${selectedMethodId === method.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium text-sm text-card-foreground truncate" id={`method-details-${method.id}`}>
                    {method.brand ? method.brand.toUpperCase() : 'Card'} •••• {method.last4}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('payments:expiresLabel', 'Expires:')} {method.expMonth.toString().padStart(2, '0')}/{method.expYear.toString().slice(-2)}
                  </span>
                </div>
              </div>

              {mode === 'manage' ? (
                !disabled && (
                  <div className="pl-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={(event) => handleDelete(event, method.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      aria-label={t('payments:deleteMethod')}
                      title={t('payments:deleteMethod')}
                      disabled={disabled}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex items-center pl-2" aria-hidden="true">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150
                      ${selectedMethodId === method.id
                        ? 'border-primary bg-card'
                        : 'border-muted-foreground/30 dark:border-muted-foreground/50'
                      }
                      ${disabled ? 'opacity-50' : 'group-hover:border-primary/70'}`
                    }
                  >
                    <AnimatePresence>
                      {selectedMethodId === method.id && (
                        <motion.div
                          className="w-2.5 h-2.5 bg-primary rounded-full"
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
        <div className="mt-4">
          <Button variant="outline" onClick={() => setIsAddModalOpen(true)}>
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