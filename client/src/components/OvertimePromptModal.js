import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Draggable from 'react-draggable';
import { AlertCircle, Loader2, Clock, Info, X as CloseIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { logger } from '../utils/logger';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import debounce from 'lodash/debounce';

const calculateOvertimePriceFromTotal = (totalPriceInfo, originalDurationMinutes, customDurationMinutes) => {
  const logContext = { totalPriceInfo, originalDurationMinutes, customDurationMinutes };
  logger.debug('[calculateOvertimePriceFromTotal] Starting calculation', logContext);

  if (!totalPriceInfo || typeof totalPriceInfo.final?.amount?.amount !== 'number' || typeof originalDurationMinutes !== 'number' || typeof customDurationMinutes !== 'number') {
    logger.error('[calculateOvertimePriceFromTotal] Invalid input data', logContext);
    throw new Error('Invalid input for price calculation.');
  }
  if (originalDurationMinutes <= 0) {
    logger.error('[calculateOvertimePriceFromTotal] Original duration cannot be zero or less.', logContext);
    throw new Error('Invalid original session duration.');
  }
   if (customDurationMinutes <= 0) {
    logger.error('[calculateOvertimePriceFromTotal] Custom duration must be positive.', logContext);
    throw new Error('Invalid custom duration.');
  }

  const totalAmount = totalPriceInfo.final.amount.amount;
  const currency = totalPriceInfo.currency || 'CHF';
  const pricePerMinute = totalAmount / originalDurationMinutes;
  const estimatedCost = pricePerMinute * customDurationMinutes;

  const result = {
      amount: parseFloat(estimatedCost.toFixed(2)),
      currency: currency
  };
  logger.debug('[calculateOvertimePriceFromTotal] Calculation successful', { ...logContext, result });
  return result;
};

const OvertimePromptModal = ({
  data,
  onClose,
  onAction,
  sessionId,
  bookingId,
  isCoach,
  bookingPriceInfo,
  bookingDurationMinutes,
  bookingOvertimeSettings,
  isLoadingBookingData,
  bookingDataError,
  isConfirmingOvertimePayment,
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [activeOption, setActiveOption] = useState(null);
  const nodeRef = useRef(null);

  const [customDuration, setCustomDuration] = useState('');
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [calculatedCustomPrice, setCalculatedCustomPrice] = useState(null);
  const [calculationError, setCalculationError] = useState(null);
  const [isCustomDurationValid, setIsCustomDurationValid] = useState(false);

  const arePropsReady = useMemo(() => {
     const ready = !isLoadingBookingData && !bookingDataError && !!bookingPriceInfo && !!bookingDurationMinutes;
     logger.debug(`[OvertimePromptModal] Props readiness check: ${ready}`, { isLoadingBookingData, bookingDataError: !!bookingDataError, hasBookingPrice: !!bookingPriceInfo, hasBookingDuration: !!bookingDurationMinutes});
     return ready;
  }, [isLoadingBookingData, bookingDataError, bookingPriceInfo, bookingDurationMinutes]);

  const debouncedCalculate = useMemo(() =>
    debounce(async (durationValue) => {
      if (!bookingPriceInfo || !bookingDurationMinutes) {
        logger.warn('[OvertimePromptModal] Debounced Calc: Skipping, required props missing.', { durationValue });
        setCalculatedCustomPrice(null);
        setCalculationError(t('session.missingBookingDataError', { defaultValue: 'Missing booking data for calculation.'}));
        setIsCalculatingPrice(false);
        return;
      }

      setIsCalculatingPrice(true);
      setCalculationError(null);
      try {
        const price = calculateOvertimePriceFromTotal(
          bookingPriceInfo,
          bookingDurationMinutes,
          durationValue
        );
        setCalculatedCustomPrice(price);
        logger.debug('[OvertimePromptModal] Custom price calculated', { durationValue, price });
      } catch (err) {
        logger.error('[OvertimePromptModal] Error calculating custom price', { error: err.message, stack: err.stack });
        setCalculationError(t('session.priceCalculationError', { message: err.message, defaultValue: 'Could not calculate price.'}));
        setCalculatedCustomPrice(null);
      } finally {
        setIsCalculatingPrice(false);
      }
    }, 500),
  [bookingPriceInfo, bookingDurationMinutes, t]
);

  useEffect(() => {
    if (!isCoach) return;

    const durationValue = parseInt(customDuration, 10);
    const isValidFormat = !isNaN(durationValue) && durationValue > 0 && durationValue <= 120;
    setIsCustomDurationValid(isValidFormat);

    if (isValidFormat) {
      setCalculationError(prev => prev === t('session.invalidCustomDurationRange') ? null : prev);

      if (arePropsReady) {
         setCalculationError(null);
        debouncedCalculate(durationValue);
      } else if (!isLoadingBookingData && bookingDataError) {
        setCalculationError(bookingDataError);
        setCalculatedCustomPrice(null);
        debouncedCalculate.cancel();
      } else {
        setCalculationError(t('session.waitingForBookingData', { defaultValue: 'Waiting for booking data...' }));
        setCalculatedCustomPrice(null);
        debouncedCalculate.cancel();
      }
    } else {
      debouncedCalculate.cancel();
      setCalculatedCustomPrice(null);
      setCalculationError(customDuration === '' ? null : t('session.invalidCustomDurationRange', { defaultValue: 'Duration must be between 1 and 120 minutes.' }));
      setIsCalculatingPrice(false);
    }

    return () => debouncedCalculate.cancel();
  }, [customDuration, isCoach, arePropsReady, isLoadingBookingData, bookingDataError, debouncedCalculate, t]);

   useEffect(() => {
    if (data) {
      setModalError(null);
      setIsSubmitting(false);
      setActiveOption(null);
      setCustomDuration('');
      setCalculatedCustomPrice(null);
      setCalculationError(null);
      setIsCalculatingPrice(false);
      setIsCustomDurationValid(false);
      logger.debug('[OvertimePromptModal] State reset due to new data prop', { data });
    }
  }, [data]);

  useEffect(() => {
    if (!data || !data.metadata || !data.metadata.overtimeOptions) {
      setModalError(t('session.invalidPromptData', { defaultValue: 'Invalid session data received.' }));
      logger.error('[OvertimePromptModal] Invalid initial data prop', { data });
    } else {
       setModalError(null);
    }
  }, [data, t]);

  const handleOptionClick = useCallback(async (option, isCustomRequest = false) => {
    if (isSubmitting || isConfirmingOvertimePayment) return;
    setIsSubmitting(true);
    setActiveOption(isCustomRequest ? 'custom' : option.type);
    setModalError(null);
    let actionType = option.type;

    try {
      let durationToSend = null;
      let priceToSend = null;

      if (isCoach) {
        if (actionType === 'paid') {
          actionType = 'request_paid';
          if (isCustomRequest) {
            const customDurationValue = parseInt(customDuration, 10);
            if (!arePropsReady) throw new Error(t('session.missingBookingDataError', { defaultValue: 'Missing booking data for calculation.'}));
            if (!isCustomDurationValid) throw new Error(t('session.invalidCustomDuration', { defaultValue: 'Invalid custom duration.' }));
            if (isCalculatingPrice) throw new Error(t('session.calculatingPrice', { defaultValue: 'Calculating price...' }));
            if (calculationError) throw new Error(calculationError);
            if (!calculatedCustomPrice) throw new Error(t('session.priceNotReady', { defaultValue: 'Price not calculated yet.' }));

            durationToSend = customDurationValue;
            priceToSend = calculatedCustomPrice;
          } else {
            durationToSend = option.duration;
            if (typeof durationToSend !== 'number' || durationToSend <= 0) throw new Error(t('session.internalError', { defaultValue: 'Internal error: Invalid option data.'}));
            if (!arePropsReady) throw new Error(t('session.missingBookingDataError', { defaultValue: 'Missing booking data for calculation.'}));
            try {
                priceToSend = calculateOvertimePriceFromTotal(bookingPriceInfo, bookingDurationMinutes, durationToSend);
                logger.debug('[OvertimePromptModal] Calculated standard price before request', { durationToSend, priceToSend });
            } catch (calcErr) {
                 logger.error('[OvertimePromptModal] Error calculating standard price', { error: calcErr.message });
                 throw new Error(t('session.priceCalculationError', { message: calcErr.message, defaultValue: 'Could not calculate price.'}));
            }
          }
        } else {
           durationToSend = option.duration;
        }
      } else {
        if (actionType === 'authorize') {
            actionType = 'prepare_authorize';
            durationToSend = data?.metadata?.requestedDuration;
            priceToSend = data?.metadata?.calculatedMaxPrice;
            if (!durationToSend || durationToSend <= 0 || !priceToSend || priceToSend.amount < 0) throw new Error(t('session.internalError', { defaultValue: 'Internal error: Missing data for authorization.'}));
        }
      }

      logger.debug('[OvertimePromptModal] Calling onAction', { actionType, durationToSend, priceToSend });
      await onAction(actionType, durationToSend, priceToSend);

    } catch (err) {
      logger.error('[OvertimePromptModal] Failed to submit overtime action', { sessionId, error: err.message || err, actionType, isCustomRequest });
      const errorMessage = err.response?.data?.message || err.message || t('session.submitError', { defaultValue: 'Failed to process request.' });
      setModalError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
      setActiveOption(null);
    }
  }, [
      onAction, sessionId, isCoach, t, customDuration, data,
      isCustomDurationValid, calculatedCustomPrice, calculationError, isCalculatingPrice,
      arePropsReady, isConfirmingOvertimePayment, bookingPriceInfo, bookingDurationMinutes
  ]);

  const displayOptions = useMemo(() => {
     if (!data?.metadata?.overtimeOptions) return [];
     if (isCoach) {
         return data.metadata.overtimeOptions.filter(opt => ['end', 'free'].includes(opt.type));
     } else {
         return data.metadata.overtimeOptions.filter(opt => ['authorize', 'decline'].includes(opt.type));
     }
  }, [data, isCoach]);

  const standardPaidOptionDetails = useMemo(() => {
    if (!isCoach || !data?.metadata?.overtimeOptions) return null;
    return data.metadata.overtimeOptions.find(opt => opt.type === 'paid');
  }, [data, isCoach]);

  const isRequestButtonDisabled = useMemo(() => (
    !isCustomDurationValid ||
    isSubmitting ||
    isCalculatingPrice ||
    !arePropsReady ||
    calculationError !== null
  ), [isCustomDurationValid, isSubmitting, isCalculatingPrice, arePropsReady, calculationError]);

  if (isLoadingBookingData) {
      return (
          <div className="bg-card text-card-foreground rounded-lg shadow-xl border border-border w-full max-w-sm p-6 flex flex-col items-center justify-center gap-4">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-muted-foreground">{t('loadingBookingData', { defaultValue: "Loading booking data..."})}</p>
          </div>
      );
  }
  if (bookingDataError && isCoach) {
     return (
         <div className="bg-card text-card-foreground rounded-lg shadow-xl border border-border w-full max-w-sm p-6 flex flex-col items-center text-center gap-2">
            <AlertCircle size={32} className="text-destructive" />
            <p className="text-destructive font-medium">{t('errorLoadingBookingData', { message: bookingDataError, defaultValue: `Error loading booking data: ${bookingDataError}`})}</p>
            <Button onClick={onClose} variant="secondary" size="sm" className="mt-4">
              {t('close', { defaultValue: 'Close' })}
            </Button>
         </div>
     );
  }

  return (
    <Draggable handle=".drag-handle" nodeRef={nodeRef} bounds="parent">
      <motion.div
          ref={nodeRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-card text-card-foreground rounded-lg shadow-xl border w-full max-w-sm md:max-w-md flex flex-col"
          onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border cursor-move drag-handle">
            <h3 className="flex items-center font-semibold text-lg">
                <Clock size={20} className="mr-2" />
                {t('session.overtimePromptTitle', { defaultValue: 'Overtime Options' })}
            </h3>
            <button onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })} className="p-1 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <CloseIcon size={20} />
            </button>
        </div>

        <div className="p-4">
          {modalError && (
             <div className="flex items-start text-sm text-destructive bg-destructive/10 p-3 rounded-md mb-4">
                <AlertCircle size={18} className="mr-2 mt-0.5 flex-shrink-0" /> <span className="break-words">{modalError}</span>
             </div>
          )}

          <div className="flex flex-col gap-4">
            {isCoach && (
                <>
                 {displayOptions.map((option) => (
                    <div key={option.type}>
                      <Button
                         onClick={() => handleOptionClick(option)}
                         disabled={isSubmitting}
                         variant={option.type === 'end' ? 'destructive' : 'secondary'}
                         className="w-full"
                         aria-label={option.type === 'end' ? t('session.overtimeEndSession') : t('session.overtimeFree', { duration: option.duration })}
                       >
                         {isSubmitting && activeOption === option.type ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                         <span>
                            {option.type === 'end' ? t('session.overtimeEndSession', { defaultValue: 'End Session Now' }) :
                             t('session.overtimeFree', { duration: option.duration, defaultValue: `Extend (${option.duration} min Free)` })}
                         </span>
                       </Button>
                    </div>
                 ))}

                  {standardPaidOptionDetails && (
                     <div className="p-3 border border-border rounded-md bg-muted/50 dark:bg-muted/20 space-y-3">
                         <Button
                            onClick={() => handleOptionClick(standardPaidOptionDetails, false)}
                            disabled={isSubmitting}
                            variant="secondary"
                            className="w-full"
                            aria-label={t('session.overtimePaidRequestLabel', { duration: standardPaidOptionDetails.duration })}
                          >
                           {isSubmitting && activeOption === 'paid' ? <Loader2 size={18} className="animate-spin mr-2" /> : null }
                           <span>
                             {t('session.overtimePaidRequestLabel', { duration: standardPaidOptionDetails.duration, defaultValue: `Request Paid (${standardPaidOptionDetails.duration} min)` })}
                           </span>
                        </Button>

                        <div className="space-y-2">
                           <label htmlFor="customDuration" className="text-sm font-medium text-muted-foreground">
                              {t('session.customDurationLabel', { defaultValue: 'Or request specific duration (1-120 min):' })}
                           </label>
                           <div className="flex items-center gap-2">
                               <Input
                                 id="customDuration"
                                 type="number"
                                 min="1"
                                 max="120"
                                 step="1"
                                 value={customDuration}
                                 onChange={(e) => setCustomDuration(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                                 placeholder={t('session.customDurationPlaceholderMinutes', { defaultValue: `Minutes` })}
                                 className={`flex-grow ${!isCustomDurationValid && customDuration !== '' ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                 disabled={isSubmitting}
                                 aria-invalid={!isCustomDurationValid && customDuration !== ''}
                                 aria-describedby="custom-duration-feedback"
                               />
                               <Button
                                    onClick={() => handleOptionClick({ type: 'paid' }, true)}
                                    disabled={isRequestButtonDisabled}
                                    aria-label={t('session.requestCustomDuration', { defaultValue: 'Request Custom Time' })}
                                    size="sm"
                                >
                                    {isSubmitting && activeOption === 'custom' ? <Loader2 size={16} className="animate-spin" /> : t('session.requestBtn', { defaultValue: 'Request' }) }
                                </Button>
                           </div>
                           <div id="custom-duration-feedback" className="h-5 text-xs text-muted-foreground" aria-live="polite">
                               {isCalculatingPrice && isCustomDurationValid && (
                                   <span className="flex items-center">
                                     <Loader2 size={12} className="animate-spin mr-1" />
                                     {t('session.calculatingPrice', { defaultValue: 'Calculating...' })}
                                   </span>
                               )}
                               {!isCalculatingPrice && calculatedCustomPrice && !calculationError && isCustomDurationValid && (
                                 <span className="flex items-center font-medium text-green-600 dark:text-green-500">
                                   {t('session.estimatedMaxCost', { amount: calculatedCustomPrice.amount.toFixed(2), currency: calculatedCustomPrice.currency, defaultValue: `Est. Max Cost: ${calculatedCustomPrice.currency} ${calculatedCustomPrice.amount.toFixed(2)}` })}
                                 </span>
                               )}
                               {!isCalculatingPrice && calculationError && isCustomDurationValid && (
                                 <span className="flex items-center text-destructive">
                                    <AlertCircle size={12} className="mr-1" /> {calculationError}
                                  </span>
                               )}
                               {!isCustomDurationValid && customDuration !== '' && (
                                 <span className="flex items-center text-destructive">
                                    <AlertCircle size={12} className="mr-1" /> {t('session.invalidCustomDurationRange', { defaultValue: 'Enter 1-120 min.' })}
                                 </span>
                               )}
                           </div>
                        </div>
                     </div>
                  )}
                  {!standardPaidOptionDetails && arePropsReady && (
                     <div className="flex items-start p-3 text-sm rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300">
                         <Info size={16} className="mr-2 mt-0.5 flex-shrink-0"/>
                         <p>{t('session.noPaidOvertimeConfigured', {defaultValue: "Paid overtime is not configured for this booking."})}</p>
                     </div>
                  )}
                </>
            )}

            {!isCoach && (
                 <div className="flex flex-col gap-3">
                     {data?.metadata?.calculationError && (
                          <div className="flex items-start text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                              <AlertCircle size={18} className="mr-2 mt-0.5 flex-shrink-0" />
                              <span className="break-words">{data.metadata.calculationError}</span>
                          </div>
                     )}
                     {!data?.metadata?.calculationError && (
                         <p className="text-center text-sm text-muted-foreground">
                            {t('session.userOvertimePromptMessage', {
                                duration: data?.metadata?.requestedDuration || '?',
                                amount: data?.metadata?.calculatedMaxPrice?.amount?.toFixed(2) || '?',
                                currency: data?.metadata?.calculatedMaxPrice?.currency || '',
                                defaultValue: `Coach requested ${data?.metadata?.requestedDuration || '?'} min overtime. Authorize payment up to ${data?.metadata?.calculatedMaxPrice?.currency || ''} ${data?.metadata?.calculatedMaxPrice?.amount?.toFixed(2) || '?'}?`
                            })}
                         </p>
                     )}
                     {displayOptions.map((option) => {
                          const isProcessing = isSubmitting || isConfirmingOvertimePayment;
                          const isAuthorize = option.type === 'authorize';
                          const isDisabled = isProcessing || (isAuthorize && !!data?.metadata?.calculationError);

                          return (
                              <Button
                                  key={option.type}
                                  onClick={() => handleOptionClick(option)}
                                  disabled={isDisabled}
                                  variant={isAuthorize ? 'default' : 'destructive'}
                                  className="w-full"
                                  aria-label={isAuthorize ? t('session.authorizeOvertimeTitle') : t('session.declineOvertimeTitle')}
                              >
                                  {(isSubmitting || (isAuthorize && isConfirmingOvertimePayment)) && activeOption === option.type ? <Loader2 size={20} className="animate-spin mr-2" /> : null }
                                  <span>
                                      {isAuthorize ? t('session.authorize', { defaultValue: 'Authorize Payment' }) : t('session.decline', { defaultValue: 'Decline' })}
                                  </span>
                              </Button>
                          );
                     })}
                 </div>
             )}
          </div>
        </div>
      </motion.div>
    </Draggable>
  );
};

export default OvertimePromptModal;