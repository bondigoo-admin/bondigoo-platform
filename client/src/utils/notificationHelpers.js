import moment from 'moment';
import { logger } from './logger';

export const NotificationCategories = {
  BOOKING: 'booking',
  SESSION: 'session',
  PAYMENT: 'payment',
  CONNECTION: 'connection',
  ACHIEVEMENT: 'achievement',
  RESOURCE: 'resource',
  MESSAGE: 'message',
  SYSTEM: 'system',
  PROFILE: 'profile',
  REVIEW: 'review'
};

export const NotificationTypes = {
  // Booking related
  BOOKING_REQUEST: 'booking_request',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_DECLINED: 'booking_declined',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_RESCHEDULED: 'booking_rescheduled',
  BOOKING_REMINDER: 'booking_reminder',
  
  // Session related
  SESSION_STARTING: 'session_starting',
  SESSION_STARTING_SOON: 'session_starting_soon',
  SESSION_COMPLETED: 'session_completed',
  SESSION_FEEDBACK_REQUIRED: 'session_feedback_required',
  
  // Payment related
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',
  PAYMENT_PENDING: 'payment_pending',
  
  // Connection related
  CONNECTION_REQUEST: 'connection_request',
  CONNECTION_ACCEPTED: 'connection_accepted',
  CONNECTION_DECLINED: 'connection_declined',
  
  // Achievement related
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  MILESTONE_REACHED: 'milestone_reached',
  CERTIFICATE_EARNED: 'certificate_earned',
  
  // Resource related
  RESOURCE_SHARED: 'resource_shared',
  RESOURCE_UPDATED: 'resource_updated',
  RESOURCE_COMMENTED: 'resource_commented',
  
  // Message related
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_REPLIED: 'message_replied',
  
  // System related
  SYSTEM_ANNOUNCEMENT: 'system_announcement',
  SYSTEM_MAINTENANCE: 'system_maintenance',
  SYSTEM_UPDATE: 'system_update',
  
  // Profile related
  PROFILE_VIEWED: 'profile_viewed',
  PROFILE_UPDATED: 'profile_updated',
  DOCUMENT_VERIFIED: 'document_verified',
  
  // Review related
  REVIEW_RECEIVED: 'review_received',
  REVIEW_REPLY: 'review_reply'
};

export const NotificationPriorities = {
  URGENT: 'urgent',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};


// Define status for trash system
export const NotificationStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  TRASH: 'trash',
  DELETED: 'deleted'
};

// Enhanced action types
export const NotificationActions = {
  APPROVE: 'approve',
  DECLINE: 'decline',
  VIEW: 'view',
  REPLY: 'reply',
  JOIN: 'join',
  RESCHEDULE: 'reschedule',
  CANCEL: 'cancel',
  RESTORE: 'restore',
  DELETE: 'delete'
};


export const NotificationMetadata = {
  // Booking notifications
  [NotificationTypes.BOOKING_REQUEST]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.HIGH,
    defaultChannels: ['in_app'],
    requiresAction: true,
    actionButtons: [NotificationActions.APPROVE, NotificationActions.DECLINE],
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    groupable: false,
    autoDelete: false,
    throttle: false,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.BOOKING_CONFIRMED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.BOOKING_DECLINED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.BOOKING_CANCELLED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.BOOKING_RESCHEDULED]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.BOOKING_REMINDER]: {
    category: NotificationCategories.BOOKING,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email', 'push'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    groupable: false,
    autoDelete: true,
    throttle: false,
    retentionPeriod: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  
  // Session notifications
  [NotificationTypes.SESSION_STARTING]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.HIGH,
    defaultChannels: ['in_app', 'push'],
    requiresAction: true,
    actionButtons: [NotificationActions.JOIN],
    ttl: 60 * 60 * 1000, // 1 hour
    groupable: false,
    autoDelete: true,
    throttle: false,
    retentionPeriod: 24 * 60 * 60 * 1000 // 24 hours
  },
  [NotificationTypes.SESSION_STARTING_SOON]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.HIGH,
    defaultChannels: ['in_app', 'push', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 60 * 1000, // 30 minutes
    groupable: false,
    autoDelete: true,
    throttle: false,
    retentionPeriod: 24 * 60 * 60 * 1000 // 24 hours
  },
  [NotificationTypes.SESSION_COMPLETED]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.SESSION_FEEDBACK_REQUIRED]: {
    category: NotificationCategories.SESSION,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: true,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: false,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  
  // Payment notifications
  [NotificationTypes.PAYMENT_RECEIVED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  [NotificationTypes.PAYMENT_FAILED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.HIGH,
    defaultChannels: ['in_app', 'email'],
    requiresAction: true,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: false,
    autoDelete: false,
    throttle: false,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  [NotificationTypes.PAYMENT_REFUNDED]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  [NotificationTypes.PAYMENT_PENDING]: {
    category: NotificationCategories.PAYMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  
  // Connection notifications
  [NotificationTypes.CONNECTION_REQUEST]: {
    category: NotificationCategories.CONNECTION,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: true,
    actionButtons: [NotificationActions.APPROVE, NotificationActions.DECLINE],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: false,
    autoDelete: false,
    throttle: false,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  [NotificationTypes.CONNECTION_ACCEPTED]: {
    category: NotificationCategories.CONNECTION,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.CONNECTION_DECLINED]: {
    category: NotificationCategories.CONNECTION,
    priority: NotificationPriorities.LOW,
    defaultChannels: ['in_app'],
    requiresAction: false,
    actionButtons: [],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: true,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  
  // Achievement notifications
  [NotificationTypes.ACHIEVEMENT_UNLOCKED]: {
    category: NotificationCategories.ACHIEVEMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'push'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  [NotificationTypes.MILESTONE_REACHED]: {
    category: NotificationCategories.ACHIEVEMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'push', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  [NotificationTypes.CERTIFICATE_EARNED]: {
    category: NotificationCategories.ACHIEVEMENT,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  
  // Resource notifications
  [NotificationTypes.RESOURCE_SHARED]: {
    category: NotificationCategories.RESOURCE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  [NotificationTypes.RESOURCE_UPDATED]: {
    category: NotificationCategories.RESOURCE,
    priority: NotificationPriorities.LOW,
    defaultChannels: ['in_app'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.RESOURCE_COMMENTED]: {
    category: NotificationCategories.RESOURCE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW, NotificationActions.REPLY],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  
  // Message notifications
  [NotificationTypes.MESSAGE_RECEIVED]: {
    category: NotificationCategories.MESSAGE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'push'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW, NotificationActions.REPLY],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    
    throttle: true,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  [NotificationTypes.MESSAGE_REPLIED]: {
    category: NotificationCategories.MESSAGE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'push'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  
  // System notifications
  [NotificationTypes.SYSTEM_ANNOUNCEMENT]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: false,
    autoDelete: false,
    throttle: false,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  [NotificationTypes.SYSTEM_MAINTENANCE]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.HIGH,
    defaultChannels: ['in_app', 'email', 'push'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: false,
    autoDelete: true,
    throttle: false,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.SYSTEM_UPDATE]: {
    category: NotificationCategories.SYSTEM,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: false,
    autoDelete: false,
    throttle: false,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  
  // Profile notifications
  [NotificationTypes.PROFILE_VIEWED]: {
    category: NotificationCategories.PROFILE,
    priority: NotificationPriorities.LOW,
    defaultChannels: ['in_app'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: true,
    autoDelete: true,
    throttle: true,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.PROFILE_UPDATED]: {
    category: NotificationCategories.PROFILE,
    priority: NotificationPriorities.LOW,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    groupable: false,
    autoDelete: true,
    throttle: false,
    retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  [NotificationTypes.DOCUMENT_VERIFIED]: {
    category: NotificationCategories.PROFILE,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: false,
    autoDelete: false,
    throttle: false,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  
  // Review notifications
  [NotificationTypes.REVIEW_RECEIVED]: {
    category: NotificationCategories.REVIEW,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW, NotificationActions.REPLY],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  },
  [NotificationTypes.REVIEW_REPLY]: {
    category: NotificationCategories.REVIEW,
    priority: NotificationPriorities.MEDIUM,
    defaultChannels: ['in_app', 'email'],
    requiresAction: false,
    actionButtons: [NotificationActions.VIEW],
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    groupable: true,
    autoDelete: false,
    throttle: true,
    retentionPeriod: 365 * 24 * 60 * 60 * 1000 // 1 year
  }
};


export const shouldThrottleNotification = (notificationType, userPreferences, recentNotifications) => {
  console.log('[NotificationHelpers] Checking throttling for type:', notificationType);
  
  const metadata = NotificationMetadata[notificationType];
  if (!metadata?.throttle) {
    console.log('[NotificationHelpers] Notification type not subject to throttling');
    return false;
  }

  const typeThrottleLimit = userPreferences?.throttling?.[notificationType] || 5;
  const timeWindow = 60 * 1000; // 1 minute default window
  
  const recentTypeNotifications = recentNotifications.filter(n => 
    n.type === notificationType && 
    (Date.now() - n.createdAt) < timeWindow
  );

  const shouldThrottle = recentTypeNotifications.length >= typeThrottleLimit;
  console.log('[NotificationHelpers] Throttling check result:', {
    type: notificationType,
    recentCount: recentTypeNotifications.length,
    limit: typeThrottleLimit,
    shouldThrottle
  });

  return shouldThrottle;
};

export const getNotificationRetentionPeriod = (notification, userPreferences) => {
  console.log('[NotificationHelpers] Calculating retention period for notification:', notification._id);
  
  const baseRetention = {
    [NotificationStatus.ACTIVE]: 30 * 24 * 60 * 60 * 1000, // 30 days
    [NotificationStatus.ARCHIVED]: 90 * 24 * 60 * 60 * 1000, // 90 days
    [NotificationStatus.TRASH]: 30 * 24 * 60 * 60 * 1000 // 30 days in trash
  };

  const userRetention = userPreferences?.retentionPeriod?.[notification.status] || baseRetention[notification.status];
  
  console.log('[NotificationHelpers] Retention period calculated:', {
    status: notification.status,
    retention: userRetention,
    notification: notification._id
  });

  return userRetention;
};

export const getBookingNotificationContent = (type, bookingData, t) => {
  const { coachName, clientName, sessionType, start, end } = bookingData;
  const formattedDate = new Date(start).toLocaleString();
  const duration = moment(end).diff(moment(start), 'minutes');

  switch (type) {
    case NotificationTypes.BOOKING_REQUEST:
      return {
        title: t('notifications:booking.requestTitle', { clientName }),
        message: t('notifications:booking.requestMessage', {
          sessionType: sessionType.name,
          duration,
          date: formattedDate
        }),
        actions: [
          {
            type: 'approve',
            label: t('notifications:actions.approve')
          },
          {
            type: 'reject',
            label: t('notifications:actions.reject')
          }
        ]
      };

    case NotificationTypes.BOOKING_CONFIRMED:
      return {
        title: t('notifications:booking.confirmedTitle'),
        message: t('notifications:booking.confirmedMessage', {
          coachName,
          sessionType: sessionType.name,
          duration,
          date: formattedDate
        }),
        actions: [
          {
            type: 'view',
            label: t('notifications:actions.viewDetails')
          },
          {
            type: 'reschedule',
            label: t('notifications:actions.reschedule')
          },
          {
            type: 'cancel',
            label: t('notifications:actions.cancel')
          }
        ]
      };

    case NotificationTypes.BOOKING_DECLINED:
      return {
        title: t('notifications:booking.declinedTitle'),
        message: t('notifications:booking.declinedMessage', {
          coachName,
          sessionType: sessionType.name,
          date: formattedDate
        }),
        actions: [
          {
            type: 'rebook',
            label: t('notifications:actions.rebook')
          }
        ]
      };

    case NotificationTypes.BOOKING_CANCELLED:
      return {
        title: t('notifications:booking.cancelledTitle'),
        message: t('notifications:booking.cancelledMessage', {
          coachName,
          sessionType: sessionType.name,
          date: formattedDate
        })
      };

    case NotificationTypes.SESSION_STARTING:
      return {
        title: t('notifications:session.startingTitle'),
        message: t('notifications:session.startingMessage', {
          sessionType: sessionType.name,
          time: new Date(start).toLocaleTimeString()
        }),
        actions: [
          {
            type: 'join',
            label: t('notifications:actions.joinSession')
          }
        ]
      };

    default:
      return {
        title: t('notifications:booking.updateTitle'),
        message: t('notifications:booking.updateMessage', {
          sessionType: sessionType.name,
          date: formattedDate
        })
      };
  }
};

export const getNotificationDeliveryChannels = (type, userPreferences) => {
  // Default channels if no preferences are set
  if (!userPreferences) {
    return ['in_app', 'email'];
  }

  const channels = [];
  const { email, push, inApp, types } = userPreferences;

  // Check if notification type is enabled
  if (!types[type]) {
    return ['in_app']; // Always send in-app as fallback
  }

  if (inApp) channels.push('in_app');
  if (email) channels.push('email');
  if (push) channels.push('push');

  return channels;
};

export const getNotificationPriority = (type) => {
  switch (type) {
    case NotificationTypes.BOOKING_REQUEST:
    case NotificationTypes.SESSION_STARTING:
      return NotificationPriorities.HIGH;
    
    case NotificationTypes.BOOKING_CONFIRMED:
    case NotificationTypes.BOOKING_DECLINED:
    case NotificationTypes.BOOKING_CANCELLED:
      return NotificationPriorities.MEDIUM;
    
    default:
      return NotificationPriorities.LOW;
  }
};

export const getNotificationCategory = (type) => {
  console.log('[NotificationHelpers] Getting category for type:', type);
  const metadata = NotificationMetadata[type];
  logger.debug('Notification metadata:', metadata);
  return metadata?.category || NotificationCategories.SYSTEM;
};

export const shouldGroupNotifications = (notification1, notification2) => {
  console.log('[NotificationHelpers] Checking notification grouping');
  
  const metadata = NotificationMetadata[notification1.type];
  if (!metadata?.groupable) {
    logger.debug('Notification type not groupable:', notification1.type);
    return false;
  }

  const sameType = notification1.type === notification2.type;
  const sameCategory = getNotificationCategory(notification1.type) === getNotificationCategory(notification2.type);
  const timeThreshold = 30 * 60 * 1000; // 30 minutes
  const timeClose = Math.abs(notification1.createdAt - notification2.createdAt) < timeThreshold;

  logger.debug('Grouping check result:', {
    sameType,
    sameCategory,
    timeClose,
    shouldGroup: sameType && sameCategory && timeClose
  });

  return sameType && sameCategory && timeClose;
};

// Add new function for handling trash operations
export const handleNotificationTrash = (notification, action) => {
  console.log('[NotificationHelpers] Handling trash action:', action);
  const currentTime = new Date();

  switch (action) {
    case 'move_to_trash':
      return {
        ...notification,
        status: NotificationStatus.TRASH,
        trashedAt: currentTime,
        expiresAt: new Date(currentTime.getTime() + 30 * 24 * 60 * 60 * 1000)
      };

    case 'restore':
      return {
        ...notification,
        status: NotificationStatus.ACTIVE,
        trashedAt: null,
        expiresAt: null
      };

    case 'delete':
      return {
        ...notification,
        status: NotificationStatus.DELETED,
        deletedAt: currentTime
      };

    default:
      logger.warn('Unknown trash action:', action);
      return notification;
  }
};

export const shouldShowToast = (notification, userPreferences) => {
  if (!userPreferences) return notification.priority === NotificationPriorities.HIGH;

  const { toastNotifications, toastPriority } = userPreferences;
  if (!toastNotifications) return false;

  switch (toastPriority) {
    case 'all':
      return true;
    case 'high':
      return notification.priority === NotificationPriorities.HIGH;
    case 'high_medium':
      return ['high', 'medium'].includes(notification.priority);
    default:
      return notification.priority === NotificationPriorities.HIGH;
  }
};

export const getNotificationExpiryTime = (type) => {
  const now = new Date();
  
  switch (type) {
    case NotificationTypes.SESSION_STARTING:
      // Expire after 1 hour
      return new Date(now.getTime() + 60 * 60 * 1000);
    
    case NotificationTypes.BOOKING_REQUEST:
      // Expire after 24 hours
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    default:
      // Default to 30 days
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
};