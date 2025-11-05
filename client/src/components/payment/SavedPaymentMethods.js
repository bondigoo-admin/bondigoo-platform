import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Trash2, Plus, Star, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { logger } from '../../utils/logger';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';

const SavedPaymentMethods = ({
  paymentMethods = [],
  selectedMethodId = null,
  onSelect,
  onDelete,
  onAddNew,
  onSetDefault,
  isLoading = false,
  disabled = false,
  className = ''
}) => {
  const { t } = useTranslation(['payments']);
  const [expandedMethod, setExpandedMethod] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleMethodClick = useCallback((methodId) => {
    if (disabled) return;
    
    logger.debug('[SavedPaymentMethods] Payment method selected:', { methodId });
    onSelect(methodId);
    setExpandedMethod(methodId === expandedMethod ? null : methodId);
  }, [disabled, expandedMethod, onSelect]);

  const handleDelete = async (event, methodId) => {
    event.stopPropagation();
    if (isDeleting) return;

    try {
      setIsDeleting(true);
      logger.info('[SavedPaymentMethods] Deleting payment method:', { methodId });
      
      await onDelete(methodId);
      
      toast.success(t('payments:paymentMethodDeleted'));
      setExpandedMethod(null);
    } catch (error) {
      logger.error('[SavedPaymentMethods] Error deleting payment method:', {
        methodId,
        error: error.message
      });
      toast.error(t('payments:errorDeletingPaymentMethod'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetDefault = async (event, methodId) => {
    event.stopPropagation();
    
    try {
      logger.info('[SavedPaymentMethods] Setting default payment method:', { methodId });
      await onSetDefault(methodId);
      toast.success(t('payments:defaultMethodSet'));
    } catch (error) {
      logger.error('[SavedPaymentMethods] Error setting default method:', {
        methodId,
        error: error.message
      });
      toast.error(t('payments:errorSettingDefault'));
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground">
          {t('payments:savedPaymentMethods')}
        </h3>
        <Button
          variant="link"
          size="sm"
          onClick={onAddNew}
          disabled={disabled || isLoading}
          className="text-primary"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('payments:addNewCard')}
        </Button>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {paymentMethods.map((method) => (
            <motion.div
              key={method.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`
                p-3 rounded-lg border transition-all duration-150 ease-in-out group
                ${selectedMethodId === method.id ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary' : 'border-input bg-card'}
                ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/50 dark:hover:bg-muted/20 cursor-pointer'}
              `}
              onClick={() => handleMethodClick(method.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <CreditCard className={`w-6 h-6 shrink-0 ${method.isDefault ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="overflow-hidden">
                    <p className="font-medium text-sm text-card-foreground truncate">
                      {method.brand} •••• {method.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('payments:expiresOn', {
                        date: `${String(method.expiryMonth).padStart(2, '0')}/${method.expiryYear}`
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center shrink-0 pl-2">
                  {!method.isDefault && !disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleSetDefault(e, method.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      aria-label={t('payments:setAsDefault')}
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  {method.isDefault && (
                    <div className="flex items-center justify-center h-8 w-8" aria-label={t('payments:defaultMethod')}>
                      <Star className="w-4 h-4 text-primary" fill="currentColor" />
                    </div>
                  )}
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(e, method.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={isDeleting}
                      aria-label={t('payments:deletePaymentMethod')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <AnimatePresence>
              {expandedMethod === method.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginTop: '0.75rem' }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 border-t border-border text-sm text-muted-foreground flex items-center gap-2">
                    {method.isDefault && (
                      <Badge variant="secondary">{t('payments:defaultMethod')}</Badge>
                    )}
                    <span>
                      {t('payments:lastUsed')}: {
                        method.lastUsed 
                          ? new Date(method.lastUsed).toLocaleDateString() 
                          : t('payments:never')
                      }
                    </span>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading ? (
          <div className="flex justify-center items-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : paymentMethods.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">
            {t('payments:noSavedPaymentMethods')}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default SavedPaymentMethods;