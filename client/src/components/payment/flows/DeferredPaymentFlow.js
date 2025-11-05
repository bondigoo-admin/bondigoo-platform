// src/components/payment/flows/DeferredPaymentFlow.js
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import moment from 'moment';
import { Calendar, Clock, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card.tsx';
import { logger } from '../../../utils/logger';

const DeferredPaymentFlow = ({
  bookingId,
  sessionStartTime,
  amount,
  currency,
  onSchedule,
  onCancel
}) => {
  const { t } = useTranslation(['payments']);
  const [selectedTime, setSelectedTime] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const paymentDeadline = React.useMemo(() => {
    return moment(sessionStartTime).subtract(24, 'hours');
  }, [sessionStartTime]);

  useEffect(() => {
    logger.info('[DeferredPaymentFlow] Component mounted:', {
      bookingId,
      sessionStartTime: moment(sessionStartTime).format(),
      paymentDeadline: moment(paymentDeadline).format(),
      amount,
      currency,
      timestamp: new Date().toISOString()
    });

    return () => {
      logger.debug('[DeferredPaymentFlow] Component cleanup:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
    };
  }, []);

  const validateScheduledTime = useCallback((time) => {
    logger.debug('[DeferredPaymentFlow] Validating scheduled time:', {
      bookingId,
      scheduledTime: moment(time).format(),
      paymentDeadline: moment(paymentDeadline).format()
    });

    if (moment(time).isAfter(paymentDeadline)) {
      setValidationError(t('payments:scheduledTimeTooLate'));
      return false;
    }

    if (moment(time).isBefore(moment().add(1, 'hour'))) {
      setValidationError(t('payments:scheduledTimeTooSoon'));
      return false;
    }

    setValidationError(null);
    return true;
  }, [paymentDeadline, t]);

  const handleSchedule = useCallback(() => {
    if (!selectedTime) {
      logger.warn('[DeferredPaymentFlow] Attempted to schedule without selected time:', {
        bookingId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!validateScheduledTime(selectedTime)) {
      logger.error('[DeferredPaymentFlow] Invalid scheduled time:', {
        bookingId,
        selectedTime: moment(selectedTime).format(),
        error: validationError
      });
      return;
    }

    logger.info('[DeferredPaymentFlow] Scheduling deferred payment:', {
      bookingId,
      scheduledTime: moment(selectedTime).format(),
      amount,
      currency,
      timestamp: new Date().toISOString()
    });

    onSchedule({
      scheduledTime: selectedTime,
      deadline: paymentDeadline,
      amount,
      currency
    });
  }, [selectedTime, validateScheduledTime, bookingId, amount, currency, onSchedule]);

  const suggestedTimes = React.useMemo(() => {
    const times = [];
    let currentTime = moment().add(2, 'hours').startOf('hour');
    
    while (currentTime.isBefore(paymentDeadline)) {
      times.push(currentTime.toDate());
      currentTime.add(12, 'hours');
    }

    logger.debug('[DeferredPaymentFlow] Generated suggested times:', {
      bookingId,
      count: times.length,
      times: times.map(t => moment(t).format())
    });

    return times;
  }, [paymentDeadline]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('payments:schedulePayment')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-md">
          <Info className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-700">
            {t('payments:deferredPaymentInfo', {
              deadline: moment(paymentDeadline).format('LLL')
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestedTimes.map((time) => (
            <button
              key={time.toISOString()}
              onClick={() => setSelectedTime(time)}
              className={`p-3 rounded-lg border transition-all
                ${selectedTime?.toISOString() === time.toISOString()
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'}`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="font-medium">
                  {moment(time).format('LLL')}
                </span>
              </div>
            </button>
          ))}
        </div>

        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-red-600"
          >
            <AlertTriangle className="h-4 w-4" />
            {validationError}
          </motion.div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md"
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={handleSchedule}
            disabled={!selectedTime || validationError}
            className="px-4 py-2 text-sm font-medium bg-primary text-white 
                     rounded-md hover:bg-primary/90 disabled:opacity-50 
                     disabled:cursor-not-allowed transition-colors"
          >
            {t('payments:schedulePayment')}
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DeferredPaymentFlow;