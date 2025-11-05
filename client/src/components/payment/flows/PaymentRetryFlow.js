
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, Clock, CreditCard, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../../utils/logger';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { PaymentMethodForm } from '../forms/PaymentMethodForm';
import { usePaymentFlow } from '../../../hooks/usePaymentFlow';
import { PAYMENT_STATES } from '../../../constants/paymentConstants';

const RETRY_INTERVALS = [1, 5, 15]; // minutes
const MAX_RETRIES = 3;
const RETRY_QUEUE = new Map(); // Track retry attempts per booking
const MAX_QUEUE_SIZE = 3;
const MIN_RETRY_INTERVAL = 2000; // 2 seconds minimum between retries

const queueRetry = (bookingId, retryFn) => {
  const existingQueue = RETRY_QUEUE.get(bookingId) || [];
  
  if (existingQueue.length >= MAX_QUEUE_SIZE) {
    logger.warn('[PaymentRetryFlow] Retry queue full:', {
      bookingId,
      queueSize: existingQueue.length,
      timestamp: new Date().toISOString()
    });
    return false;
  }

  const retryItem = {
    id: `${bookingId}-${Date.now()}`,
    fn: retryFn,
    timestamp: Date.now()
  };

  RETRY_QUEUE.set(bookingId, [...existingQueue, retryItem]);
  return true;
};

const processRetryQueue = async (bookingId) => {
  const queue = RETRY_QUEUE.get(bookingId) || [];
  if (!queue.length) return;

  const lastRetry = queue[queue.length - 1];
  const timeSinceLastRetry = Date.now() - lastRetry.timestamp;

  if (timeSinceLastRetry < MIN_RETRY_INTERVAL) {
    logger.debug('[PaymentRetryFlow] Throttling retry:', {
      bookingId,
      timeSinceLastRetry,
      minInterval: MIN_RETRY_INTERVAL
    });
    return;
  }

  const retryItem = queue.shift();
  RETRY_QUEUE.set(bookingId, queue);

  try {
    logger.info('[PaymentRetryFlow] Processing retry:', {
      bookingId,
      retryId: retryItem.id,
      queueRemaining: queue.length
    });
    
    await retryItem.fn();
  } catch (error) {
    logger.error('[PaymentRetryFlow] Retry failed:', {
      bookingId,
      retryId: retryItem.id,
      error: error.message
    });
  }
};

const PaymentRetryFlow = ({
  bookingId,
  error,
  onSuccess,
  onFinalFailure,
  allowNewCard = true,
  showSavedMethods = true
}) => {
  const { t } = useTranslation(['payments']);
  const [retryCount, setRetryCount] = useState(0);
  const [retryTimer, setRetryTimer] = useState(null);
  const [showNewCard, setShowNewCard] = useState(false);
  const { startPaymentFlow, isProcessing, currentStatus } = usePaymentFlow(bookingId);

  useEffect(() => {
    logger.info('[PaymentRetryFlow] Component mounted:', {
      bookingId,
      error: error?.message,
      retryCount,
      timestamp: new Date().toISOString()
    });

    return () => {
      logger.debug('[PaymentRetryFlow] Component cleanup:', {
        bookingId,
        retryCount
      });
    };
  }, []);

  useEffect(() => {
    if (currentStatus === PAYMENT_STATES.SUCCEEDED) {
      logger.info('[PaymentRetryFlow] Payment succeeded after retry:', {
        bookingId,
        retryCount,
        timestamp: new Date().toISOString()
      });
      onSuccess?.();
    }
  }, [currentStatus, onSuccess]);

  useEffect(() => {
    return () => {
      // Clear retry queue on unmount
      if (RETRY_QUEUE.has(bookingId)) {
        logger.info('[PaymentRetryFlow] Clearing retry queue:', {
          bookingId,
          queueSize: RETRY_QUEUE.get(bookingId)?.length || 0
        });
        RETRY_QUEUE.delete(bookingId);
      }
    };
  }, [bookingId]);

  const startRetryTimer = useCallback(() => {
    if (retryCount >= MAX_RETRIES) {
      logger.warn('[PaymentRetryFlow] Max retries reached:', {
        bookingId,
        retryCount,
        timestamp: new Date().toISOString()
      });
      return;
    }
  
    const interval = RETRY_INTERVALS[retryCount] * 60 * 1000;
    setRetryTimer(interval);
  
    logger.info('[PaymentRetryFlow] Starting retry timer:', {
      bookingId,
      retryCount,
      interval,
      queueSize: RETRY_QUEUE.get(bookingId)?.length || 0,
      timestamp: new Date().toISOString()
    });
  
    const timer = setInterval(() => {
      setRetryTimer(prev => {
        if (prev <= 1000) {
          clearInterval(timer);
          processRetryQueue(bookingId);
          return null;
        }
        return prev - 1000;
      });
    }, 1000);
  
    return () => clearInterval(timer);
  }, [retryCount, bookingId]);

  const handleRetry = async (paymentMethodId = null) => {
    if (retryCount >= MAX_RETRIES) {
      logger.error('[PaymentRetryFlow] Retry limit exceeded:', {
        bookingId,
        retryCount,
        timestamp: new Date().toISOString()
      });
      onFinalFailure?.();
      return;
    }
  
    const retryFn = async () => {
      logger.info('[PaymentRetryFlow] Attempting retry:', {
        bookingId,
        retryCount: retryCount + 1,
        hasPaymentMethod: !!paymentMethodId,
        timestamp: new Date().toISOString()
      });
  
      try {
        setRetryCount(prev => prev + 1);
        await startPaymentFlow(paymentMethodId);
      } catch (retryError) {
        logger.error('[PaymentRetryFlow] Retry failed:', {
          error: retryError.message,
          bookingId,
          retryCount,
          stack: retryError.stack
        });
  
        // Queue next retry if recoverable
        if (retryError.recoverable && retryCount < MAX_RETRIES) {
          const queued = queueRetry(bookingId, retryFn);
          if (queued) {
            startRetryTimer();
          } else {
            onFinalFailure?.();
          }
        } else {
          onFinalFailure?.();
        }
      }
    };
  
    await processRetryQueue(bookingId);
    if (RETRY_QUEUE.get(bookingId)?.length === 0) {
      await retryFn();
    } else {
      queueRetry(bookingId, retryFn);
    }
  };

  const handleNewCard = async (paymentMethod) => {
    logger.info('[PaymentRetryFlow] New card submitted:', {
      bookingId,
      paymentMethodId: paymentMethod.id,
      timestamp: new Date().toISOString()
    });
    await handleRetry(paymentMethod.id);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          {t('payments:paymentFailed')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            {error?.message || t('payments:genericError')}
          </div>
        </div>

        {retryTimer && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-2 py-4"
          >
            <Clock className="h-6 w-6 text-blue-500 animate-pulse" />
            <div className="text-sm text-center">
              {t('payments:retryingIn', {
                time: Math.ceil(retryTimer / 1000)
              })}
            </div>
            <div className="text-xs text-gray-500">
              {t('payments:retriesRemaining', {
                count: MAX_RETRIES - retryCount
              })}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {showNewCard ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <PaymentMethodForm
                onSubmit={handleNewCard}
                onCancel={() => setShowNewCard(false)}
                processingText={t('payments:retrying')}
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <button
                onClick={() => handleRetry()}
                disabled={isProcessing || retryTimer !== null}
                className="flex items-center justify-center gap-2 p-3 
                         bg-primary text-white rounded-lg w-full
                         hover:bg-primary/90 disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
                {t('payments:retryPayment')}
              </button>

              {allowNewCard && (
                <button
                  onClick={() => setShowNewCard(true)}
                  className="flex items-center justify-center gap-2 p-3
                           border border-gray-300 rounded-lg w-full
                           hover:bg-gray-50 transition-colors"
                >
                  <CreditCard className="h-5 w-5" />
                  {t('payments:useNewCard')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {retryCount >= MAX_RETRIES && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-3 pt-4"
          >
            <p className="text-sm text-red-600">
              {t('payments:maxRetriesReached')}
            </p>
            <button
              onClick={onFinalFailure}
              className="text-sm text-primary hover:underline"
            >
              {t('payments:contactSupport')}
            </button>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentRetryFlow;