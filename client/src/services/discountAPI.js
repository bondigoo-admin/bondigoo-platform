import api from './api';
import { logger } from '../utils/logger';

/**
 * Fetches all discount codes for the currently logged-in coach.
 * @returns {Promise<Array>} A promise that resolves to an array of discount objects.
 */
export const getCoachDiscounts = async () => {
    try {
        logger.info('[discountAPI.getCoachDiscounts] Fetching discounts for coach.');
        const response = await api.get('/api/discounts/coach');
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.getCoachDiscounts] Error fetching discounts', { error: error.response?.data || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Creates a new discount code.
 * @param {object} discountData - The data for the new discount.
 * @returns {Promise<object>} A promise that resolves to the newly created discount object.
 */
export const createDiscount = async (discountData) => {
    try {
        logger.info('[discountAPI.createDiscount] Creating new discount', { code: discountData.code });
        const response = await api.post('/api/discounts', discountData);
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.createDiscount] Error creating discount', { error: error.response?.data || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Updates an existing discount code.
 * @param {string} discountId - The ID of the discount to update.
 * @param {object} updateData - The fields to update.
 * @returns {Promise<object>} A promise that resolves to the updated discount object.
 */
export const updateDiscount = async (discountId, updateData) => {
    try {
        logger.info('[discountAPI.updateDiscount] Updating discount', { discountId });
        const response = await api.put(`/api/discounts/${discountId}`, updateData);
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.updateDiscount] Error updating discount', { error: error.response?.data || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Deletes a discount code.
 * @param {string} discountId - The ID of the discount to delete.
 * @returns {Promise<object>} A promise that resolves to the success response.
 */
export const deleteDiscount = async (discountId) => {
    try {
        logger.info('[discountAPI.deleteDiscount] Deleting discount', { discountId });
        const response = await api.delete(`/api/discounts/${discountId}`);
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.deleteDiscount] Error deleting discount', { error: error.response?.data?.message || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Validates a discount code against a specific price.
 * @param {object} validationData - The data for validation.
 * @returns {Promise<object>} A promise that resolves to the price breakdown.
 */
export const validateDiscountForPrice = async (validationData) => {
    try {
        logger.info('[discountAPI.validateDiscountForPrice] Validating discount code', { validationData });
        const response = await api.post('/api/discounts/validate-price', validationData);
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.validateDiscountForPrice] Error validating discount code', { error: error.response?.data || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Checks for an active automatic discount for a given item.
 * @param {object} params - The query parameters for the check.
 * @param {string} params.entityType - 'program' or 'session'.
 * @param {string} params.entityId - The ID of the program or session type.
 * @param {string} params.coachId - The ID of the coach.
 * @param {number} params.currentPrice - The pre-discount price.
 * @returns {Promise<object|null>} A promise that resolves to the price breakdown object or null if no discount applies.
 */
export const getActiveAutomaticDiscount = async (params) => {
    try {
        logger.info('[discountAPI.getActiveAutomaticDiscount] Checking for automatic discount', params);
        const response = await api.get('/api/discounts/active-automatic', { params });
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.getActiveAutomaticDiscount] Error checking for automatic discount', { error: error.response?.data || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Searches for users by name to populate the eligibility selector.
 * @param {string} query - The search query (e.g., user's name).
 * @returns {Promise<Array>} A promise that resolves to an array of user objects (e.g., [{ _id, name }]).
 */
export const searchUsers = async (query) => {
    if (!query || query.trim().length < 2) {
        return Promise.resolve([]);
    }
    try {
        logger.info('[discountAPI.searchUsers] Searching for users', { query });
        const response = await api.get('/api/users/search', { params: { q: query } });
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.searchUsers] Error searching for users', { error: error.response?.data || error.message });
        throw error.response?.data || error;
    }
};

/**
 * Fetches all programs for a specific coach.
 * Intended for use in the discount creation form.
 * @param {string} coachId - The ID of the coach.
 * @returns {Promise<Array>} A promise that resolves to an array of program objects.
 */
export const getCoachProgramsForDiscounts = async (coachId) => {
    logger.info('[discountAPI.getCoachProgramsForDiscounts] Function called with coachId:', { coachId });
    if (!coachId) {
        logger.warn('[discountAPI.getCoachProgramsForDiscounts] Aborting: coachId is missing.');
        return Promise.resolve([]);
    }
    try {
        const url = `/api/programs/coach/${coachId}`;
        logger.info(`[discountAPI.getCoachProgramsForDiscounts] Attempting to fetch programs from URL: ${url}`);
        const response = await api.get(url);
        logger.info('[discountAPI.getCoachProgramsForDiscounts] API call successful. Response data:', { data: response.data });
        return response.data;
    } catch (error) {
        logger.error('[discountAPI.getCoachProgramsForDiscounts] API call FAILED.', { 
            coachId, 
            errorMessage: error.message,
            responseData: error.response?.data,
            status: error.response?.status,
            fullErrorObject: error
        });
        throw error.response?.data || error;
    }
};

export default {
    getCoachDiscounts,
    createDiscount,
    updateDiscount,
    deleteDiscount,
    getActiveAutomaticDiscount,
    searchUsers,
    getCoachProgramsForDiscounts,
    validateDiscountForPrice,
};