import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { usePaymentFlow } from '../../../hooks/usePaymentFlow';
import { PAYMENT_STATES } from '../../../constants/paymentConstants';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';

const RETRY_DELAY = 3000; // 3 seconds
const MAX_RETRIES = 3;

const PaymentRetryFlow = ({
  bookingId,
  error,
  paymentMethodId,
  onSuccess,
  onFinalFailure
}) => {
  const [retryCount, setRetryCount] = React.useState(0);
  const [retryTimer, setRetryTimer] = React.useState(RETRY_DELAY);
  const { startPaymentFlow, currentStatus } = usePaymentFlow(bookingId);

  React.useEffect(() => {
    if (currentStatus === PAYMENT_STATES.SUCCEEDED) {
      onSuccess?.();
    }
  }, [currentStatus, onSuccess]);

  React.useEffect(() => {
    let timer;
    if (retryTimer > 0 && retryCount < MAX_RETRIES) {
      timer = setInterval(() => {
        setRetryTimer(prev => prev - 1000);
      }, 1000);
    } else if (retryTimer <= 0) {
      handleRetry();
    }

    return () => clearInterval(timer);
  }, [retryTimer, retryCount]);

  const handleRetry = async () => {
    if (retryCount >= MAX_RETRIES) {
      onFinalFailure?.();
      return;
    }

    try {
      await startPaymentFlow(paymentMethodId);
      setRetryCount(prev => prev + 1);
      setRetryTimer(RETRY_DELAY);
    } catch (retryError) {
      console.error('Retry failed:', retryError);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle size={20} />
          {t('payments:paymentFailed')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {error?.message || t('payments:genericError')}
          </p>

          {retryCount < MAX_RETRIES ? (
            <div className="flex flex-col items-center gap-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2"
              >
                <Clock size={16} className="text-muted-foreground" />
                <span className="text-sm">
                  {t('payments:retryingIn', { 
                    seconds: Math.ceil(retryTimer / 1000) 
                  })}
                </span>
              </motion.div>
              <div className="text-xs text-muted-foreground">
                {t('payments:retriesRemaining', { 
                  count: MAX_RETRIES - retryCount 
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-red-600">
                {t('payments:maxRetriesReached')}
              </p>
              <button
                onClick={() => onFinalFailure()}
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md
                         text-sm font-medium transition-colors"
              >
                {t('payments:tryDifferentMethod')}
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setRetryTimer(0);
              handleRetry();
            }}
            className="w-full flex items-center justify-center gap-2 p-2
                     bg-primary text-primary-foreground rounded-md
                     hover:bg-primary/90 transition-colors"
          >
            <RefreshCw size={16} />
            {t('payments:retryNow')}
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentRetryFlow;