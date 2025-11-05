
import { logger } from '../../utils/logger';
import { shouldThrottleNotification } from '../../utils/notificationHelpers';

class NotificationThrottlingService {
  constructor() {
    this.recentNotifications = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    
    this.throttleWindows = {
      booking_request: 5 * 60 * 1000,      // 5 minutes
      session_starting: 2 * 60 * 1000,     // 2 minutes
      message_received: 60 * 1000,         // 1 minute
      connection_request: 5 * 60 * 1000,   // 5 minutes
      default: 15 * 60 * 1000             // 15 minutes
    };

    this.throttleLimits = {
      booking_request: 3,
      session_starting: 2,
      message_received: 10,
      connection_request: 3,
      default: 20
    };
  }

  shouldThrottle(userId, notification, userPreferences) {
    console.log('[NotificationThrottling] Checking throttle for user:', userId);
    
    // Never throttle urgent notifications
    if (notification.priority === 'urgent') {
      logger.debug('Skipping throttle for urgent notification');
      return false;
    }

    const userNotifications = this.recentNotifications.get(userId) || [];
    const windowSize = this.getThrottleWindow(notification.type);
    const limit = this.getThrottleLimit(notification.type, userPreferences);
    const now = Date.now();

    // Filter notifications within the window
    const recentTypeNotifications = userNotifications.filter(n => 
      n.type === notification.type && 
      (now - n.createdAt) < windowSize
    );

    const shouldThrottle = recentTypeNotifications.length >= limit;

    logger.debug('Throttle check result:', {
      userId,
      notificationType: notification.type,
      shouldThrottle,
      currentCount: recentTypeNotifications.length,
      limit
    });

    if (!shouldThrottle) {
      this.trackNotification(userId, notification);
    }

    return shouldThrottle;
  }

  getThrottleWindow(type) {
    return this.throttleWindows[type] || this.throttleWindows.default;
  }

  getThrottleLimit(type, userPreferences) {
    const userLimit = userPreferences?.throttling?.limits?.[type];
    return userLimit || this.throttleLimits[type] || this.throttleLimits.default;
  }

  trackNotification(userId, notification) {
    console.log('[NotificationThrottling] Tracking notification for user:', userId);
    
    if (!this.recentNotifications.has(userId)) {
      this.recentNotifications.set(userId, []);
    }

    const userNotifications = this.recentNotifications.get(userId);
    userNotifications.push({
      type: notification.type,
      priority: notification.priority,
      createdAt: Date.now()
    });

    logger.debug('Updated recent notifications:', {
      userId,
      count: userNotifications.length,
      type: notification.type
    });
  }

  cleanup() {
    console.log('[NotificationThrottling] Running cleanup');
    const now = Date.now();
    const maxWindow = Math.max(...Object.values(this.throttleWindows));

    for (const [userId, notifications] of this.recentNotifications.entries()) {
      const filtered = notifications.filter(n => (now - n.createdAt) < maxWindow);
      
      if (filtered.length === 0) {
        this.recentNotifications.delete(userId);
        logger.debug('Removed tracking for user:', userId);
      } else {
        this.recentNotifications.set(userId, filtered);
        logger.debug('Updated tracking for user:', {
          userId,
          originalCount: notifications.length,
          newCount: filtered.length
        });
      }
    }
  }

  getUserThrottleSettings(userId, userPreferences) {
    console.log('[NotificationThrottling] Getting user throttle settings:', userId);
    
    return {
      enabled: userPreferences?.throttling?.enabled ?? true,
      limits: {
        ...this.throttleLimits,
        ...userPreferences?.throttling?.limits
      },
      windows: {
        ...this.throttleWindows,
        ...userPreferences?.throttling?.windows
      }
    };
  }

  dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.recentNotifications.clear();
    logger.info('NotificationThrottlingService disposed');
  }
}

export default new NotificationThrottlingService();