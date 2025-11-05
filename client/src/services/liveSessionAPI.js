import api from './api';
import { logger } from '../utils/logger';

export const requestLiveSession = async (payload) => {
  try {
    const { data } = await api.post('/api/livesessions/request', payload);
    return data;
  } catch (error) {
    logger.error('Error requesting live session:', error.response?.data || error.message);
    throw error;
  }
};

export const respondToLiveSession = async (sessionId, response, message) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/respond`, { response, message });
    return data;
  } catch (error) {
    logger.error('Error responding to live session request:', error.response?.data || error.message);
    throw error;
  }
};

export const createAuthorization = async (sessionId) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/authorize`);
    return data;
  } catch (error) {
    logger.error('Error creating live session authorization:', error.response?.data || error.message);
    throw error;
  }
};

export const validateSessionLink = async (sessionId, token) => {
  try {
    const { data } = await api.get(`/api/livesessions/validate/${sessionId}/${token}`);
    return data;
  } catch (error) {
    logger.error('Error validating session link:', error.response?.data || error.message);
    throw error;
  }
};

export const start = async (sessionId) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/start`);
    return data;
  } catch (error) {
    logger.error('Error starting live session:', error.response?.data || error.message);
    throw error;
  }
};

export const end = async (sessionId) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/end`);
    return data;
  } catch (error) {
    logger.error('Error ending live session:', error.response?.data || error.message);
    throw error;
  }
};

export const submitFeedback = async (sessionId, payload) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/feedback`, payload);
    return data;
  } catch (error) {
    logger.error('Error submitting live session feedback:', error.response?.data || error.message);
    throw error;
  }
};

export const handleAuthorizationFailure = async (sessionId, payload) => {
    try {
        const { data } = await api.post(`/api/livesessions/${sessionId}/auth-failure`, payload);
        return data;
    } catch (error) {
        logger.error('Error handling authorization failure:', error.response?.data || error.message);
        throw error;
    }
};

export const handleReauthorizationResult = async (sessionId, payload) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/reauthorize_result`, payload);
    return data;
  } catch (error) {
    logger.error('Error submitting re-authorization result:', error.response?.data || error.message);
    throw error;
  }
};

export const cancelRequest = async (sessionId) => {
  try {
    const { data } = await api.post(`/api/livesessions/${sessionId}/cancel`);
    return data;
  } catch (error) {
    logger.error('Error cancelling live session request:', error.response?.data || error.message);
    throw error;
  }
};