import { NotificationTypes, NotificationCategories } from './notificationHelpers';
import moment from 'moment';

export const GroupTypes = {
  DATE: 'date',
  TYPE: 'type',
  PRIORITY: 'priority',
  STATUS: 'status',
  CATEGORY: 'category'
};

export const GroupLabels = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  THIS_MONTH: 'this_month',
  OLDER: 'older'
};

export class NotificationGrouper {
  static groupByDate(notifications) {
    const now = moment();
    const groups = {
      [GroupLabels.TODAY]: [],
      [GroupLabels.YESTERDAY]: [],
      [GroupLabels.THIS_WEEK]: [],
      [GroupLabels.LAST_WEEK]: [],
      [GroupLabels.THIS_MONTH]: [],
      [GroupLabels.OLDER]: []
    };

    notifications.forEach(notification => {
      const date = moment(notification.createdAt);
      const diff = now.diff(date, 'days');

      if (diff < 1) {
        groups[GroupLabels.TODAY].push(notification);
      } else if (diff < 2) {
        groups[GroupLabels.YESTERDAY].push(notification);
      } else if (date.isSame(now, 'week')) {
        groups[GroupLabels.THIS_WEEK].push(notification);
      } else if (date.isSame(now.clone().subtract(1, 'week'), 'week')) {
        groups[GroupLabels.LAST_WEEK].push(notification);
      } else if (date.isSame(now, 'month')) {
        groups[GroupLabels.THIS_MONTH].push(notification);
      } else {
        groups[GroupLabels.OLDER].push(notification);
      }
    });

    return this.cleanEmptyGroups(groups);
  }

  static groupByType(notifications) {
    const groups = {};
    
    notifications.forEach(notification => {
      const type = notification.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(notification);
    });

    return this.sortGroupsByPriority(groups);
  }

  static groupByCategory(notifications) {
    const groups = {};
    
    notifications.forEach(notification => {
      const category = this.getNotificationCategory(notification);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(notification);
    });

    return this.cleanEmptyGroups(groups);
  }

  static groupByPriority(notifications) {
    const groups = {
      urgent: [],
      high: [],
      medium: [],
      low: []
    };

    notifications.forEach(notification => {
      const priority = notification.priority || 'medium';
      groups[priority].push(notification);
    });

    return this.cleanEmptyGroups(groups);
  }

  static groupByStatus(notifications) {
    const groups = {
      unread: [],
      read: []
    };

    notifications.forEach(notification => {
      const group = notification.isRead ? 'read' : 'unread';
      groups[group].push(notification);
    });

    return this.cleanEmptyGroups(groups);
  }

  static getNotificationCategory(notification) {
    if (notification.type.includes('booking')) {
      return NotificationCategories.BOOKING;
    } else if (notification.type.includes('session')) {
      return NotificationCategories.SESSION;
    } else if (notification.type.includes('payment')) {
      return NotificationCategories.PAYMENT;
    }
    return notification.category || NotificationCategories.SYSTEM;
  }

  static sortGroupsByPriority(groups) {
    const priorityOrder = {
      [NotificationTypes.BOOKING_REQUEST]: 1,
      [NotificationTypes.SESSION_STARTING]: 2,
      [NotificationTypes.BOOKING_CONFIRMED]: 3,
      // Add more types as needed
    };

    return Object.fromEntries(
      Object.entries(groups).sort(([typeA], [typeB]) => {
        const priorityA = priorityOrder[typeA] || 999;
        const priorityB = priorityOrder[typeB] || 999;
        return priorityA - priorityB;
      })
    );
  }

  static cleanEmptyGroups(groups) {
    return Object.fromEntries(
      Object.entries(groups).filter(([_, notifications]) => notifications.length > 0)
    );
  }

  static groupNotifications(notifications, groupingType = GroupTypes.DATE) {
    console.log(`[NotificationGrouper] Grouping notifications by: ${groupingType}`);
    
    switch (groupingType) {
      case GroupTypes.DATE:
        return this.groupByDate(notifications);
      case GroupTypes.TYPE:
        return this.groupByType(notifications);
      case GroupTypes.PRIORITY:
        return this.groupByPriority(notifications);
      case GroupTypes.STATUS:
        return this.groupByStatus(notifications);
      case GroupTypes.CATEGORY:
        return this.groupByCategory(notifications);
      default:
        console.warn(`[NotificationGrouper] Unknown grouping type: ${groupingType}`);
        return this.groupByDate(notifications);
    }
  }
}

export const getGroupStats = (group) => {
  const total = group.length;
  const unread = group.filter(n => !n.isRead).length;
  const urgent = group.filter(n => n.priority === 'urgent').length;
  
  return {
    total,
    unread,
    urgent,
    hasUnread: unread > 0,
    hasUrgent: urgent > 0
  };
};

export const shouldCollapseGroup = (group, userPreferences) => {
  if (!userPreferences?.autoCollapse) return false;
  
  const stats = getGroupStats(group);
  
  // Don't collapse if there are urgent or unread notifications
  if (stats.hasUrgent || stats.hasUnread) return false;
  
  // Collapse if the group is older than the threshold
  const oldestNotification = group[0];
  const threshold = userPreferences.collapseThreshold || 7 * 24 * 60 * 60 * 1000; // 7 days
  return Date.now() - new Date(oldestNotification.createdAt).getTime() > threshold;
};