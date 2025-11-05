import axios from 'axios';
import { logger } from '../utils/logger';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const registerCoach = async (coachData) => {
  logger.info('[coachService] Attempting to register coach with data:', JSON.stringify(coachData, null, 2));
  try {
    const response = await api.post('/api/coaches/register', coachData);
    logger.info('[coachService] Coach registration successful. Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.token) {
      localStorage.setItem('token', response.data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      logger.info('[coachService] Token stored and set for future requests');
    }

    return response.data;
  } catch (error) {
    console.error('[coachService] Error in registerCoach:', error.response?.data || error.message);
    throw error;
  }
};

export const getCoachProfile = async (userId) => {
  try {
    const response = await axios.get(`${API_URL}/coaches/${userId}`, {
      withCredentials: true
    });
    return response.data;
  } catch (error) {
    throw error.response.data;
  }
};

export const updateCoachProfile = async (profileData) => {
  const response = await axios.put(`${API_URL}/coaches/profile`, profileData, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  return response.data;
};

export const getCoachAvailability = async (userId) => {
  const response = await axios.get(`${API_URL}/coaches/availability/${userId}`);
  return response.data;
};

export const updateCoachAvailability = async (availabilityData) => {
  const response = await axios.put(`${API_URL}/coaches/availability`, availabilityData, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  return response.data;
};