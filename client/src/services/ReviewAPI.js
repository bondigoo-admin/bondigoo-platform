import api from './api';

export const getCoachReviews = async (coachId) => {
  try {
    ////console.log(`%c[ReviewAPI.js] CORRECT FUNCTION CALLED. Hitting route: /api/reviews/coach/${coachId}`, 'color: #00ff00; font-weight: bold;');
    const response = await api.get(`/api/reviews/coach/${coachId}`);
    //console.log(`%c[ReviewAPI.js] Response received from CORRECT route:`, 'color: #00ff00; font-weight: bold;', response.data);
    return response.data;
  } catch (error) {
    //console.error('[ReviewAPI] Error fetching coach reviews:', error.response?.data || error.message);
    throw error;
  }
};

export const submitClientReview = async (reviewData) => {
  try {
    const response = await api.post('/api/reviews/submit/client', reviewData);
    return response.data;
  } catch (error) {
    //console.error('[ReviewAPI] Error submitting client review:', error.response?.data || error.message);
    throw error;
  }
};

export const submitCoachReview = async (reviewData) => {
  try {
    const response = await api.post('/api/reviews/submit/coach', reviewData);
    return response.data;
  } catch (error) {
    //console.error('[ReviewAPI] Error submitting coach review:', error.response?.data || error.message);
    throw error;
  }
};

export const respondToReview = async (reviewId, responseData) => {
  try {
    const response = await api.post(`/api/reviews/${reviewId}/respond`, responseData);
    return response.data;
  } catch (error) {
    //console.error('[ReviewAPI] Error submitting coach response:', error.response?.data || error.message);
    throw error;
  }
};

export const getProgramReviews = async (programId) => {
    const response = await api.get(`/api/reviews/program/${programId}`);
    return response.data;
};

export const submitProgramReview = async (reviewData) => {
    const response = await api.post('/api/reviews/submit/program', reviewData);
    return response.data;
};

export const reportReview = async (reviewId, reportData) => {
  try {
    const response = await api.post(`/api/reviews/${reviewId}/report`, reportData);
    return response.data;
  } catch (error) {
    throw error;
  }
};