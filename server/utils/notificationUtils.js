const NotificationSettings = require('../models/NotificationSettings');
const { logger } = require('./logger');

exports.shouldThrottleNotification = async (userId, type) => {
  try {
    const settings = await NotificationSettings.getActive();
    if (!settings.throttling.enabled) return false;

    const { maxPerMinute, maxPerHour } = settings.throttling;
    const rule = settings.deliveryRules.get(type);
    
    if (rule?.throttleExempt) return false;

    // Check rate limits
    const minuteCount = await Notification.countDocuments({
      recipient: userId,
      createdAt: { $gte: new Date(Date.now() - 60000) }
    });

    const hourCount = await Notification.countDocuments({
      recipient: userId,
      createdAt: { $gte: new Date(Date.now() - 3600000) }
    });

    return minuteCount >= maxPerMinute || hourCount >= maxPerHour;
  } catch (error) {
    logger.error('[NotificationUtils] Error checking throttle:', error);
    return false; // Fail open to ensure delivery in case of errors
  }
};

exports.getNotificationChannels = async (type, userPreferences) => {
  try {
    const settings = await NotificationSettings.getActive();
    const rule = settings.deliveryRules.get(type);
    
    if (!rule) return settings.defaults.channels;

    const channels = new Set(rule.requiredChannels);
    
    // Add user preferred channels if they have set preferences
    if (userPreferences?.channels) {
      Object.entries(userPreferences.channels)
        .forEach(([channel, enabled]) => {
          if (enabled) channels.add(channel);
        });
    }

    return Array.from(channels);
  } catch (error) {
    logger.error('[NotificationUtils] Error getting channels:', error);
    return ['inApp']; // Fallback to in-app only
  }
};

exports.shouldSendNotification = async (notification, userPreferences) => {
  try {
    const settings = await NotificationSettings.getActive();
    
    // Check quiet hours
    if (userPreferences?.timing?.quietHoursEnabled) {
      const { quietHoursStart, quietHoursEnd } = userPreferences.timing;
      const now = new Date();
      const currentHour = now.getHours();
      const startHour = parseInt(quietHoursStart.split(':')[0]);
      const endHour = parseInt(quietHoursEnd.split(':')[0]);
      
      if (currentHour >= startHour || currentHour < endHour) {
        const rule = settings.deliveryRules.get(notification.type);
        if (!rule?.priority === 'high') return false;
      }
    }

    // Add other delivery rules here

    return true;
  } catch (error) {
    logger.error('[NotificationUtils] Error checking notification rules:', error);
    return true; // Fail open to ensure delivery in case of errors
  }
};