import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Tag, AlertTriangle } from 'lucide-react';
import { usePriceCalculation, PriceCalculationError } from '../hooks/usePriceCalculation';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import debounce from 'lodash/debounce';

const PriceCalculationSection = ({
  userId,
  sessionTypeId,
  startTime,
  endTime,
  isProcessing: externalProcessing,
  onPriceCalculated,
  onError,
  className = ''
}) => {
  const { t } = useTranslation(['bookings', 'common']);
  const { calculatePrice, isCalculating: isCalculatingPrice } = usePriceCalculation(userId);
  const [priceDetails, setPriceDetails] = useState(null);
  const [error, setError] = useState(null);
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  const previousCalculation = useRef(null);

  // Combined loading state
  const isCalculating = isCalculatingPrice || externalProcessing || isLocalProcessing;

  const getErrorMessage = useCallback((error) => {
    if (error instanceof PriceCalculationError) {
      switch (error.code) {
        case 'CONFIG_NOT_FOUND':
          return t('bookings:errors.priceConfigNotFound');
        case 'VALIDATION_ERROR':
          return t('bookings:errors.invalidPriceParams');
        case 'SLOT_UNAVAILABLE':
          return t('bookings:errors.slotUnavailable');
        case 'CALCULATION_FAILED':
          return t('bookings:errors.calculationFailed');
        default:
          return t('bookings:errors.unknownPriceError');
      }
    }
    return t('bookings:errors.generalPriceError');
  }, [t]);

  const calculateSessionPrice = useCallback(async (start, end) => {
    if (!start || !end || !sessionTypeId || !userId) {
      logger.debug('[PriceCalculationSection] Skipping price calculation - missing required data:', {
        hasStartTime: !!start,
        hasEndTime: !!end,
        hasSessionTypeId: !!sessionTypeId,
        hasUserId: !!userId
      });
      return;
    }

    // Generate calculation key for comparison
    const calculationKey = `${start.getTime()}-${end.getTime()}-${sessionTypeId}`;
    if (calculationKey === previousCalculation.current) {
      logger.debug('[PriceCalculationSection] Skipping duplicate calculation');
      return;
    }
    previousCalculation.current = calculationKey;

    setIsLocalProcessing(true);
    setError(null);

    try {
      logger.info('[PriceCalculationSection] Starting price calculation:', {
        sessionTypeId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        userId
      });

      const result = await calculatePrice({
        sessionTypeId,
        start,
        end,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      logger.debug('[PriceCalculationSection] Price calculation successful:', {
        basePrice: result.base,
        finalPrice: result.final,
        discounts: result.discounts?.length || 0,
        platformFee: result.platformFee?.amount,
        vat: result.vat?.amount
      });

      setPriceDetails(result);
      if (onPriceCalculated) {
        onPriceCalculated(result);
      }
    } catch (error) {
      logger.error('[PriceCalculationSection] Price calculation failed:', {
        error: error.message,
        code: error.code,
        details: error.details,
        sessionTypeId,
        startTime: start.toISOString(),
        endTime: end.toISOString()
      });

      const errorMessage = getErrorMessage(error);
      setError(errorMessage);
      toast.error(errorMessage);
      setPriceDetails(null);

      if (onError) {
        onError(error);
      }
    } finally {
      setIsLocalProcessing(false);
    }
  }, [calculatePrice, userId, sessionTypeId, onPriceCalculated, onError, getErrorMessage]);

  // Cleanup debounced function on unmount
  const debouncedCalculatePrice = useCallback(
    debounce((start, end) => calculateSessionPrice(start, end), 300),
    [calculateSessionPrice]
  );
  
  useEffect(() => {
    if (!startTime || !endTime || !sessionTypeId || !userId) {
      return;
    }
  
    logger.debug('[PriceCalculationSection] Price calculation triggered:', {
      startTime: startTime?.toISOString(),
      endTime: endTime?.toISOString(),
      sessionTypeId
    });
  
    debouncedCalculatePrice(startTime, endTime);
  
    return () => {
      debouncedCalculatePrice.cancel();
    };
  }, [startTime, endTime, sessionTypeId, userId, debouncedCalculatePrice]);

  // Main effect to trigger price calculation
  useEffect(() => {
    if (!startTime || !endTime) return;
    debouncedCalculatePrice(startTime, endTime);
  }, [startTime, endTime, debouncedCalculatePrice]);

  const calculateFinalPrice = useCallback((details) => {
    if (!details) return null;
  
    const base = details.base || 0;
    const platformFee = details.platformFee?.amount || 0;
    const vat = details.vat?.amount || 0;
    const discounts = details.discounts?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
  
    logger.debug('[PriceCalculationSection] Calculating final price:', {
      base,
      platformFee,
      vat,
      totalDiscounts: discounts
    });
  
    return {
      ...details,
      final: Math.round((base + platformFee + vat - discounts) * 100) / 100
    };
  }, []);

  const ErrorDisplay = ({ error }) => (
    <motion.div 
      className="price-error-container"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="error-content">
        <AlertTriangle className="error-icon" size={20} />
        <span className="error-text">{error}</span>
      </div>
      <button 
        className="retry-button"
        onClick={() => calculateSessionPrice(startTime, endTime)}
        disabled={isCalculating}
      >
        {t('common:retry')}
      </button>
    </motion.div>
  );

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (isCalculating) {
    return (
      <div className={`price-loading-container ${className}`}>
        <div className="loading-spinner" />
        <span>{t('bookings:calculatingPrice')}</span>
      </div>
    );
  }

  if (!priceDetails) return null;

  return (
    <motion.div 
      className={`price-calculation-container ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="price-header">
        <CreditCard size={20} />
        <h3>{t('bookings:priceBreakdown')}</h3>
      </div>
  
      {priceDetails && (
        <div className="price-details">
<div className="price-row base-price">
  <span>{t('bookings:basePrice')}</span>
  <span>
    {typeof priceDetails.base === 'object' 
      ? `${priceDetails.base.amount} ${priceDetails.base.currency}`
      : `${priceDetails.base} ${priceDetails.currency}`
    }
  </span>
</div>
  
{priceDetails.discounts?.map((discount, index) => (
  <div key={index} className="price-row discount">
    <span className="discount-label">
      <Tag size={16} />
      {discount.description}
    </span>
    <span className="discount-amount">
      -{typeof discount.amount === 'object'
        ? `${discount.amount.amount} ${discount.amount.currency}`
        : `${discount.amount} ${priceDetails.currency}`
      }
    </span>
  </div>
))}
  
  {priceDetails.platformFee?.amount > 0 && (
  <div className="price-row platform-fee">
    <span>{t('bookings:platformFee')} ({priceDetails.platformFee.percentage}%)</span>
    <span>
      {typeof priceDetails.platformFee.amount === 'object'
        ? `${priceDetails.platformFee.amount.amount} ${priceDetails.platformFee.amount.currency}`
        : `${priceDetails.platformFee.amount} ${priceDetails.currency}`
      }
    </span>
  </div>
)}

{priceDetails.vat?.amount > 0 && (
  <div className="price-row vat">
    <span>{t('bookings:vat')} ({priceDetails.vat.rate}%)</span>
    <span>
      {typeof priceDetails.vat.amount === 'object'
        ? `${priceDetails.vat.amount.amount} ${priceDetails.vat.amount.currency}`
        : `${priceDetails.vat.amount} ${priceDetails.currency}`
      }
    </span>
  </div>
)}
  
  <div className="price-row total">
  <strong>{t('bookings:total')}</strong>
  <strong>
    {typeof priceDetails.final === 'object'
      ? `${priceDetails.final.amount} ${priceDetails.final.currency}`
      : `${priceDetails.final} ${priceDetails.currency}`
    }
  </strong>
</div>
        </div>
      )}
  
      {priceDetails.vat?.included && (
        <div className="vat-notice">
          {t('bookings:vatIncluded')}
        </div>
      )}
    </motion.div>
  );  
};

export default React.memo(PriceCalculationSection);