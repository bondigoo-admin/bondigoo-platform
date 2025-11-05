import axios from 'axios';
import { transformIdToUnderscoreId } from '../utils/idTransformer';
import { logger } from '../utils/logger';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const fileApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

const getApiUrl = async () => {
  try {
    const response = await fetch('/serverInfo.json');
    const { port } = await response.json();
    return `http://localhost:${port}/api`;
  } catch (error) {
    console.error('Failed to fetch server info:', error);
    return 'http://localhost:5000/api';
  }
};

const requestInterceptor = (config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
};

const errorInterceptor = async (error) => {
  const originalRequest = error.config;
  if (error.response?.status === 401 && !originalRequest._retry) {
    if (error.response.data.error === 'jwt expired') {
      await logout();
      window.location.href = '/login';
      return Promise.reject(new Error('Session expired, please log in again'));
    }
  }
  return Promise.reject(error);
};

api.interceptors.request.use(requestInterceptor);
api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object' && response.config.responseType !== 'blob') {
      response.data = transformIdToUnderscoreId(response.data);
    }
    return response;
  },
  errorInterceptor
);

fileApi.interceptors.request.use(requestInterceptor);
fileApi.interceptors.response.use(
  (response) => response,
  errorInterceptor
);

export const login = async (email, password) => {
  try {
    const response = await api.post('/api/users/login', { email, password });
    if (response.data && response.data.token) {
      localStorage.setItem('token', response.data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
    }
    // No need to manually transform id to _id here, as it's handled by the interceptor
    return response.data;
  } catch (error) {
    console.error('[API] Login error:', error.response ? error.response.data : error);
    throw error.response ? error.response.data : error;
  }
};

export const logout = async () => {
  try {
    await api.post('/api/users/logout');
    localStorage.removeItem('token');
  } catch (error) {
    console.error('Logout error:', error);
  }
};

export const getUser = async () => {
  try {
    const response = await api.get('/api/users/me');
    return response.data;
  } catch (error) {
    throw error.response.data;
  }
};

export const register = async (userData) => {
  try {
    const response = await api.post('/api/users/register', userData);
    return response.data;
  } catch (error) {
    throw error.response.data;
  }
};

export const updateUser = async (id, userData) => {
  try {
    const response = await api.put(`/api/users/${id}`, userData);
    return response.data;
  } catch (error) {
    throw error.response.data;
  }
};

export const getAllUsers = async () => {
  try {
    const response = await api.get('/api/users');
    return response.data;
  } catch (error) {
    throw error.response.data;
  }
};

export const getUserStatus = async (email) => {
  try {
    const response = await api.get(`/api/users/status/${email}`);
    return response.data.status;
  } catch (error) {
    console.error('Failed to get user status:', error);
    throw error;
  }
};

export const updateUserStatus = async (userId, status) => {
  try {
    console.log(`[API] Updating status for user ${userId} to ${status}`);
    const response = await api.post('/api/users/update-status', { userId, status });
    console.log(`[API] Status update successful for user ${userId}`);
    return response.data.status;
  } catch (error) {
    console.error(`[API] Failed to update status for user ${userId}:`, error);
    if (error.response && error.response.status === 404) {
      console.warn(`[API] User not found for ID: ${userId}`);
    }
    throw error;
  }
};

export const uploadProfilePicture = async (file) => {
  try {
    const formData = new FormData();
    formData.append('profilePicture', file);

    const response = await api.post('/api/coaches/upload-profile-picture', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    throw error;
  }
};

export const uploadVideoIntroduction = async (file) => {
  try {
    const formData = new FormData();
    formData.append('videoIntroduction', file);

    const response = await api.post('/api/coaches/upload-video-introduction', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading video introduction:', error);
    throw error;
  }
};

export const getCoachProfile = async (coachId) => {
  try {
    const response = await api.get(`/api/coaches/profile/${coachId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching coach profile:', error);
    throw error;
  }
};

export const updateCoachProfile = async (profileData) => {
  try {
    const response = await api.put('/api/coaches/profile', profileData);
    return response.data;
  } catch (error) {
    console.error('Error updating coach profile:', error);
    throw error;
  }
};

export const submitReview = async (reviewData) => {
  try {
    const endpoint = reviewData.ratings ? '/api/reviews/submit/coach' : '/api/reviews/submit/client';
    const response = await api.post(endpoint, reviewData);
    logger.info('[API] Review submitted successfully:', {
      endpoint,
      sessionId: reviewData.sessionId,
      responseStatus: response.status
    });
    return response.data;
  } catch (error) {
    logger.error('[API] Error submitting review:', {
      endpoint: reviewData.ratings ? '/api/reviews/submit/coach' : '/api/reviews/submit/client',
      error: error.response ? error.response.data : error.message,
      stack: error.stack
    });
    throw error.response ? error.response.data : error;
  }
};

export const markNotificationAsActioned = async (notificationId) => {
  try {
    console.log('[API] Attempting to mark notification as actioned:', { notificationId });
    const response = await api.patch(`/api/notifications/${notificationId}/actioned`);
    console.log('[API] Notification marked as actioned successfully:', { 
      notificationId, 
      responseData: response.data 
    });
    return response.data;
  } catch (error) {
    console.error('Error marking notification as actioned:', { 
      notificationId, 
      error: error.response ? error.response.data : error.message 
    });
    throw error.response ? error.response.data : error;
  }
};

export default api;