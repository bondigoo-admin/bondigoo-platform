import api from './api';
import * as tus from 'tus-js-client';
import axios from 'axios';
import { logger } from '../utils/logger';
import { reportUser as reportUserProfile } from './userAPI';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const CLOUDINARY_CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.REACT_APP_CLOUDINARY_API_KEY;

export const getCoachProfile = async (userId) => {
  try {
    logger.info('[coachAPI.getCoachProfile] Fetching coach profile', { userId });
    if (!userId) {
      logger.warn('[coachAPI.getCoachProfile] User ID is required but not provided');
      throw new Error('User ID is required');
    }
    const response = await api.get(`/api/coaches/profile/${userId}`);
     logger.info('[coachAPI.getCoachProfile] Raw response data:', response.data);
    logger.info('[coachAPI.getCoachProfile] Coach profile fetched successfully', {
      userId,
      reviewCount: response.data.reviews?.length || 0,
      averageRating: response.data.rating?.toFixed(1) || 'N/A',
    });
    return response.data;
  } catch (error) {
    logger.error('[coachAPI.getCoachProfile] Error fetching coach profile', {
      error: error.message,
      response: error.response?.data,
      userId,
    });
    throw error;
  }
};

export const updateCoachProfile = async (userId, profileData) => {
  try {
    logger.info('Updating coach profile for User ID:', userId);
    const response = await api.put(`/api/coaches/profile/${userId}`, profileData);
    logger.info('Update coach profile response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error updating coach profile:', error.response?.data || error.message);
    console.error('Full error object:', error);
    throw error;
  }
};

export const updateLiveStatus = async (userId, status) => {
  try {
    const response = await api.put(`/api/coaches/${userId}/live-status`, { status });
    return response.data;
  } catch (error) {
    console.error('Error updating live status:', error.response?.data || error.message);
    throw error;
  }
};

export const uploadProfilePicture = async (userId, file) => {
  try {
    logger.info('[coachAPI] Starting profile picture upload for User ID:', userId);
    const { data: signatureData } = await api.get(`/api/coaches/${userId}/get-profile-picture-signature`);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('signature', signatureData.signature);
    formData.append('timestamp', signatureData.timestamp);
    formData.append('api_key', signatureData.apiKey);
    formData.append('upload_preset', 'coach_profile_pictures');
    formData.append('folder', signatureData.folder);

    const cloudinaryResponse = await axios.post(
      `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
      formData
    );
    
    const response = await api.post(`/api/coaches/${userId}/upload-profile-picture`, {
      publicId: cloudinaryResponse.data.public_id,
      url: cloudinaryResponse.data.secure_url
    });

    logger.info('[DEBUG-FRONTEND] 1. DATA RECEIVED FROM SERVER after upload:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[coachAPI] Error uploading profile picture:', error.response?.data || error.message);
    throw error;
  }
};

export const removeProfilePicture = async (userId) => {
  try {
    const response = await api.delete(`/api/coaches/${userId}/remove-profile-picture`);
    logger.info('[DEBUG-FRONTEND] 1. DATA RECEIVED FROM SERVER after remove:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error removing profile picture:', error);
    throw error;
  }
};

export const getProfilePictureSignature = async (userId) => {
  try {
    const response = await api.get(`/api/coaches/${userId}/get-profile-picture-signature`);
    return response.data;
  } catch (error) {
    console.error('Error getting profile picture signature:', error);
    throw error;
  }
};

export const getCoachSessions = async (userId) => {
  try {
    logger.info(`[coachAPI/getCoachSessions] Starting fetch for User ID: ${userId}`);
    const response = await api.get(`/api/coaches/${userId}/bookings`);
    logger.info('[coachAPI/getCoachSessions] Raw API response:', JSON.stringify(response.data, null, 2));
    
    const formattedResponse = {
      availability: Array.isArray(response.data.availability) ? response.data.availability : [],
      regularBookings: Array.isArray(response.data.regularBookings) ? response.data.regularBookings : [],
      sessionTypes: Array.isArray(response.data.sessionTypes) ? response.data.sessionTypes : [],
      settings: response.data.settings || {}
    };

    logger.info('[coachAPI/getCoachSessions] Formatted response:', JSON.stringify(formattedResponse, null, 2));
    logger.info('[coachAPI/getCoachSessions] Settings from sessions:', JSON.stringify(formattedResponse.settings, null, 2));
    
    return formattedResponse;
  } catch (error) {
    console.error('[coachAPI/getCoachSessions] Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    return { availability: [], regularBookings: [], sessionTypes: [], settings: {} };
  }
};



export const uploadVideoIntroduction = async (videoData) => {
  try {
    logger.info('Attempting to upload video introduction for current user');
    const response = await api.post(`/api/coaches/upload-video-introduction`, videoData);
    
    logger.info('[coachAPI] Raw response from /upload-video-introduction:', response);
    
    logger.info('Video upload response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading video introduction:', error.response?.data || error.message);
    console.error('Full error object:', error);
    throw error;
  }
};

export const searchSpecialties = async (searchTerm) => {
  try {
    const response = await api.get(`/api/coaches/specialties/search?term=${encodeURIComponent(searchTerm)}`);
    return response.data;
  } catch (error) {
    console.error('Error searching specialties:', error.response?.data || error.message);
    throw error;
  }
};

export const deleteVideoIntroduction = async () => {
  try {
    logger.info('Attempting to delete video introduction for current user.');
    const response = await api.delete('/api/coaches/me/video-introduction');
    logger.info('Delete video response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error deleting video introduction:', error.response?.data || error.message);
    throw error;
  }
};

export const updateVideoTrimPoints = async (userId, videoId, trimOptions) => {
  try {
    const response = await api.put(`/api/coaches/${userId}/video-introduction/${videoId}/trim`, trimOptions);
    return response.data;
  } catch (error) {
    console.error('Error updating video trim points:', error.response?.data || error.message);
    throw error;
  }
};

export const getCoachAvailability = async (userId, date, excludeBookingId, targetDurationMinutes) => {
  try {
    logger.info('[coachAPI] Fetching coach availability for userId:', { userId, date, excludeBookingId, targetDurationMinutes });
    const params = {};
    if (date) {
      params.forDate = new Date(date).toISOString();
    }
    if (excludeBookingId) {
      params.excludeBookingId = excludeBookingId;
    }
    if (targetDurationMinutes) {
      params.targetDurationMinutes = targetDurationMinutes;
    }
    const response = await api.get(`/api/coaches/${userId}/availability`, { params });
    logger.info('[coachAPI] Coach availability fetched successfully:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[coachAPI] Error fetching coach availability:', error);
    throw error;
  }
};

export const updateCoachAvailability = async (userId, availability) => {
  try {
    const response = await api.put(`/api/coaches/${userId}/availability`, { availability });
    return response.data;
  } catch (error) {
    console.error('Error updating coach availability:', error);
    throw error;
  }
};

export const getSessionTypes = async () => {
  try {
    const response = await api.get('/api/coaches/session-types');
    logger.info('Raw session types data:', response.data);
    return response.data.map(type => ({
      id: type._id, // Change _id to id
      name: type.name,
      duration: type.duration || 0,
      price: type.price || 0
    }));
  } catch (error) {
    console.error('Error fetching session types:', error);
    throw error;
  }
};

export const updateSessionType = async (userId, typeId, sessionTypeData) => {
  try {
    logger.info('[updateSessionType] Updating session type for User ID:', userId);
    const response = await api.put(`/api/coaches/${userId}/session-types/${typeId}`, sessionTypeData);
    logger.info('[updateSessionType] Update successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[updateSessionType] Error updating session type:', error);
    throw error;
  }
};

export const updateAllSessionTypes = async (userId, sessionTypes) => {
  try {
    logger.info('[updateAllSessionTypes] Updating all session types for User ID:', userId);
    const response = await api.put(`/api/coaches/${userId}/session-types`, { sessionTypes });
    logger.info('[updateAllSessionTypes] Update successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[updateAllSessionTypes] Error updating all session types:', error);
    throw error;
  }
};

export const getCoachPackages = async (userId) => {
  try {
    const response = await api.get(`/api/coaches/${userId}/packages`);
    return response.data;
  } catch (error) {
    console.error('Error fetching coach packages:', error.response?.data || error.message);
    throw error;
  }
};

export const updateCoachPackages = async (userId, packagesData) => {
  try {
    const response = await api.put(`/api/coaches/${userId}/packages`, packagesData);
    return response.data;
  } catch (error) {
    console.error('Error updating coach packages:', error.response?.data || error.message);
    throw error;
  }
};

export const getCoachReviews = async (userId) => {
  try {
    logger.info('[coachAPI.getCoachReviews] Fetching coach reviews', { userId });
    const response = await api.get(`/api/coaches/${userId}/reviews`);
    logger.info('[coachAPI.getCoachReviews] Raw response data:', response.data);
    logger.info('[coachAPI.getCoachReviews] Reviews fetched successfully', {
      userId,
      reviewCount: response.data.reviews?.length || 0,
      averageRating: response.data.averageRating?.toFixed(1) || 'N/A',
    });
    return response.data;
  } catch (error) {
    logger.error('[coachAPI.getCoachReviews] Error fetching coach reviews', {
      error: error.message,
      response: error.response?.data,
      userId,
    });
    throw error;
  }
};

export const getCoachSettings = async (userId) => {
  try {
    logger.info('[coachAPI] Fetching settings for userId:', { userId });
    const response = await api.get(`/api/coaches/settings/${userId}`);
    logger.info('[coachAPI] Settings fetched successfully:', { userId });
    return response.data;
  } catch (error) {
    logger.error('[coachAPI] Error fetching coach settings:', { error: error.message, userId });
    throw error;
  }
};

export const updateCoachSettings = async (userId, settings) => {
  try {
    logger.info('[coachAPI] Updating settings for userId:', { userId });
    logger.debug('[coachAPI] Settings to update:', { settings });
    const response = await api.put(`/api/coaches/settings/${userId}`, { settings });
    logger.info('[coachAPI] Settings updated successfully:', { userId });
    return response.data;
  } catch (error) {
    logger.error('[coachAPI] Error updating coach settings:', { error: error.message, response: error.response?.data, userId });
    throw error;
  }
};

export const getUploadSignature = async (userId) => {
  try {
    const response = await api.get(`/api/coaches/${userId}/get-signature`);
    return response.data;
  } catch (error) {
    console.error('Error getting upload signature:', error.response?.data || error.message);
    throw error;
  }
};

export const searchListItems = async (listType, query, language) => {
  try {
    const cacheBuster = `_=${Date.now()}`;
    const response = await api.get(`/api/coaches/search-list-items?type=${listType}&query=${encodeURIComponent(query)}&language=${language}&${cacheBuster}`);
    return response.data;
  } catch (error) {
    console.error('Error searching list items:', error);
    if (error.response && error.response.status === 403) {
      throw new Error('Access denied. Please check your authentication.');
    }
    throw error;
  }
};

export const updateCoachProfileItems = async (listType, items) => {
  try {
    logger.info(`coachAPI: Updating ${listType}`);
    const response = await api.put(`/api/coaches/update-profile-items`, { type: listType, items });
    logger.info(`coachAPI: ${listType} update response:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`coachAPI: Error updating coach profile items (${listType}):`, error);
    throw error;
  }
};

export const getSignature = async (userId) => {
  try {
    const response = await axios.get(`${API_URL}/api/coaches/${userId}/get-signature`, { withCredentials: true });
    logger.info('Signature response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error getting upload signature:', error.response?.data || error.message);
    throw error;
  }
};

export const createBooking = async (userId, bookingDetails) => {
  try {
    const response = await api.post(`/api/coaches/${userId}/bookings`, bookingDetails);
    return response.data;
  } catch (error) {
    console.error('Error creating booking:', error);
    throw error;
  }
};

export const getUpcomingBookings = async (userId) => {
  try {
    logger.info('[coachAPI] Fetching upcoming bookings for userId:', userId);
    const response = await api.get(`/api/bookings/upcoming/${userId}`);
    logger.info('[coachAPI] Upcoming bookings response:', response.data);
    return response.data;
  } catch (error)
  {
    console.error('[coachAPI] Error fetching upcoming bookings:', error);
    throw error;
  }
};

export const updateBookingStatus = async (userId, bookingId, status) => {
  try {
    const response = await api.put(`/api/coaches/${userId}/bookings/${bookingId}/status`, { status });
    return response.data;
  } catch (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

export const getCoachBookings = async (userId) => {
  try {
    const response = await api.get(`/api/coaches/${userId}/bookings`);
    return response.data;
  } catch (error) {
    console.error('Error fetching coach bookings:', error);
    throw error;
  }
};

export const submitReview = async (userId, sessionId, rating, comment) => {
  try {
    const response = await api.post(`/api/coaches/${userId}/review`, { sessionId, rating, comment });
    return response.data;
  } catch (error) {
    console.error('Error submitting review:', error);
    throw error;
  }
};

export const getCoaches = async (queryString) => {
  try {
    logger.info('[coachAPI] Fetching coaches with query:', queryString);
    const response = await api.get(`/api/coaches?${queryString}`);
    logger.info('[coachAPI] Received response:', response.data);
    return response.data;
  } catch (error) {
    console.error('[coachAPI] Error in getCoaches:', error);
    throw error;
  }
};

export const getDashboardStats = async () => {
  const response = await api.get('/api/coaches/dashboard-stats');
  return response.data;
};

export const getProgramAnalytics = async (filters) => {
  const params = {};
  if (filters.programIds?.length > 0) {
    params.programIds = filters.programIds.join(',');
  }
  if (filters.period) {
    params.period = filters.period;
  }
  const response = await api.get('/api/coaches/program-analytics', { params });
  return response.data;
};


export const getDashboardOverview = async (filters) => {
  try {
     logger.info('[coachAPI] Fetching dashboard overview data with filters:', filters);
    const params = {};

    if (filters.dateRange?.from && filters.dateRange?.to) {
        params.period = 'custom';
        params.startDate = filters.dateRange.from.toISOString();
        params.endDate = filters.dateRange.to.toISOString();
    } else if (filters.dateRange?.period) {
        params.period = filters.dateRange.period;
    }

    if (filters.programIds?.length) {
        params.programIds = filters.programIds.join(',');
    }
    if (filters.clientIds?.length) {
        params.clientIds = filters.clientIds.join(',');
    }
    if (filters.sessionTypeIds?.length) {
        params.sessionTypeIds = filters.sessionTypeIds.join(',');
    }
    
    const response = await api.get('/api/coaches/dashboard/overview', { params });
     logger.info('[coachAPI] Received dashboard overview response from server:', { data: response.data });
    return response.data;
  } catch (error) {
    logger.error('[coachAPI] Error fetching dashboard overview data:', {
      error: error.message,
      response: error.response?.data,
    });
    throw error;
  }
};

export const getCoachClientDetails = async (clientId) => {
  try {
    const response = await api.get(`/api/coaches/clients/${clientId}`);
    return response.data;
  } catch (error) {
    logger.error('[coachAPI] Error fetching client details:', {
      error: error.message,
      response: error.response?.data,
      clientId,
    });
    throw error;
  }
};

export const getProgramsForCoach = async (coachId) => {
  const response = await api.get(`/api/programs/coach/${coachId}`);
  return response.data;
};

export const getCoachClientsList = async () => {
  const response = await api.get('/api/coaches/clients-list');
  return response.data;
};

export const updateDashboardPreferences = async (preferences) => {
  try {
    logger.info('[coachAPI] Updating dashboard preferences.');
    const { data } = await api.patch('/api/coaches/dashboard-preferences', { preferences });
    logger.info('[coachAPI] Dashboard preferences updated successfully.', { serverResponse: data });
    return data;
  } catch (error) {
    logger.error('[coachAPI] Error updating dashboard preferences:', { error: error.message, response: error.response?.data });
    throw error;
  }
};

export const getMyTaxInfo = async () => {
  try {
    const response = await api.get('/api/coaches/me/tax-info');
    return response.data;
  } catch (error) {
    console.error("Error fetching coach's tax info:", error.response?.data || error.message);
    throw error;
  }
};

export const updateMyTaxInfo = async (taxData) => {
  try {
    const response = await api.put('/api/coaches/me/tax-info', taxData);
    return response.data;
  } catch (error) {
    console.error("Error updating coach's tax info:", error.response?.data || error.message);
    throw error;
  }
};

export const reportCoachProfile = async (userId, reportData) => {
  return await reportUserProfile(userId, reportData);
};

export const getVerificationUploadSignature = async () => {
  try {
    const { data } = await api.get('/api/coaches/me/insurance-recognition/signature');
    return data;
  } catch (error) {
    logger.error('Error getting verification upload signature:', error.response?.data || error.message);
    throw error;
  }
};

export const submitVerificationDocument = async (payload) => {
  try {
    const { data } = await api.post('/api/coaches/me/insurance-recognition/submit', payload);
    return data;
  } catch (error) {
    logger.error('Error submitting verification document:', error.response?.data || error.message);
    throw error;
  }
};

export const getVideoIntroductionSignature = async () => {
  try {
    const { data } = await api.post('/api/coaches/me/video-introduction/signature');
    return data;
  } catch (error) {
    logger.error('Error getting video introduction signature:', error.response?.data || error.message);
    throw error;
  }
};

export const getAllSubmissions = async () => {
  const { data } = await api.get('/api/coaches/all-submissions');
  return data;
};

export const getAllQA = async () => {
  const { data } = await api.get('/api/coaches/all-qa');
  return data;
};

export const getAllParticipants = async () => {
  const { data } = await api.get('/api/coaches/all-participants');
  return data;
};

export default {
  getCoachProfile,
  updateCoachProfile,
  updateLiveStatus,
  uploadProfilePicture,
  removeProfilePicture,
  uploadVideoIntroduction,
  getCoachAvailability,
  updateVideoTrimPoints,
  deleteVideoIntroduction,
  updateCoachAvailability,
  getCoachPackages,
  searchSpecialties,
  updateCoachPackages,
  getCoachReviews,
  updateCoachSettings,
  getCoachSettings,
  getUploadSignature,
  searchListItems,
  updateCoachProfileItems,
  getSignature,
  getSessionTypes,
  updateAllSessionTypes,
  updateSessionType,
  getProfilePictureSignature,
  createBooking,
  getUpcomingBookings,
  updateBookingStatus,
  getCoachBookings,
  submitReview,
  getCoaches,
  getCoachSessions,
  getProgramAnalytics,
  getDashboardOverview,
  getCoachClientDetails,
  getProgramsForCoach,
  getCoachClientsList,
  updateDashboardPreferences,
  updateMyTaxInfo,
  updateDashboardPreferences,
  reportCoachProfile,
  getVerificationUploadSignature,
  submitVerificationDocument,
  getVideoIntroductionSignature,
  getAllSubmissions,
  getAllQA,
  getAllParticipants,
};