
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Plus, Check, Loader2 } from 'lucide-react';
import { usePaymentMethodManagement } from '../../../hooks/usePaymentMethodManagement';
import { logger } from '../../../utils/logger';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card.tsx';
import CardElement from './CardElement';

const PaymentMethodSelector = ({
  onSelect,
  selectedMethodId,
  showNewCardByDefault = false,
  allowNewCard = true
}) => {
  const [showNewCard, setShowNewCard] = useState(showNewCardByDefault);
  const { 
    paymentMethods,
    isLoading,
    error,
    addPaymentMethod,
    deletePaymentMethod,
    refreshPaymentMethods
  } = usePaymentMethodManagement();

  useEffect(() => {
    logger.debug('[PaymentMethodSelector] Component mounted', {
      savedMethods: paymentMethods.length,
      showingNewCard: showNewCard,
      selectedMethodId
    });
  }, []);

  const handleMethodSelect = (methodId) => {
    logger.info('[PaymentMethodSelector] Payment method selected:', { methodId });
    setShowNewCard(false);
    onSelect(methodId);
  };

  const handleNewCardClick = () => {
    logger.info('[PaymentMethodSelector] New card form opened');
    setShowNewCard(true);
    onSelect(null);
  };

  const renderSavedMethod = (method) => {
    const isSelected = method.id === selectedMethodId;
    
    return (
      <motion.div
        key={method.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`
          relative flex items-center justify-between p-4 cursor-pointer
          border rounded-lg transition-all duration-200
          ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
        `}
        onClick={() => handleMethodSelect(method.id)}
      >
        <div className="flex items-center gap-3">
          <CreditCard className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
          <div className="flex flex-col">
            <span className="font-medium">
              {method.brand.toUpperCase()} •••• {method.last4}
            </span>
            <span className="text-sm text-muted-foreground">
              Expires {method.expMonth}/{method.expYear}
            </span>
          </div>
        </div>

        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-4 text-primary"
          >
            <Check className="h-5 w-5" />
          </motion.div>
        )}
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {paymentMethods.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {paymentMethods.map(renderSavedMethod)}
          </motion.div>
        )}

        {(allowNewCard || paymentMethods.length === 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {!showNewCard ? (
              <button
                onClick={handleNewCardClick}
                className="w-full flex items-center justify-center gap-2 p-4 border border-dashed
                         rounded-lg text-muted-foreground hover:text-primary hover:border-primary
                         transition-colors duration-200"
              >
                <Plus className="h-5 w-5" />
                <span>Add new card</span>
              </button>
            ) : (
              <CardElement
                onChange={(event) => {
                  if (event.complete) {
                    onSelect('NEW_CARD');
                  } else {
                    onSelect(null);
                  }
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentMethodSelector;