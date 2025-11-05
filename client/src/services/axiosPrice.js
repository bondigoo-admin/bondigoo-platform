// src/services/axiosPrice.js
import axios from 'axios';
import { logger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';

const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const pricingAxios = axios.create({
  baseURL: baseURL + '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});


// Response interceptor
pricingAxios.interceptors.response.use(
  (response) => {
    logger.debug('[axiosPrice] Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    logger.error('[axiosPrice] Response error:', {
      message: error.message,
      status: error.response?.status,
      url: originalRequest.url,
      attempt: originalRequest._retry ? 'retry' : 'initial'
    });

    // Handle token expiration
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Implement token refresh logic here if needed
        return pricingAxios(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    // Handle CORS preflight errors
    if (error.message === 'Network Error' && !originalRequest._retry) {
      originalRequest._retry = true;
      await new Promise(resolve => setTimeout(resolve, 1000));
      return pricingAxios(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default pricingAxios;