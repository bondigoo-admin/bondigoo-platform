import api from './api';
import { logger } from '../utils/logger';

// Base Rate Updates
export const updateBaseRate = async (userId, baseRate) => {
  try {
    logger.info('[priceAPI.updateBaseRate] Updating base rate:', {
      userId,
      baseRate
    });

    const response = await api.patch(`/api/prices/config/${userId}/base-rate`, {
      baseRate: {
        amount: Number(baseRate.amount),
        currency: baseRate.currency || 'CHF'
      }
    });

    logger.debug('[priceAPI.updateBaseRate] Update successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.updateBaseRate] Error:', {
      error: error.message,
      userId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

// Get full price configuration
export const getPriceConfiguration = async (userId) => {
  try {
    logger.info('[priceAPI.getPriceConfiguration] Fetching configuration:', { userId });

    const response = await api.get(`/api/prices/config/${userId}`);

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.getPriceConfiguration] Error:', {
      error: error.message,
      userId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

// Session Type Rate Updates
export const updateSessionTypeRate = async (userId, sessionTypeId, rate) => {
  try {
    logger.debug('[priceAPI.updateSessionTypeRate] Request details:', {
      userId,
      sessionTypeId,
      rate,
      requestBody: {
        rate: rate === null ? null : {
          amount: rate?.amount,
          currency: rate?.currency || 'CHF'
        }
      }
    });

    const response = await api.patch(`/api/prices/config/${userId}/session-type/${sessionTypeId}`, {
      rate: rate === null ? null : {
        amount: Number(rate.amount),
        currency: rate.currency || 'CHF'
      }
    });

    logger.debug('[priceAPI.updateSessionTypeRate] Update successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.updateSessionTypeRate] Error:', {
      error: error.message,
      userId,
      sessionTypeId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

// Time Based Rate Updates
export const updateTimeBasedRate = async (userId, rateId, rateData) => {
  try {
    logger.info('[priceAPI.updateTimeBasedRate] Updating time-based rate:', {
      userId,
      rateId,
      rateData
    });

    const transformedRate = {
      sessionTypes: rateData.sessionTypes,
      dayOfWeek: rateData.dayOfWeek,
      timeRange: {
        start: rateData.timeRange.start,
        end: rateData.timeRange.end
      },
      rate: {
        amount: Number(rateData.rate.amount),
        type: 'percentage'
      },
      timezone: rateData.timezone || 'Europe/Zurich'
    };

    const response = await api.patch(
      `/api/prices/config/${userId}/time-based/${rateId}`,
      transformedRate
    );

    logger.debug('[priceAPI.updateTimeBasedRate] Update successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.updateTimeBasedRate] Error:', {
      error: error.message,
      userId,
      rateId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

// Special Period Updates 
export const updateSpecialPeriod = async (userId, periodId, periodData) => {
  try {
    logger.info('[priceAPI.updateSpecialPeriod] Updating special period:', {
      userId,
      periodId,
      periodData
    });

    const transformedPeriod = {
      name: periodData.name?.trim(),
      description: periodData.description?.trim(),
      sessionTypes: periodData.sessionTypes,
      rate: {
        amount: Number(periodData.rate.amount),
        type: 'percentage'
      },
      startDate: periodData.startDate,
      endDate: periodData.endDate,
      active: periodData.active
    };

    const response = await api.patch(
      `/api/prices/config/${userId}/special-period/${periodId}`,
      transformedPeriod
    );

    logger.debug('[priceAPI.updateSpecialPeriod] Update successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.updateSpecialPeriod] Error:', {
      error: error.message,
      userId,
      periodId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

// Add and Remove functions for time-based rates and special periods
export const addTimeBasedRate = async (userId, rateData) => {
  try {
    logger.info('[priceAPI.addTimeBasedRate] Adding new time-based rate:', {
      userId,
      rateData
    });

    const response = await api.post(`/api/prices/config/${userId}/time-based`, {
      ...rateData,
      rate: {
        amount: Number(rateData.rate.amount),
        type: 'percentage'
      }
    });

    logger.debug('[priceAPI.addTimeBasedRate] Addition successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.addTimeBasedRate] Error:', {
      error: error.message,
      userId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

export const removeTimeBasedRate = async (userId, rateId) => {
  try {
    logger.info('[priceAPI.removeTimeBasedRate] Removing time-based rate:', {
      userId,
      rateId
    });

    const response = await api.delete(`/api/prices/config/${userId}/time-based/${rateId}`);

    logger.debug('[priceAPI.removeTimeBasedRate] Removal successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.removeTimeBasedRate] Error:', {
      error: error.message,
      userId,
      rateId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

export const addSpecialPeriod = async (userId, periodData) => {
  try {
    logger.info('[priceAPI.addSpecialPeriod] Adding new special period:', {
      userId,
      periodData
    });

    const response = await api.post(`/api/prices/config/${userId}/special-period`, {
      ...periodData,
      rate: {
        amount: Number(periodData.rate.amount),
        type: 'percentage'
      }
    });

    logger.debug('[priceAPI.addSpecialPeriod] Addition successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.addSpecialPeriod] Error:', {
      error: error.message,
      userId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

export const removeSpecialPeriod = async (userId, periodId) => {
  try {
    logger.info('[priceAPI.removeSpecialPeriod] Removing special period:', {
      userId,
      periodId
    });

    const response = await api.delete(`/api/prices/config/${userId}/special-period/${periodId}`);

    logger.debug('[priceAPI.removeSpecialPeriod] Removal successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.removeSpecialPeriod] Error:', {
      error: error.message,
      userId,
      periodId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

export const removeSessionTypeRate = async (userId, sessionTypeId) => {
  try {
    logger.info('[priceAPI.removeSessionTypeRate] Removing session type rate:', {
      userId,
      sessionTypeId
    });

    const response = await api.delete(`/api/prices/config/${userId}/session-type/${sessionTypeId}`);

    logger.debug('[priceAPI.removeSessionTypeRate] Removal successful:', {
      status: response.status,
      data: response.data
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.removeSessionTypeRate] Error:', {
      error: error.message,
      userId,
      sessionTypeId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

export const calculateSessionPrice = async ({
  userId, // This is the coach's ID
  sessionTypeId,
  start,
  end,
  timezone = 'Europe/Zurich',
  participantCount = 1,
  discountCode,
  customerLocation
}) => {
  try {
    const payload = {
      userId,
      start,
      end,
      timezone,
      participantCount,
      sessionTypeId,
    };
    if (discountCode) {
      payload.discountCode = discountCode;
    }
    if (customerLocation && customerLocation.country) {
      payload.customerLocation = customerLocation;
    }
    
    logger.info('[priceAPI.calculateSessionPrice] Calculating price:', payload);
    const response = await api.post('/api/prices/calculate', payload);

    logger.debug('[priceAPI.calculateSessionPrice] Calculation successful:', {
      status: response.status,
      basePrice: response.data.base,
      finalPrice: response.data.final,
      discounts: response.data.discounts?.length || 0
    });

    return response.data;
  } catch (error) {
    logger.error('[priceAPI.calculateSessionPrice] Error:', {
      error: error.message,
      userId,
      sessionTypeId,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
};

export const getPricingRates = async () => {
  try {
    logger.info('[priceAPI.getPricingRates] Fetching rates info.');
    const response = await api.get('/api/prices/config/rates');
    return response.data;
  } catch (error) {
    logger.error('[priceAPI.getPricingRates] Error:', { error: error.message });
    throw error;
  }
};

export const calculateProgramPrice = async (programId, discountCode, user) => { 
  try {
    const payload = { programId, user }; 
    if (discountCode) {
      payload.discountCode = discountCode;
    }
    logger.info('[priceAPI.calculateProgramPrice] Calculating program price:', payload);
    const response = await api.post('/api/prices/calculate-program', payload);
    return response.data;
  } catch (error) {
    logger.error('[priceAPI.calculateProgramPrice] Error:', {
      error: error.message,
      programId,
      response: error.response?.data,
    });
    throw error;
  }
};

export const updateLiveSessionRate = async (userId, rate) => {
  try {
    logger.info('[priceAPI.updateLiveSessionRate] Updating live session rate:', { userId, rate });
    const response = await api.patch(`/api/prices/config/${userId}/live-session-rate`, { rate });
    return response.data;
  } catch (error) {
    logger.error('[priceAPI.updateLiveSessionRate] Error:', {
      error: error.message,
      userId,
      response: error.response?.data
    });
    throw error;
  }
};

export const calculateForDisplay = async ({ price, earlyBirdPrice, currency, userId, sessionTypeId, start, end, timezone }) => {
  const requestPayload = { price, earlyBirdPrice, currency, userId, sessionTypeId, start, end, timezone };
  if (!requestPayload.earlyBirdPrice || requestPayload.earlyBirdPrice <= 0) {
    delete requestPayload.earlyBirdPrice;
  }
  try {
    logger.info('[priceAPI.calculateForDisplay] Calculating price for display:', requestPayload);
    const response = await api.post('/api/prices/calculate-for-display', requestPayload);
    return response.data;
  } catch (error) {
    logger.error('[priceAPI.calculateForDisplay] Error:', {
      error: error.message,
      payload: requestPayload,
      response: error.response?.data
    });
    throw error;
  }
};

export const calculateWebinarPrice = async (webinarBookingId, discountCode) => {
  try {
    logger.info('[priceAPI.calculateWebinarPrice] Calculating webinar price:', { webinarBookingId, hasDiscountCode: !!discountCode });
    const payload = { webinarBookingId };
    if (discountCode) {
      payload.discountCode = discountCode;
    }
    const response = await api.post('/api/prices/calculate-webinar', payload);
    return response.data;
  } catch (error) {
    logger.error('[priceAPI.calculateWebinarPrice] Error:', {
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
};

export const updatePriceConfiguration = async (userId, configData) => {
  try {
    logger.info('[priceAPI.updatePriceConfiguration] Updating price configuration:', { userId, configData });
    const response = await api.patch(`/api/prices/config/${userId}`, { config: configData });
    return response.data;
  } catch (error) {
    logger.error('[priceAPI.updatePriceConfiguration] Error:', {
      error: error.message,
      userId,
      response: error.response?.data
    });
    throw error;
  }
};

export default {
  getPriceConfiguration,
  updateBaseRate,
  updateSessionTypeRate,
  updateTimeBasedRate,
  updateSpecialPeriod,
  addTimeBasedRate,
  removeTimeBasedRate,
  addSpecialPeriod,
  removeSpecialPeriod,
  removeSessionTypeRate,
  calculateSessionPrice,
  calculateProgramPrice,
  getPricingRates,
  updateLiveSessionRate,
  calculateForDisplay, 
  calculateWebinarPrice,
  updatePriceConfiguration
};