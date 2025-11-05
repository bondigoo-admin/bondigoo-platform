import { logger } from './logger';

export const transformPriceData = (data) => {
  logger.debug('[priceDataTransformer] Starting transformation with data:', {
    inputKeys: Object.keys(data),
    hasSessionTypeRates: !!data.sessionTypeRates?.length,
    hasTimeBasedRates: !!data.timeBasedRates?.length,
    hasSpecialPeriods: !!data.specialPeriods?.length
  });

  try {
    const transformed = {
      baseRate: {
        amount: parseFloat(data.baseRate?.amount) || 0,
        currency: data.baseRate?.currency || 'CHF'
      },
      sessionTypeRates: (data.sessionTypeRates || []).map(rate => {
        logger.debug('[priceDataTransformer] Transforming session type rate:', {
          original: rate,
          hasRateObject: !!rate.rate,
          rateType: typeof rate.rate
        });

        return {
          sessionType: rate.sessionType,
          rate: {
            amount: rate.rate?.amount || 
                   (typeof rate.rate === 'number' ? rate.rate : 0),
            currency: rate.rate?.currency || rate.currency || 'CHF'
          }
        };
      }),
      timeBasedRates: (data.timeBasedRates || []).map(rate => {
        logger.debug('[priceDataTransformer] Transforming time-based rate:', {
          original: rate,
          hasSessionTypes: !!rate.sessionTypes?.length,
          hasDayOfWeek: !!rate.dayOfWeek?.length
        });

        return {
          sessionTypes: rate.sessionTypes || [],
          dayOfWeek: rate.dayOfWeek || [],
          timeRange: {
            start: rate.timeRange?.start || '00:00',
            end: rate.timeRange?.end || '23:59'
          },
          rate: {
            amount: typeof rate.rate?.amount === 'number' ? 
                   rate.rate.amount : 
                   parseFloat(rate.rate?.amount || '0'),
            type: 'percentage'
          },
          timezone: rate.timezone || 'Europe/Zurich',
          priority: rate.priority || 0,
          active: rate.active !== false
        };
      }),
      specialPeriods: (data.specialPeriods || []).map(period => {
        logger.debug('[priceDataTransformer] Transforming special period:', {
          original: period,
          hasSessionTypes: !!period.sessionTypes?.length
        });

        return {
          name: period.name || '',
          description: period.description || '',
          sessionTypes: period.sessionTypes || [],
          rate: {
            amount: typeof period.rate?.amount === 'number' ? 
                   period.rate.amount : 
                   parseFloat(period.rate?.amount || '0'),
            type: 'percentage'
          },
          startDate: period.startDate || new Date(),
          endDate: period.endDate || new Date(),
          priority: period.priority || 0,
          active: period.active !== false
        };
      })
    };

    logger.debug('[priceDataTransformer] Transformation result:', {
      outputKeys: Object.keys(transformed),
      sessionTypeRatesCount: transformed.sessionTypeRates.length,
      timeBasedRatesCount: transformed.timeBasedRates.length,
      specialPeriodsCount: transformed.specialPeriods.length
    });

    return transformed;
  } catch (error) {
    logger.error('[priceDataTransformer] Error transforming data:', {
      error: error.message,
      stack: error.stack,
      originalData: data
    });
    throw error;
  }
};

export const validatePriceData = (data) => {
  const errors = [];

  if (!data) {
    errors.push('No price data provided');
    return errors;
  }

  // Validate base rate
  if (!data.baseRate?.amount && data.baseRate?.amount !== 0) {
    errors.push('Base rate amount is required');
  }

  // Validate session type rates
  if (data.sessionTypeRates) {
    data.sessionTypeRates.forEach((rate, index) => {
      if (!rate.sessionType) {
        errors.push(`Session type is required at index ${index}`);
      }
      if (!rate.rate?.amount && rate.rate?.amount !== 0) {
        errors.push(`Rate amount is required for session type at index ${index}`);
      }
    });
  }

  // Validate time based rates
  if (data.timeBasedRates) {
    data.timeBasedRates.forEach((rate, index) => {
      // Add more flexible validation
      if (!rate.sessionTypes || rate.sessionTypes.length === 0) {
        errors.push(`At least one session type is required for time-based rate at index ${index}`);
      }
      if (!rate.dayOfWeek || rate.dayOfWeek.length === 0) {
        errors.push(`At least one day of week is required for time-based rate at index ${index}`);
      }
      if (!rate.timeRange?.start || !rate.timeRange?.end) {
        errors.push(`Time range is required for time-based rate at index ${index}`);
      }
      if (!rate.rate?.amount && rate.rate?.amount !== 0) {
        errors.push(`Rate amount is required for time-based rate at index ${index}`);
      }
    });
  }

  // Validate special periods
  if (data.specialPeriods) {
    data.specialPeriods.forEach((period, index) => {
      if (!period.name?.trim()) {
        errors.push(`Name is required for special period at index ${index}`);
      }
      if (!period.sessionTypes || period.sessionTypes.length === 0) {
        errors.push(`Session types are required for special period at index ${index}`);
      }
      if (!period.rate?.amount && period.rate?.amount !== 0) {
        errors.push(`Rate amount is required for special period at index ${index}`);
      }
      if (!period.startDate || !period.endDate) {
        errors.push(`Date range is required for special period at index ${index}`);
      }
    });
  }

  return errors;
};