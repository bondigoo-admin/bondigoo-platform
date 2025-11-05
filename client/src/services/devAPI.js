import api from './api';
import { logger } from '../utils/logger';

export const setUserStatus = async (userId, status) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn('Attempted to call a dev API in production.');
    return;
  }
  try {
    logger.info('[devAPI] Sending request to /api/dev/set-status with payload:', { userId, status });
    const response = await api.post('/api/dev/set-status', { userId, status });
    return response.data;
  } catch (error) {
    logger.error('Error in devAPI.setUserStatus:', error.response?.data || error.message);
    throw error;
  }
};

export const simulateCoachResponse = async (sessionId, response, message) => {
  try {
    const { data } = await api.post('/api/dev/simulate-coach-response', {
      sessionId,
      response,
      message,
    });
    return data;
  } catch (error) {
    logger.error('Error simulating coach response:', error.response?.data || error.message);
    throw error;
  }
};