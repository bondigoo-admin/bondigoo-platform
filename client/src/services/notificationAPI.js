import api from './api';
import { logger } from '../utils/logger';

export const getNotifications = async (params = {}) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      // Return early if there's no token
      return { success: false, notifications: [] };
    }

    const queryParams = new URLSearchParams({
      ...params,
      status: params.status || '',
      category: params.category || '',    
      limit: params.limit || 50,         
      offset: params.offset || 0
    });
    const finalURL = `/api/notifications?${queryParams}`;
    logger.info('[FRONTEND-API] Making fetch request to URL:', finalURL);
    const response = await fetch(finalURL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'If-Modified-Since': new Date(params.lastFetchTime).toUTCString()
      },
      credentials: 'include'
    });

    if (response.status === 304) {
      //logger.info('[NotificationAPI] No new notifications since last fetch');
      return { success: true, notifications: [] };
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    //logger.info('[NotificationAPI] Fetched notifications:', data);
    return data;
  } catch (error) {
    console.error('[NotificationAPI] Error fetching notifications:', error);
    throw error;
  }
};

export const sendNotification = async (notificationData) => {
  try {
    logger.info('[notificationAPI] Sending notification via API', { type: notificationData.type, recipient: notificationData.recipient });
    const { data } = await api.post('/api/notifications', notificationData);
    // The socket emission that was here is now handled server-side.
    // The server will emit a 'notification' event to the recipient upon successful creation.
    return data;
  } catch (error) {
    logger.error('[notificationAPI] Error sending notification', { error: error.response?.data || error.message });
    throw error;
  }
};

export const createNotification = async (notificationData) => {
  try {
    const response = await api.post('/notifications', notificationData);
    return response.data;
  } catch (error) {
    logger.error('[NotificationAPI] Error creating notification:', error);
    throw error;
  }
};

export const markNotificationAsRead = async (notificationId) => {
  try {
    const response = await api.put(`/api/notifications/${notificationId}/read`);
    return response.data;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

export const markAllNotificationsAsRead = async () => {
  try {
    const response = await api.put('/api/notifications/mark-all-read');
    return response.data;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

export const handleNotificationAction = async (notificationId, action) => {
  try {
    const response = await api.post(`/api/notifications/${notificationId}/action`, { action });
    return response.data;
  } catch (error) {
    console.error('Error handling notification action:', error);
    throw error;
  }
};

export const deleteNotification = async (notificationId) => {
  try {
    const response = await api.delete(`/api/notifications/${notificationId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

export const markNotificationDelivered = async (notificationId, channel) => {
  try {
    const response = await api.put(`/api/notifications/${notificationId}/delivered`, { channel });
    return response.data;
  } catch (error) {
    console.error('Error marking notification as delivered:', error);
    throw error;
  }
};

export const getNotificationPreferences = async () => {
  try {
    const response = await api.get('/api/notifications/preferences');
    return response.data;
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    throw error;
  }
};

export const updateNotificationPreferences = async (preferences) => {
  try {
    const response = await api.put('/api/notifications/preferences', preferences);
    return response.data;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    throw error;
  }
};

export const batchMarkAsRead = async (notificationIds) => {
  try {
    //logger.info('[NotificationAPI] Batch marking notifications as read:', notificationIds);
    const response = await api.put('/api/notifications/batch/read', { notificationIds });
    
    logger.info('[NotificationAPI] Batch mark as read successful:', {
      count: notificationIds.length,
      response: response.data
    });
    
    return response.data;
  } catch (error) {
    logger.error('[NotificationAPI] Error in batch mark as read:', error);
    throw error;
  }
};

export const batchMoveToTrash = async (notificationIds) => {
  try {
    //logger.info('[NotificationAPI] Moving notifications to trash:', notificationIds);
    const response = await api.put('/api/notifications/batch/trash', { notificationIds });
    
    logger.info('[NotificationAPI] Batch move to trash successful:', {
      count: notificationIds.length,
      response: response.data
    });
    
    return response.data;
  } catch (error) {
    logger.error('[NotificationAPI] Error in batch move to trash:', error);
    throw error;
  }
};

export const batchRestore = async (notificationIds) => {
  try {
    //logger.info('[NotificationAPI] Restoring notifications:', notificationIds);
    const response = await api.put('/api/notifications/batch/restore', { notificationIds });
    
    logger.info('[NotificationAPI] Batch restore successful:', {
      count: notificationIds.length,
      response: response.data
    });
    
    return response.data;
  } catch (error) {
    logger.error('[NotificationAPI] Error in batch restore:', error);
    throw error;
  }
};

export const emptyTrash = async () => {
  try {
    //logger.info('[NotificationAPI] Emptying trash');
    const response = await api.delete('/api/notifications/trash/empty');
    
    logger.info('[NotificationAPI] Empty trash successful:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[NotificationAPI] Error emptying trash:', error);
    throw error;
  }
};

export const markNotificationAsActioned = async (notificationId) => {
  try {
    //logger.info('[NotificationAPI] Marking notification as actioned:', notificationId);
    const response = await api.patch(`/api/notifications/${notificationId}/actioned`);
    
    logger.info('[NotificationAPI] Notification marked as actioned successfully:', {
      notificationId,
      response: response.data
    });
    
    return response.data;
  } catch (error) {
    logger.error('[NotificationAPI] Error marking notification as actioned:', error);
    throw error;
  }
};

export const getEntityData = async (entityId, entityType) => {
  try {
    let endpoint;
    switch (entityType) {
      case 'program':
        endpoint = `/api/programs/${entityId}`;
        break;
      case 'booking':
      default:
        endpoint = `/api/bookings/${entityId}`;
        break;
    }
    logger.info('[API] Fetching entity data', { entityId, entityType, endpoint });
    const response = await api.get(endpoint);
    return response.data;
  } catch (error) {
    logger.error('[API] Error fetching entity data', { entityId, entityType, error });
    throw error;
  }
};