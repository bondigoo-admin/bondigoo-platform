
import React, { useEffect, useState } from 'react';
import { CardElement as StripeCardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { motion, AnimatePresence } from 'framer-motion';
import { LockClosedIcon, CreditCard } from 'lucide-react';
import { logger } from '../../../utils/logger';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';

const CardElement = ({ 
  onChange,
  onReady,
  className = '',
  showIcon = true,
  showSecurityNote = true
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!stripe || !elements) {
      logger.debug('[CardElement] Stripe or Elements not yet initialized');
      return;
    }

    logger.debug('[CardElement] Stripe and Elements initialized');
  }, [stripe, elements]);

  const handleChange = async (event) => {
    logger.debug('[CardElement] Card input changed:', {
      empty: event.empty,
      complete: event.complete,
      error: event.error?.message,
      timestamp: new Date().toISOString()
    });

    setError(event.error?.message || null);
    setIsComplete(event.complete);

    if (onChange) {
      onChange(event);
    }
  };

  return (
    <Card className={`w-full shadow-sm ${className}`}>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        {showIcon && <CreditCard className="h-5 w-5 text-muted-foreground" />}
        <CardTitle className="text-base">
          Card Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <StripeCardElement
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
                  color: '#e53e3e',
                },
              },
              hidePostalCode: true,
            }}
            onChange={handleChange}
            onReady={onReady}
            className="w-full"
          />
          
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-red-500 mt-2"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {showSecurityNote && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <LockClosedIcon className="h-4 w-4" />
              <span>Your payment information is secured with SSL encryption</span>
            </div>
          )}

          {isComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-2 top-2 text-green-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CardElement;