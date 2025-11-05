import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import priceAPI from '../services/priceAPI';
import { logger } from '../utils/logger';
import { toast } from 'react-hot-toast';

class PriceCalculationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PriceCalculationError';
    this.code = code;
    this.details = details;
  }
}

export const usePriceCalculation = (userId) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const queryClient = useQueryClient();

  const { data: priceConfig, isLoading: isLoadingConfig } = useQuery(
    ['priceConfig', userId],
    () => priceAPI.getPriceConfiguration(userId),
    {
      enabled: !!userId,
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        // Don't retry 403s
        if (error?.response?.status === 403) {
          logger.warn('[usePriceCalculation] Authorization error, not retrying:', {
            userId,
            attempt: failureCount
          });
          return false;
        }
        return failureCount < 2;
      },
      onError: (error) => {
        logger.error('[usePriceCalculation] Error fetching price config:', {
          userId,
          status: error.response?.status,
          message: error.response?.data?.message
        });
        // Don't throw error for 403s, just return null config
        if (error.response?.status === 403) {
          return null;
        }
        throw error;
      }
    }
  );

  const calculatePrice = useCallback(async ({
    sessionTypeId,
    start,
    end,
    timezone,
    participantCount
  }) => {
    setIsCalculating(true);
    try {
      logger.info('[usePriceCalculation] Calculating price:', {
        userId,
        sessionTypeId,
        start,
        end
      });
  
      // Validate inputs before API call
      if (!userId || !sessionTypeId || !start || !end) {
        throw new PriceCalculationError(
          'Missing required price calculation parameters',
          'INVALID_PARAMS',
          { userId, sessionTypeId, start, end }
        );
      }
  
      const result = await priceAPI.calculateSessionPrice({
        userId,
        sessionTypeId,
        start,
        end,
        timezone,
        participantCount
      });
  
      logger.debug('[usePriceCalculation] Price calculated:', {
        basePrice: result.base,
        finalPrice: result.final
      });
  
      return result;
    }  catch (error) {
      logger.error('[usePriceCalculation] Error calculating price:', {
        error: error.message,
        code: error.response?.status,
        details: error.response?.data,
        stack: error.stack
      });
  
      if (error.response?.status === 404) {
        throw new PriceCalculationError(
          'Price configuration not found',
          'CONFIG_NOT_FOUND'
        );
      } else if (error.response?.status === 400) {
        throw new PriceCalculationError(
          'Invalid price calculation parameters',
          'VALIDATION_ERROR',
          error.response.data.errors
        );
      } else if (error.response?.status === 409) {
        throw new PriceCalculationError(
          'Time slot no longer available',
          'SLOT_UNAVAILABLE'
        );
      } else if (error.response?.status === 500) {
        throw new PriceCalculationError(
          'Server error occurred while calculating price',
          'SERVER_ERROR',
          { originalError: error.message }
        );
      } else {
        throw new PriceCalculationError(
          'Unable to calculate price at this time',
          'CALCULATION_FAILED',
          { originalError: error.message }
        );
      }
    } finally {
      setIsCalculating(false);
    }
  }, [userId]);

  const updateConfigMutation = useMutation(
    (configData) => priceAPI.updatePriceConfiguration(userId, configData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['priceConfig', userId]);
      },
      onError: (error) => {
        logger.error('[usePriceCalculation] Error updating price config:', error);
      }
    }
  );

  return {
    priceConfig,
    isLoadingConfig,
    isCalculating,
    calculatePrice,
    updatePriceConfiguration: updateConfigMutation.mutate,
    isUpdating: updateConfigMutation.isLoading
  };
};

/**
 * Calculates the estimated maximum cost for paid overtime based on the booking's base price, duration,
 * and applying proportional VAT and Platform Fees if defined in the booking's price structure.
 * Overtime rate is treated as a surplus percentage on the base rate.
 *
 * @param {object} bookingPriceInfo - The price structure from the specific Booking model.
 *                                   Expected: { base: { amount: { amount: number, currency: string } }, currency: string,
 *                                               vat?: { rate?: number, included?: boolean, amount?: number },
 *                                               platformFee?: { percentage?: number, amount?: number } }
 * @param {number} bookingDurationMinutes - The original scheduled duration of the booking in minutes.
 * @param {number} overtimeRatePercent - The overtime rate percentage surplus from booking settings (e.g., 0 for base rate, 20 for base rate + 20%).
 * @param {number} durationMinutes - The duration of paid overtime requested (standard or custom) in minutes.
 * @returns {{amount: number, currency: string}} The calculated maximum overtime cost (including estimated fees/VAT).
 * @throws {PriceCalculationError} If required input data is missing or invalid.
 */
export const calculateOvertimePrice = (
  bookingPriceInfo,
  bookingDurationMinutes,
  overtimeRatePercent,
  durationMinutes
) => {
  const logContext = { bookingDurationMinutes, overtimeRatePercent, durationMinutes };
  logger.debug('[calculateOvertimePrice V4] Calculating overtime price (Rate as Surplus)', {
      ...logContext,
      baseAmountNested: bookingPriceInfo?.base?.amount,
      currency: bookingPriceInfo?.currency,
      hasPlatformFee: !!bookingPriceInfo?.platformFee,
      hasVAT: !!bookingPriceInfo?.vat
  });

  // --- Input Validation ---
  const baseBookingAmount = bookingPriceInfo?.base?.amount?.amount;
  if (baseBookingAmount === undefined || typeof baseBookingAmount !== 'number' || baseBookingAmount <= 0) {
      logger.error('[calculateOvertimePrice V4] Invalid or missing bookingPriceInfo.base.amount.amount', { bookingPriceInfoBase: bookingPriceInfo?.base });
      throw new PriceCalculationError('Invalid booking base price information.', 'INVALID_BOOKING_PRICE', { base: bookingPriceInfo?.base });
  }
   if (!bookingPriceInfo?.currency || typeof bookingPriceInfo.currency !== 'string') {
      logger.error('[calculateOvertimePrice V4] Invalid or missing bookingPriceInfo.currency', { bookingPriceInfo });
      throw new PriceCalculationError('Invalid booking currency information.', 'INVALID_BOOKING_PRICE', { currency: bookingPriceInfo?.currency });
   }
  if (typeof bookingDurationMinutes !== 'number' || bookingDurationMinutes <= 0) {
      logger.error('[calculateOvertimePrice V4] Invalid bookingDurationMinutes', { bookingDurationMinutes });
      throw new PriceCalculationError('Invalid original booking duration.', 'INVALID_BOOKING_DURATION', { bookingDurationMinutes });
  }
  // Ensure overtimeRatePercent is a valid number, default to 0 if missing/invalid for surplus calculation
  if (overtimeRatePercent === undefined || overtimeRatePercent === null || typeof overtimeRatePercent !== 'number' || overtimeRatePercent < 0) {
      logger.warn('[calculateOvertimePrice V4] Invalid or missing overtimeRatePercent, defaulting to 0 (base rate).', { providedRate: overtimeRatePercent });
      overtimeRatePercent = 0;
  }
  if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
      logger.error('[calculateOvertimePrice V4] Invalid overtime durationMinutes', { durationMinutes });
      throw new PriceCalculationError('Invalid overtime duration.', 'INVALID_OVERTIME_DURATION', { durationMinutes });
  }

  const currency = bookingPriceInfo.currency.toUpperCase();
  const platformFeePercent = bookingPriceInfo.platformFee?.percentage ?? 15;
  const vatRate = bookingPriceInfo.vat?.rate ?? 8.1;

  if (bookingPriceInfo.platformFee?.percentage === undefined) logger.warn('[calculateOvertimePrice V4] Platform fee percentage missing, using default.', { default: platformFeePercent });
  if (bookingPriceInfo.vat?.rate === undefined) logger.warn('[calculateOvertimePrice V4] VAT rate missing, using default.', { default: vatRate });

  try {
      // 1. Base rate per minute
      const baseRatePerMinute = baseBookingAmount / bookingDurationMinutes;
      if (!isFinite(baseRatePerMinute)) throw new Error('Could not determine base rate per minute.');
      logger.debug('[calculateOvertimePrice V4] Base rate/min', { baseRatePerMinute });

      // 2. Overtime rate per minute (applying surplus)
      // Rate = Base * (1 + SurplusPercent / 100)
      const overtimeMultiplier = 1 + (overtimeRatePercent / 100);
      const overtimeMinuteRate = baseRatePerMinute * overtimeMultiplier;
      logger.debug('[calculateOvertimePrice V4] Overtime rate/min (Surplus Applied)', { baseRatePerMinute, overtimeRatePercent, overtimeMultiplier, overtimeMinuteRate });

      // 3. Raw overtime cost
      const rawOvertimeCost = overtimeMinuteRate * durationMinutes;
      logger.debug('[calculateOvertimePrice V4] Raw cost', { rawOvertimeCost });

      // 4. Platform Fee on raw cost
      const overtimePlatformFee = rawOvertimeCost * (platformFeePercent / 100);
      logger.debug('[calculateOvertimePrice V4] Platform fee', { overtimePlatformFee });

      // 5. VAT on (Raw Cost + Platform Fee)
      const costPlusFee = rawOvertimeCost + overtimePlatformFee;
      const overtimeVatAmount = costPlusFee * (vatRate / 100);
      logger.debug('[calculateOvertimePrice V4] VAT amount (added on top)', { overtimeVatAmount });

      // 6. Final Total Cost
      let finalOvertimeCost = costPlusFee + overtimeVatAmount;
      logger.debug('[calculateOvertimePrice V4] Total cost (pre-rounding)', { finalOvertimeCost });

      // 7. Rounding and Minimum Charge
      finalOvertimeCost = Math.round(finalOvertimeCost * 100) / 100;
      const minimumCharge = 0.50;
      if (finalOvertimeCost > 0 && finalOvertimeCost < minimumCharge) {
          finalOvertimeCost = minimumCharge;
          logger.warn('[calculateOvertimePrice V4] Adjusted to minimum charge', { finalOvertimeCost });
      } else if (finalOvertimeCost < 0) {
           finalOvertimeCost = 0;
           logger.warn('[calculateOvertimePrice V4] Adjusted negative cost to 0');
      }

      // 8. Final Validation
      if (isNaN(finalOvertimeCost)) throw new Error('Calculation resulted in NaN.');

      const result = {
        amount: finalOvertimeCost,
        currency: currency,
      };

      logger.info('[calculateOvertimePrice V4] Final calculated overtime price (incl. fees/VAT)', { result });
      return result;

  } catch (error) {
      logger.error('[calculateOvertimePrice V4] Error during calculation:', { error: error.message, stack: error.stack });
      if (error instanceof PriceCalculationError) throw error;
      throw new PriceCalculationError(
          error.message || "Failed to calculate overtime price.",
          'CALCULATION_UNEXPECTED_ERROR',
          { originalError: error }
      );
  }
};

export { PriceCalculationError };