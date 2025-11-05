import apiClient from './api';
import { logger } from '../utils/logger';

/**
 * Updates the status for the currently authenticated user.
 * @param {string} status - The new status ('online', 'offline', 'busy', 'on_break').
 * @returns {Promise<any>} The response from the API.
 */
export const updateUserStatus = (status) => {
  return apiClient.put(`/api/status/me`, { status });
};

/**
 * Fetches the current status for a given user.
 * @param {string} userId - The ID of the user to fetch status for.
 * @returns {Promise<string>} The user's current status.
 */
export const getUserStatus = async (userId) => {
  logger.debug(`[statusAPI] Fetching status for userId: ${userId}`);
  const response = await apiClient.get(`/api/status/${userId}`);
  return response.data.status;
};