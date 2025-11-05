// services/notificationService.js

const createNotification = async ({ recipient, type, content, metadata = {} }) => {
  try {
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Token will be sent automatically through cookies
      },
      credentials: 'include',
      body: JSON.stringify({
        recipient,
        type,
        content,
        metadata
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create notification');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

const getNotifications = async () => {
  try {
    const response = await fetch('/api/notifications', {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
};

const markAsRead = async (notificationId) => {
  try {
    const response = await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to mark notification as read');
    }

    return await response.json();
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

export const NotificationService = {
  createNotification,
  getNotifications,
  markAsRead
};