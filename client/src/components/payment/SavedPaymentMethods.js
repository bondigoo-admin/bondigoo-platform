import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Trash2, Plus, Star, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { logger } from '../../utils/logger';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';
import { cn } from '../../lib/utils'; // Assuming you have a cn utility for classnames

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
  const [isDeleting, setIsDeleting] = useState(null); // Track which method is being deleted

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
      setIsDeleting(methodId);
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
      setIsDeleting(null);
    }
  };

  const handleSetDefault = async (event, methodId) => {
    event.stopPropagation();
    
    try {
      logger.info('[SavedPaymentMethods] Setting default payment method:', { methodId });
      await onSetDefault(methodId);
      toast.success(t('payments:defaultMethodSet'));
    } catch (error)
      {
      logger.error('[SavedPaymentMethods] Error setting default method:', {
        methodId,
        error: error.message
      });
      toast.error(t('payments:errorSettingDefault'));
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground">
          {t('payments:savedPaymentMethods')}
        </h3>
        <Button
          variant="link"
          size="sm"
          onClick={onAddNew}
          disabled={disabled || isLoading}
          className="text-primary gap-1"
        >
          <Plus className="w-4 h-4" />
          {t('payments:addNewCard')}
        </Button>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {paymentMethods.map((method) => (
            <motion.div
              key={method.id}
              layout
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => handleMethodClick(method.id)}
              className={cn(`
                p-4 rounded-lg border-2 transition-all duration-200 ease-in-out group
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`,
                selectedMethodId === method.id 
                  ? 'border-primary bg-primary/5 dark:bg-primary/10' 
                  : 'border-input bg-transparent hover:border-primary/50 dark:hover:bg-accent/10',
                disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'
              )}
              tabIndex={disabled ? -1 : 0}
              onKeyPress={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && handleMethodClick(method.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 min-w-0">
                  <CreditCard className={cn('w-7 h-7 shrink-0', method.isDefault ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="overflow-hidden">
                    <p className="font-medium text-card-foreground truncate">
                      {method.brand} •••• {method.last4}
                    </p>
                    <p className="text-sm text-muted-foreground">
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
                      className="h-9 w-9 text-muted-foreground hover:text-primary"
                      aria-label={t('payments:setAsDefault')}
                    >
                      <Star className="w-5 h-5" />
                    </Button>
                  )}
                  {method.isDefault && (
                     <div className="flex items-center justify-center h-9 w-9" aria-label={t('payments:defaultMethod')}>
                      <Star className="w-5 h-5 text-primary" fill="currentColor" />
                    </div>
                  )}
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(e, method.id)}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={!!isDeleting}
                      aria-label={t('payments:deletePaymentMethod')}
                    >
                      {isDeleting === method.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>

              <AnimatePresence>
              {expandedMethod === method.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginTop: '1rem' }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 border-t border-border/80 text-sm text-muted-foreground flex items-center gap-4">
                    {method.isDefault && (
                      <Badge variant="secondary">{t('payments:defaultMethod')}</Badge>
                    )}
                    <span className="flex items-center gap-2">
                      {t('payments:lastUsed')}: 
                      <span className="font-medium text-foreground">{
                        method.lastUsed 
                          ? new Date(method.lastUsed).toLocaleDateString() 
                          : t('payments:never')
                      }</span>
                    </span>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex justify-center items-center p-6 space-x-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('payments:loadingMethods')}...</span>
          </div>
        )}
        
        {!isLoading && paymentMethods.length === 0 && (
          <div className="text-center text-muted-foreground py-10 px-4 border-2 border-dashed rounded-lg">
            <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/50 mb-2" />
            <h4 className="font-semibold text-foreground mb-1">{t('payments:noSavedPaymentMethods')}</h4>
            <p className="text-sm">{t('payments:noSavedMethodsMessage')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedPaymentMethods;