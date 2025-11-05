import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Loader2, 
  RefreshCw,
  ArrowRight,
  CreditCard 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

const statusConfig = {
  processing: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    progress: 'indeterminate',
    showRetry: false,
    recoverable: false
  },
  succeeded: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    progress: 'complete',
    showRetry: false,
    recoverable: false
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    progress: 'error',
    showRetry: true,
    recoverable: true
  },
  requires_action: {
    icon: AlertCircle,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    progress: 'waiting',
    showRetry: true,
    recoverable: true
  },
  pending: {
    icon: Clock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    progress: 'waiting',
    showRetry: false,
    recoverable: true
  },
  timeout: {
    icon: Clock,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    progress: 'error',
    showRetry: true,
    recoverable: true
  },
  network_error: {
    icon: RefreshCw,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    progress: 'error',
    showRetry: true,
    recoverable: true
  }
};

const getErrorStatus = (error) => {
  if (error?.type === 'timeout') return 'timeout';
  if (error?.type === 'network_error') return 'network_error';
  return 'failed';
};

const getRecoveryDelay = (retryCount) => {
  // Exponential backoff with max of 8 seconds
  return Math.min(1000 * Math.pow(2, retryCount), 8000);
};

const MAX_AUTO_RETRIES = 3;

const PaymentStatus = ({
  status,
  error = null,
  amount = null,
  currency = 'CHF',
  paymentMethod = null,
  onRetry = null,
  onEdit = null,
  className = '',
  showAmount = true,
  maxRetries = MAX_AUTO_RETRIES,
  retryCount = 0,
  autoRetry = true
}) => {
  const { t } = useTranslation(['payments']);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimeoutRef = useRef(null);

  useEffect(() => {
    logger.info('[PaymentStatus] Payment status updated:', {
      status,
      hasError: !!error,
      hasPaymentMethod: !!paymentMethod,
      retryCount
    });

    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    // Handle auto-retry logic
    if (error && autoRetry && retryCount < maxRetries) {
      const currentStatus = error ? getErrorStatus(error) : status;
      const config = statusConfig[currentStatus];

      if (config.recoverable) {
        logger.info('[PaymentStatus] Scheduling auto-retry:', {
          status: currentStatus,
          retryCount,
          delay: getRecoveryDelay(retryCount)
        });

        retryTimeoutRef.current = setTimeout(() => {
          handleRetry();
        }, getRecoveryDelay(retryCount));
      }
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [status, error, retryCount, autoRetry, maxRetries]);

  const handleRetry = useCallback(async () => {
    if (isRetrying || !onRetry) return;

    try {
      setIsRetrying(true);
      logger.info('[PaymentStatus] Initiating payment retry:', {
        status,
        retryCount
      });

      await onRetry();
    } catch (retryError) {
      logger.error('[PaymentStatus] Retry failed:', {
        error: retryError.message,
        retryCount
      });
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, onRetry, status, retryCount]);

  const currentStatus = error ? getErrorStatus(error) : status;
  const config = statusConfig[currentStatus] || statusConfig.processing;
  const IconComponent = config.icon;

  const getStatusMessage = () => {
    if (error) {
      const baseMessage = error.message || t(`payments:errors.${currentStatus}`);
      const recoveryMessage = error.recoveryInstructions || 
        t(`payments:recovery.${currentStatus}`, { retryCount: maxRetries - retryCount });
      
      return {
        title: t('payments:errorTitle'),
        description: `${baseMessage}${recoveryMessage ? ` ${recoveryMessage}` : ''}`
      };
    }

    return {
      title: t(`payments:status.${currentStatus}.title`),
      description: t(`payments:status.${currentStatus}.description`)
    };
  };

  const { title, description } = getStatusMessage();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`rounded-lg border p-4 ${config.bgColor} ${config.borderColor} ${className}`}
      >
        <div className="flex items-start space-x-4">
          <div className={`mt-1 ${config.color}`}>
            <IconComponent className={`w-6 h-6 ${status === 'processing' ? 'animate-spin' : ''}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
            
            {showAmount && amount && (
              <div className="mt-2 flex items-center space-x-2">
                <span className="text-sm font-medium">
                  {t('payments:amount')}:
                </span>
                <span className="text-sm font-bold">
                  {new Intl.NumberFormat('de-CH', {
                    style: 'currency',
                    currency
                  }).format(amount)}
                </span>
              </div>
            )}
            
            {paymentMethod && (
              <div className="mt-2 flex items-center space-x-2 text-sm text-gray-600">
                <CreditCard className="w-4 h-4" />
                <span>
                  {paymentMethod.brand} •••• {paymentMethod.last4}
                </span>
                {onEdit && status !== 'processing' && (
                  <button
                    onClick={onEdit}
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center space-x-1"
                  >
                    <span>{t('payments:edit')}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {(status === 'failed' && onRetry) && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onRetry}
                className="mt-3 inline-flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t('payments:retryPayment')}</span>
              </motion.button>
            )}
          </div>

          {config.progress !== 'complete' && (
            <motion.div
              animate={config.progress === 'indeterminate' ? { rotate: 360 } : {}}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className={`w-2 h-2 rounded-full ${config.bgColor} border ${config.borderColor}`}
            />
          )}
        </div>

        {status === 'requires_action' && (
          <div className="mt-4 p-3 bg-white rounded border border-purple-200">
            <p className="text-sm text-purple-700">
              {t('payments:actionRequired')}
            </p>
            <button
              onClick={onRetry}
              className="mt-2 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              <span>{t('payments:completePayment')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentStatus;