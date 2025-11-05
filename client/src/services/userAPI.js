import api from './api';
import axios from 'axios';

export const registerUser = async (userData) => {
  try {
    const response = await api.post('/api/users/register', userData);
    return response.data;
  } catch (error) {
    console.error('Error registering user:', error.response?.data || error.message);
    throw error;
  }
};

export const getUserBookings = async (userId) => {
  try {
    const response = await api.get(`/api/users/${userId}/bookings`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    throw error;
  }
};

export const searchUsers = async (searchTerm) => {
  try {
    const response = await api.get(`/api/users/search?term=${encodeURIComponent(searchTerm)}`);
    return response.data;
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
};

export const getUserProfile = async (userId) => {
  try {
    const response = await api.get(`/api/users/${userId}/profile`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

export const updateUserProfile = async (userData) => {
  try {
    const response = await api.put(`/api/users/profile`, userData);
    return response.data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const updateUserProfilePicture = async (imageData) => {
  try {
    const response = await api.put('/api/users/profile-picture', imageData);
    return response.data;
  } catch (error) {
    console.error('Error updating user profile picture:', error);
    throw error;
  }
};

export const getUserSettings = async (userId) => {
  try {
    console.log('[userAPI] Fetching user settings for ID:', userId);
    const response = await api.get(`/api/users/${userId}/settings`);
    console.log('[userAPI] User settings fetched successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('[userAPI] Error fetching user settings:', error);
    throw error;
  }
};

export const updateUserSettings = async (userId, settings) => {
  try {
    console.log('[userAPI] Updating user settings for ID:', userId);
    console.log('[userAPI] New settings:', settings);
    const response = await api.put(`/api/users/${userId}/settings`, settings);
    console.log('[userAPI] User settings updated successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('[userAPI] Error updating user settings:', error);
    throw error;
  }
};

export const updateUserStatus = async (userId, status) => {
  try {
    const response = await api.post('/api/users/update-status', { status });
    return response.data;
  } catch (error) {
    console.error('Error updating user status:', error);
    throw error;
  }
};

export const logoutUser = async () => {
  try {
    const response = await api.post('/api/users/logout');
    return response.data;
  } catch (error) {
    console.error('Error logging out user:', error);
    throw error;
  }
};

export const uploadProfilePicture = async (file) => {
  try {
    const { data: signatureData } = await api.get('/api/users/get-profile-picture-signature');
    console.log('Signature data received:', signatureData);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('signature', signatureData.signature);
    formData.append('timestamp', signatureData.timestamp);
    formData.append('api_key', signatureData.apiKey);
    formData.append('upload_preset', 'user_profile_pictures');

    console.log('Uploading to Cloudinary...');
    const cloudinaryResponse = await axios.post(
      `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
      formData
    );
    console.log('Cloudinary response:', cloudinaryResponse.data);

    console.log('Sending update to server...');
    const response = await api.post('/api/users/upload-profile-picture', {
      publicId: cloudinaryResponse.data.public_id,
      url: cloudinaryResponse.data.secure_url
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    console.log('Server response:', response.data);

    return response.data;
  } catch (error) {
    console.error('Error uploading profile picture:', error.response?.data || error.message);
    throw error;
  }
};

export const removeProfilePicture = async () => {
  try {
    const response = await api.delete('/api/users/remove-profile-picture');
    return response.data;
  } catch (error) {
    console.error('Error removing profile picture:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Fetches detailed user data for the settings page.
 * The backend determines the user from the auth token.
 */
export const getUserDetails = async () => {
  try {
    const response = await api.get('/api/users/details');
    return response.data;
  } catch (error) {
    console.error('Error fetching user details:', error);
    throw error;
  }
};

/**
 * Updates user profile details from the settings page.
 * @param {object} details - The user details object to update.
 */
export const updateUserDetails = async (details) => {
  try {
    // Note: The backend will use the authenticated user's ID for security.
    const response = await api.put(`/api/users/details`, details);
    return response.data;
  } catch (error) {
    console.error('Error updating user details:', error);
    throw error;
  }
};

/**
 * Changes the user's password.
 * @param {object} passwordData - { currentPassword, newPassword }.
 */
export const changePassword = async (passwordData) => {
    try {
        const response = await api.put(`/api/users/change-password`, passwordData);
        return response.data;
    } catch (error) {
        console.error('Error changing password:', error);
        throw error;
    }
};

export const requestEmailChange = async (data) => {
    try {
        const response = await api.post('/api/users/request-email-change', data);
        return response.data;
    } catch (error) {
        console.error('Error requesting email change:', error);
        throw error;
    }
};

export const verifyEmailChange = async (token) => {
    try {
        const response = await api.post('/api/users/verify-email-change', { token });
        return response.data;
    } catch (error) {
        console.error('Error verifying email change:', error);
        throw error;
    }
};

/**
 * Fetches the user's saved payment methods.
 * @param {string} userId - The ID of the user.
 */
export const getPaymentMethods = async (userId) => {
    try {
        const response = await api.get(`/api/users/payment-methods`);
        // Mocking payment methods based on your schema since Stripe integration is not shown.
        // In a real scenario, this might come from Stripe.
        return response.data.paymentMethods; 
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        // Returning a mock array for UI development if the endpoint fails
        // In production, you'd likely just throw the error.
        if (process.env.NODE_ENV === 'development') {
            console.warn("API call failed, returning mock payment methods.");
            return [
                { id: 'pm_1', brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2025, isDefault: true },
                { id: 'pm_2', brand: 'Mastercard', last4: '1234', expMonth: 10, expYear: 2024, isDefault: false },
            ];
        }
        throw error;
    }
};

/**
 * Deletes a saved payment method.
 * @param {string} userId - The ID of the user.
 * @param {string} methodId - The ID of the payment method to delete.
 */
export const deletePaymentMethod = async (userId, methodId) => {
    try {
        const response = await api.delete(`/api/users/payment-methods/${methodId}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting payment method:', error);
        throw error;
    }
};

/**
 * Sets a payment method as the default.
 * @param {string} userId - The ID of the user.
 * @param {string} methodId - The ID of the payment method to set as default.
 */
export const setDefaultPaymentMethod = async (userId, methodId) => {
    try {
        const response = await api.post(`/api/users/payment-methods/default`, { methodId });
        return response.data;
    } catch (error) {
        console.error('Error setting default payment method:', error);
        throw error;
    }
};

export const requestPasswordReset = async (email) => {
    try {
        const response = await api.post('/api/users/request-password-reset', { email });
        return response.data;
    } catch (error) {
        console.error('Error requesting password reset:', error);
        throw error;
    }
};

export const verifyPasswordResetToken = async (token) => {
    try {
        const response = await api.get(`/api/users/verify-password-reset-token/${token}`);
        return response.data;
    } catch (error) {
        console.error('Error verifying password reset token:', error);
        throw error;
    }
};

export const resetPassword = async (data) => {
    try {
        const response = await api.post('/api/users/reset-password', data);
        return response.data;
    } catch (error) {
        console.error('Error resetting password:', error);
        throw error;
    }
};

/**
 * Fetches all necessary data for the user dashboard in a single call.
 */
export const getUserDashboardData = async () => {
  try {
    const response = await api.get('/api/users/dashboard_overview');
    return response.data.data; // Return the nested data object
  } catch (error) {
    console.error('Error fetching unified user dashboard data:', error);
    throw error;
  }
};

/**
 * Updates the billing address for the currently authenticated user.
 * @param {object} billingAddress - The billing address object.
 * @returns {Promise<object>} The updated user object from the server.
 */
export const updateUserBillingAddress = async (billingAddress) => {
    const { data } = await api.put('/api/users/me/billing-address', { billingAddress });
    return data;
};

export const blockUser = async (userId) => {
  try {
    const response = await api.post(`/api/users/${userId}/block`, {});
    return response.data;
  } catch (error) {
    console.error('Error blocking user:', error.response?.data || error.message);
    throw error;
  }
};

export const unblockUser = async (userId) => {
  try {
    const response = await api.delete(`/api/users/${userId}/block`);
    return response.data;
  } catch (error) {
    console.error('Error unblocking user:', error.response?.data || error.message);
    throw error;
  }
};

export const getBlockedUsers = async () => {
  try {
    const response = await api.get('/api/users/me/blocked');
    return response.data;
  } catch (error) {
    console.error('Error fetching blocked users:', error.response?.data || error.message);
    throw error;
  }
};

export const updateUserDashboardPreferences = async ({ userId, preferences }) => {
  try {
    const { data } = await api.patch('/api/users/dashboard-preferences', { preferences });
    return data;
  } catch (error) {
    console.error('Error updating user dashboard preferences:', error.response?.data || error.message);
    throw error;
  }
};

export const requestAccountDeletion = async () => {
    const response = await api.post('/api/users/delete-account/request');
    return response.data;
};

export const confirmAccountDeletion = async (token) => {
    const response = await api.post('/api/users/delete-account/confirm', { token });
    return response.data;
};

export const reportUser = async (userId, reportData) => {
  const response = await api.post(`/api/users/${userId}/report`, reportData);
  return response.data;
};

export const flagEntity = async ({ entityId, entityType, reason, details }) => {
    const { data } = await api.post('/api/users/flags', { entityId, entityType, reason, details });
    return data;
};

export const saveOnboardingData = async (onboardingData) => {
  const { data } = await axios.patch('/api/users/me/onboarding', onboardingData);
  return data;
};

export const updateOnboardingStep = async (stepData) => {
  try {
    const { data } = await api.patch('/api/users/me/onboarding-step', stepData);
    return data;
  } catch (error) {
    console.error('Error updating onboarding step:', error.response?.data || error.message);
    throw error;
  }
};