
import React from 'react';
import { Clock, Calendar } from 'lucide-react';
import { Card, CardContent } from '../../ui/card.tsx';
import moment from 'moment';
import { useTranslation } from 'react-i18next';

 const PaymentTimingForm = ({
  onSelect,
  selectedTiming,
  sessionStartTime,
  isConnected,
  disabled = false
}) => {
   const { t } = useTranslation(['payments']);
  const isEligibleForDeferred = React.useMemo(() => {
    const hoursUntilSession = moment(sessionStartTime).diff(moment(), 'hours');
    return hoursUntilSession >= 48 && isConnected;
  }, [sessionStartTime, isConnected]);

  return (
    <Card className="w-full">
      <CardContent className="p-4 space-y-4">
        <div className="text-sm font-medium mb-4">
          {t('payments:chooseTiming')}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => onSelect('immediate')}
            disabled={disabled}
            className={`flex flex-col p-4 rounded-lg border transition-all
              ${selectedTiming === 'immediate' 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5" />
              <span className="font-medium">{t('payments:payNow')}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('payments:payNowDescription')}
            </p>
          </button>

          <button
            onClick={() => onSelect('deferred')}
            disabled={disabled || !isEligibleForDeferred}
            className={`flex flex-col p-4 rounded-lg border transition-all
              ${selectedTiming === 'deferred' 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'}
              ${!isEligibleForDeferred ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5" />
              <span className="font-medium">{t('payments:payLater')}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('payments:payLaterDescription')}
            </p>
            {!isEligibleForDeferred && (
              <p className="text-sm text-red-500 mt-2">
                {!isConnected 
                  ? t('payments:connectRequired')
                  : t('payments:sessionTooSoon')}
              </p>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentTimingForm;