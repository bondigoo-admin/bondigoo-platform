import api, { fileApi } from './api';

export const getListTypes = async () => {
  const response = await api.get('/api/admin/list-types');
  return response.data;
};

export const getListItems = async (listType, page = 1, limit = 100, searchTerm = '', sortField = 'name', sortOrder = 'asc') => {
  try {
    const response = await api.get(`/api/admin/${listType}`, {
      params: { page, limit, searchTerm, sortField, sortOrder, includeUsageStats: true }
    });
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export const addListItem = async (listType, item) => {
  console.log(`Adding item to ${listType}:`, item);
  try {
    const response = await api.post(`/api/admin/${listType}`, item);
    console.log(`Response from adding item to ${listType}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error adding item to ${listType}:`, error);
    throw error;
  }
};

export const updateListItem = async (listType, item) => {
  try {
    console.log(`Sending update request for item ${item._id} in ${listType}`);
    const response = await api.put(`/api/admin/${listType}/${item._id}`, item);
    console.log('Update response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error in updateListItem:', error);
    console.error('Error response:', error.response?.data);
    throw error;
  }
};

export const deleteListItem = async (listType, itemId) => {
  try {
    console.log(`Sending delete request for item ${itemId} in ${listType}`);
    const response = await api.delete(`/api/admin/${listType}/${itemId}`);
    console.log('Delete response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error in deleteListItem:', error);
    console.error('Error response:', error.response?.data);
    throw error;
  }
};

export const bulkDeleteListItems = async (listType, itemIds) => {
  try {
    console.log(`Sending bulk delete request for ${itemIds.length} items in ${listType}`);
    const response = await api.post(`/api/admin/${listType}/bulk-delete`, { itemIds });
    console.log('Bulk delete response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error in bulkDeleteListItems:', error);
    console.error('Error response:', error.response?.data);
    throw error;
  }
};

export const reorderListItems = async (listType, reorderData) => {
  const response = await api.put(`/api/admin/${listType}/reorder`, reorderData);
  return response.data;
};

export const importListItems = async (listType, items) => {
  const response = await api.post(`/api/admin/${listType}/import`, { items });
  return response.data;
};

export const getTranslations = async (listType, language) => {
  try {
    console.log(`Fetching translations for ${listType} in ${language}`);
    const response = await api.get(`/api/admin/translations/${listType}`, {
      params: { language }
    });
    console.log(`Received translations for ${listType} in ${language}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching translations for ${listType} in ${language}:`, error);
    console.error('Full error object:', error);
    // Return an empty object instead of throwing an error
    return { translations: {} };
  }
};

export const getTranslationOverview = async () => {
  try {
    const response = await api.get('/api/admin/translation-overview');
    return response.data;
  } catch (error) {
    console.error('Error fetching translation overview:', error);
    if (error.response && error.response.data && error.response.data.message) {
      throw new Error(error.response.data.message);
    } else {
      throw new Error('An unexpected error occurred while fetching the translation overview.');
    }
  }
};

export const addTranslation = async (key, language, translation) => {
  const response = await api.post('/api/admin/translations', { key, language, translation });
  return response.data;
};

export const updateTranslation = async (listType, key, language, translation) => {
  try {
    console.log(`Updating translation for ${listType}, key: ${key}, language: ${language}, value: ${translation}`);
    const response = await api.put(`/api/admin/translations/${listType}/${key}`, { language, translation });
    console.log('Update translation response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error updating translation:', error);
    throw error;
  }
};

export const cleanupOrphanedTranslations = async () => {
  try {
    const response = await api.post('/api/admin/cleanup-translations');
    return response.data;
  } catch (error) {
    console.error('Error cleaning up translations:', error);
    throw error;
  }
};

export const getSessionTypes = async () => {
  try {
    const response = await api.get('/api/coaches/session-types');
    console.log('Raw session types data:', response.data);
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

export const getAdminNotificationSettings = async () => {
  try {
    const response = await api.get('/api/admin/settings/notifications');
    return response.data;
  } catch (error) {
    console.error('Error fetching admin notification settings:', error);
    throw error;
  }
};

export const updateAdminNotificationSettings = async (settings) => {
  try {
    const response = await api.put('/api/admin/settings/notifications', settings);
    return response.data;
  } catch (error) {
    console.error('Error updating admin notification settings:', error);
    throw error;
  }
};

export const getPaymentsLedger = async (params) => {
  const { page, limit, search, status, startDate, endDate } = params;
  const response = await api.get('/api/admin/payments', {
    params: { page, limit, search, status, startDate, endDate },
  });
  return response.data;
};

export const getAdminPayouts = async (params) => {
    const response = await api.get('/api/admin/payouts', { params });
    return response.data;
};

export const getAdminDisputes = async (params) => {
    const response = await api.get('/api/admin/disputes', { params });
    return response.data;
};

export const getAdminDiscounts = async (params) => {
    const response = await api.get('/api/admin/discounts', { params });
    return response.data;
};

export const createDiscountByAdmin = async (discountData) => {
  const response = await api.post('/api/admin/discounts', discountData);
  return response.data;
};

export const updateDiscountByAdmin = async (discountId, updates) => {
  const response = await api.patch(`/api/admin/discounts/${discountId}`, updates);
  return response.data;
};

export const deleteDiscountByAdmin = async (discountId) => {
  const response = await api.delete(`/api/admin/discounts/${discountId}`);
  return response.data;
};

export const getModerationQueue = async (filters) => {
  try {
    const { data } = await api.get('/api/admin/moderation/queue', { params: filters });
    return data;
  } catch (error) {
    console.error("Error fetching moderation queue:", error);
    throw error;
  }
};

export const updateAdminDashboardPreferences = async (preferences) => {
  const { data } = await api.patch('/api/admin/dashboard-preferences', { preferences });
  return data;
};

export const getFormData = async () => {
  const response = await api.get('/api/admin/forms/discount-data');
  return response.data;
};

export const getPayouts = async (params) => {
  const { data } = await api.get('/api/admin/payouts', { params });
  return data;
};

export const updatePayoutStatus = async (paymentId, payload) => {
  const { data } = await api.patch(`/api/admin/payouts/${paymentId}/status`, payload);
  return data;
};

export const resolveReviewFlag = async ({ reviewId, flagId, action, reason }) => {
    try {
        const { data } = await api.post(`/api/admin/moderation/reviews/${reviewId}/flags/${flagId}/resolve`, { action, reason });
        return data;
    } catch (error) {
        console.error("Error resolving review flag:", error);
        throw error;
    }
};

export const getDisputeDetail = async (ticketId) => {
    const { data } = await api.get(`/api/admin/disputes/${ticketId}`);
    return data;
};

export const executeAdminRefund = async (paymentId, { amount, reason, policyType }) => {
    const { data } = await api.post(`/api/admin/refunds/execute/${paymentId}`, { amount, reason, policyType });
    return data;
};

export const resolveDispute = async (ticketId, payload) => {
    const { data } = await api.post(`/api/admin/disputes/${ticketId}/resolve`, payload);
    return data;
};

export const getVatReport = async (params) => {
  const response = await api.get('/api/admin/financials/vat-report', { params });
  return response.data;
};
export const getAdminB2bDocumentUrl = (invoiceId) => api.get(`/api/admin/documents/${invoiceId}`);

export const downloadSettlementAdvice = async ({ paymentId, language }) => {
    const response = await fileApi.get(`/api/admin/financials/settlement-advice/${paymentId}`, {
        responseType: 'blob',
        params: { lang: language }
    });

    const contentDisposition = response.headers['content-disposition'];
    let filename = `settlement-advice-${paymentId}.pdf`;
    if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch?.[1]) {
            filename = filenameMatch[1];
        }
    }
    
    return { data: response.data, filename };
};

export const getVatThresholdSummary = async () => {
  const response = await api.get('/api/admin/financials/vat-threshold-summary');
  return response.data;
};

export const deleteUserByAdmin = async (userId, confirmationName) => {
  const response = await api.delete(`/api/admin/users/${userId}`, { data: { confirmationName } });
  return response.data;
};

export const getAdminPrograms = async (filters) => {
  const { data } = await api.get('/api/admin/programs', { params: filters });
  return data;
};

export const updateProgramByAdmin = async (programId, updateData) => {
  const { data } = await api.patch(`/api/admin/programs/${programId}`, updateData);
  return data;
};

export const getSupportTickets = async (filters) => {
    try {
        const { data } = await api.get('/api/admin/support/tickets', { params: filters });
        return data;
    } catch (error) {
        console.error("Error fetching support tickets:", error);
        throw error;
    }
};

export const getTicketDetails = async (ticketId) => {
    try {
        const { data } = await api.get(`/api/admin/support/tickets/${ticketId}`);
        return data;
    } catch (error) {
        console.error("Error fetching ticket details:", error);
        throw error;
    }
};

export const addInternalNoteToTicket = async (ticketId, { content }) => {
    try {
        const { data } = await api.post(`/api/admin/support/tickets/${ticketId}/internal-notes`, { content });
        return data;
    } catch (error) {
        console.error("Error adding internal note to ticket:", error);
        throw error;
    }
};

export const addMessageToTicket = async ({ ticketId, content, isInternalNote }) => {
    try {
        const { data } = await api.post(`/api/admin/support/tickets/${ticketId}/messages`, { content, isInternalNote });
        return data;
    } catch (error) {
        console.error("Error adding message to ticket:", error);
        throw error;
    }
};

export const updateTicket = async ({ ticketId, updateData }) => {
    try {
        const { data } = await api.patch(`/api/admin/support/tickets/${ticketId}`, updateData);
        return data;
    } catch (error) {
        console.error("Error updating ticket:", error);
        throw error;
    }
};

export const getBlockedPairs = async (filters) => {
    try {
        const { data } = await api.get('/api/admin/users/blocked-pairs', { params: filters });
        return data;
    } catch (error) {
        console.error("Error fetching blocked pairs:", error);
        throw error;
    }
};

export const forceUnblockUser = async ({ blockerId, blockedId, reason }) => {
    try {
        const { data } = await api.delete(`/api/admin/users/${blockerId}/unblock/${blockedId}`, { data: { reason } });
        return data;
    } catch (error) {
        console.error("Error forcing unblock:", error);
        throw error;
    }
};

export const getSystemHealth = async () => {
    const { data } = await api.get('/api/admin/system/health');
    return data;
};

export const getWebhookLogs = async (params) => {
    const { data } = await api.get('/api/admin/webhook-logs', { params });
    return data;
};

export const replayWebhook = async (logId, reason) => {
    const { data } = await api.post(`/api/admin/webhooks/${logId}/replay`, { reason });
    return data;
};

export const getAdminQueues = async () => {
    const { data } = await api.get('/api/admin/queues');
    return data;
};

export const getAdminQueueJobs = async (queueName, params) => {
    const { data } = await api.get(`/api/admin/queues/${queueName}/jobs`, { params });
    return data;
};

export const getAdminJobDetails = async (queueName, jobId) => {
    const { data } = await api.get(`/api/admin/queues/${queueName}/jobs/${jobId}`);
    return data;
};

export const performAdminJobAction = async (queueName, { jobIds, action, reason }) => {
    const { data } = await api.post(`/api/admin/queues/${queueName}/jobs/action`, { jobIds, action, reason });
    return data;
};

export const performAdminQueueAction = async (queueName, { action, reason }) => {
    const { data } = await api.post(`/api/admin/queues/${queueName}/action`, { action, reason });
    return data;
};

export const getFeatureFlags = async () => {
    const { data } = await api.get('/api/admin/feature-flags');
    return data;
};

export const createFeatureFlag = async (flagData) => {
    const { data } = await api.post('/api/admin/feature-flags', flagData);
    return data;
};

export const updateFeatureFlag = async (flagId, updateData) => {
    const { data } = await api.patch(`/api/admin/feature-flags/${flagId}`, updateData);
    return data;
};

export const deleteFeatureFlag = async (flagId) => {
    const { data } = await api.delete(`/api/admin/feature-flags/${flagId}`);
    return data;
};

export const flushCacheKey = async (key) => {
    const { data } = await api.post('/api/admin/cache/flush', { key });
    return data;
};

export const bulkReplayWebhooks = async (logIds, reason) => {
    const { data } = await api.post(`/api/admin/webhooks/replay`, { logIds, reason });
    return data;
};

export const updateCoachByAdmin = async (userId, updateData) => {
  const { data } = await api.patch(`/api/admin/coaches/${userId}`, updateData);
  return data;
};

export const resolveUserFlag = async ({ userId, flagId, action, reason }) => {
    try {
        const { data } = await api.post(`/api/admin/moderation/users/${userId}/flags/${flagId}/resolve`, { action, reason });
        return data;
    } catch (error) {
        console.error("Error resolving user flag:", error);
        throw error;
    }
};

export const getModerationActionDetails = async (auditId) => {
    const { data } = await api.get(`/api/admin/moderation-actions/${auditId}`);
    return data;
};

export const submitSupportTicket = async (ticketData) => {
    const { data } = await api.post('/api/admin/support/tickets', ticketData);
    return data;
};

export const getVerificationQueue = async (filters) => {
    const { data } = await api.get('/api/admin/verifications/queue', { params: filters });
    return data;
};

export const getVerificationDocumentUrl = async (coachUserId, registryName) => {
    const { data } = await api.get(`/api/admin/verifications/document/${coachUserId}/${registryName}`);
    return data;
};

export const resolveVerification = async (payload) => {
    const { data } = await api.post('/api/admin/verifications/resolve', payload);
    return data;
};

export const getAdminLeads = async (params) => {
    const { page, limit, search, type } = params;
    const response = await api.get('/api/admin/leads', {
        params: { page, limit, search, type },
    });
    return response.data;
};