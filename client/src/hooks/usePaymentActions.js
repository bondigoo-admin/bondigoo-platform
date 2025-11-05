import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import paymentAPI from '../services/paymentAPI';
import { usePayment } from '../contexts/PaymentContext';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;
const PAYMENT_REQUEST_TIMEOUT = 30000; // 30 seconds

export const usePaymentActions = () => {
  const { t } = useTranslation(['common', 'payments']);
  const [isProcessing, setIsProcessing] = useState(false);
  const { updatePaymentStatus } = usePayment();
  const abortControllerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const retryWithDelay = async (fn, retryCount = 0) => {
    try {
      return await fn();
    } catch (error) {
      // Don't retry aborted requests
      if (error.name === 'AbortError') {
        logger.info('[usePaymentActions] Request aborted, skipping retry');
        throw error;
      }
      
      if (retryCount < RETRY_ATTEMPTS && error.recoverable) {
        logger.warn('[usePaymentActions] Retrying operation:', {
          attempt: retryCount + 1,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return retryWithDelay(fn, retryCount + 1);
      }
      throw error;
    }
  };

  const createPaymentIntent = useCallback(async (bookingId) => {
    if (!bookingId) {
      logger.error('[usePaymentActions] Missing bookingId for payment intent creation');
      throw new Error('Missing booking ID');
    }
  
    // Cancel any existing request
    if (abortControllerRef.current) {
      logger.info('[usePaymentActions] Canceling existing payment request:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      abortControllerRef.current.abort();
    }
  
    // Create new abort controller with timeout
    abortControllerRef.current = new AbortController();
    let timeoutId;
  
    setIsProcessing(true);
    let retryCount = 0;
    const MAX_RETRIES = 2;
  
    while (retryCount <= MAX_RETRIES) {
      try {
        timeoutId = setTimeout(() => {
          if (abortControllerRef.current) {
            logger.warn('[usePaymentActions] Payment request timeout:', {
              bookingId,
              attempt: retryCount + 1,
              duration: PAYMENT_REQUEST_TIMEOUT,
              timestamp: new Date().toISOString()
            });
            abortControllerRef.current.abort();
          }
        }, PAYMENT_REQUEST_TIMEOUT);
  
        logger.info('[usePaymentActions] Creating payment intent:', { 
          bookingId,
          attempt: retryCount + 1,
          timestamp: new Date().toISOString()
        });
  
        const response = await paymentAPI.createPaymentIntent(bookingId, {
          signal: abortControllerRef.current.signal,
          metadata: {
            requestId: `${bookingId}-${Date.now()}`,
            attempt: retryCount + 1,
            timestamp: new Date().toISOString()
          }
        });
  
        if (!response?.paymentIntent?.id || !response?.clientSecret) {
          throw new Error('Invalid payment intent response');
        }
  
        logger.info('[usePaymentActions] Payment intent created successfully:', { 
          bookingId, 
          paymentIntentId: response.paymentIntent.id,
          attempt: retryCount + 1,
          timestamp: new Date().toISOString()
        });
  
        return response;
  
      } catch (error) {
        // Handle abort specifically
        if (error.name === 'AbortError') {
          logger.info('[usePaymentActions] Payment request aborted:', {
            bookingId,
            attempt: retryCount + 1,
            wasTimeout: Date.now() - timeoutId >= PAYMENT_REQUEST_TIMEOUT,
            timestamp: new Date().toISOString()
          });
          
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            continue;
          }
          
          const enhancedError = {
            message: 'Payment request canceled after retries',
            code: 'payment_intent_creation_aborted',
            recoverable: false,
            originalError: error,
            attempts: retryCount + 1
          };
          throw enhancedError;
        }
  
        const enhancedError = {
          message: error.message,
          code: error.code || 'payment_intent_creation_failed',
          recoverable: retryCount < MAX_RETRIES && error.recoverable !== false,
          originalError: error,
          attempts: retryCount + 1
        };
  
        logger.error('[usePaymentActions] Error creating payment intent:', {
          error: enhancedError,
          bookingId,
          attempt: retryCount + 1,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
  
        if (enhancedError.recoverable) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount)));
          continue;
        }
  
        throw enhancedError;
  
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
  
    // If we get here, all retries failed
    logger.error('[usePaymentActions] All payment intent creation attempts failed:', {
      bookingId,
      attempts: retryCount + 1,
      timestamp: new Date().toISOString()
    });
  
    throw new Error('Payment intent creation failed after all retries');
  
  }, []);

  const confirmPayment = useCallback(async (paymentIntentId, paymentMethodId) => {
    if (!paymentIntentId || !paymentMethodId) {
      logger.error('[usePaymentActions] Missing required parameters for payment confirmation', {
        hasPaymentIntentId: !!paymentIntentId,
        hasPaymentMethodId: !!paymentMethodId
      });
      throw new Error('Missing required payment parameters');
    }

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    try {
      logger.info('[usePaymentActions] Confirming payment:', { 
        paymentIntentId, 
        paymentMethodId,
        timestamp: new Date().toISOString()
      });

      const response = await retryWithDelay(async () => {
        return await paymentAPI.confirmPayment(
          paymentIntentId, 
          paymentMethodId, 
          { signal: abortControllerRef.current.signal }
        );
      });

      logger.info('[usePaymentActions] Payment confirmed:', { 
        paymentIntentId, 
        status: response.status,
        timestamp: new Date().toISOString()
      });

      toast.success(t('payments:paymentConfirmed'));
      return response;

    } catch (error) {
      const enhancedError = {
        message: error.message,
        code: error.code || 'payment_confirmation_failed',
        recoverable: error.recoverable ?? true,
        originalError: error
      };

      logger.error('[usePaymentActions] Error confirming payment:', {
        error: enhancedError,
        paymentIntentId,
        stack: error.stack
      });

      toast.error(t('payments:errorConfirmingPayment'));
      throw enhancedError;

    } finally {
      setIsProcessing(false);
    }
  }, [t]);

  return {
    isProcessing,
    createPaymentIntent,
    confirmPayment
  };
};