// utils/notificationBatchHelpers.js
import { logger } from './logger';

export const groupNotifications = (notifications) => {
  console.log('[NotificationBatchHelpers] Grouping notifications');
  
  const groups = new Map();
  
  notifications.forEach(notification => {
    const metadata = NotificationMetadata[notification.type];
    if (!metadata?.groupable) {
      groups.set(notification._id, [notification]);
      return;
    }

    let foundGroup = false;
    for (const [key, group] of groups.entries()) {
      if (shouldGroupNotifications(notification, group[0])) {
        group.push(notification);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      groups.set(notification._id, [notification]);
    }
  });

  logger.debug('Notification grouping complete:', {
    totalNotifications: notifications.length,
    totalGroups: groups.size
  });

  return Array.from(groups.values());
};

export const processNotificationBatch = async (notifications, action) => {
  console.log('[NotificationBatchHelpers] Processing batch action:', action);
  
  const results = {
    success: [],
    failure: []
  };

  for (const notification of notifications) {
    try {
      switch (action) {
        case 'mark_read':
          await notification.markAsRead();
          break;
        case 'move_to_trash':
          await notification.moveToTrash();
          break;
        case 'restore':
          await notification.restore();
          break;
        case 'delete':
          await notification.softDelete();
          break;
      }
      results.success.push(notification._id);
    } catch (error) {
      logger.error('Error processing notification:', {
        id: notification._id,
        action,
        error
      });
      results.failure.push({
        id: notification._id,
        error: error.message
      });
    }
  }

  logger.info('Batch processing complete:', {
    action,
    successCount: results.success.length,
    failureCount: results.failure.length
  });

  return results;
};