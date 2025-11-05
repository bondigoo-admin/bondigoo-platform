const { 
  NotificationTypes, 
  NotificationCategories, 
  NotificationPriorities,
  NotificationMetadata,
  NotificationChannels,
  NotificationStatus 
} = require('./notificationHelpers');

const BookingStatusToNotification = {
  requested: {
    type: NotificationTypes.BOOKING_REQUEST,
    notifications: [
      {
        recipient: 'coach',
        priority: NotificationPriorities.HIGH,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: true,
        actions: ['approve', 'decline', 'suggest'],
        metadata: {
          actionRequired: true,
          responseTimeout: 24 * 60 * 60 * 1000 // 24 hours
        }
      }
    ]
  },
  firm_booked: {
    type: NotificationTypes.BOOKING_CONFIRMED,
    notifications: [
      {
        recipient: 'both',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
         requiresAction: true, 
        actions: ['view', 'cancel'],
        metadata: {
          instantBooking: true
        }
      }
    ]
  },
  confirmed: {
    type: NotificationTypes.BOOKING_CONFIRMED,
    notifications: [
      {
        recipient: 'client',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
         requiresAction: true, 
        actions: ['view', 'reschedule', 'cancel']
      },
      {
        recipient: 'coach',
        priority: NotificationPriorities.LOW,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP],
        requiresAction: false,
        actions: ['view']
      }
    ]
  },
  declined: {
    type: NotificationTypes.BOOKING_DECLINED,
    notifications: [
      {
        recipient: 'client',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: false,
        actions: ['view'],
        metadata: {
          actionRequired: false,
          status: 'declined'
        }
      }
    ]
  },
  cancelled_by_coach: {
    type: NotificationTypes.BOOKING_CANCELLED,
    notifications: [
      {
        recipient: 'client',
        priority: NotificationPriorities.HIGH,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: false,
        actions: ['view'],
        metadata: { 
          cancelledBy: 'coach',
          requiresRefund: true
        }
      }
    ]
  },
  cancelled_by_client: {
    type: NotificationTypes.BOOKING_CANCELLED,
    notifications: [
      {
        recipient: 'coach',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: false,
        actions: ['view'],
        metadata: { 
          cancelledBy: 'client',
          requiresRefund: false
        }
      }
    ]
  },
  rescheduled: {
    type: NotificationTypes.BOOKING_RESCHEDULED,
    notifications: [
      {
        recipient: 'both',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: false,
        actions: ['view', 'cancel']
      }
    ]
  },
  payment_made_by_user: {
    type: NotificationTypes.PAYMENT_MADE_BY_USER,
    notifications: [
      {
        recipient: 'coach',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.PAYMENT,
        channels: [NotificationChannels.IN_APP],
        requiresAction: false,
        actions: ['view'],
        metadata: {
          paymentStatus: 'completed'
        }
      }
    ]
  },
  completed: {
    type: NotificationTypes.SESSION_COMPLETED,
    notifications: [
      {
        recipient: 'coach',
        type: NotificationTypes.REVIEW_PROMPT_COACH,
        category: NotificationCategories.REVIEW,
        priority: NotificationPriorities.HIGH,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: true,
        metadata: {
          status: 'active'  // Explicitly set to 'active' for "open" state
        },
      },
      {
        recipient: 'client',
        type: NotificationTypes.REVIEW_PROMPT_CLIENT,
        category: NotificationCategories.REVIEW,
        priority: NotificationPriorities.HIGH,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        requiresAction: true,
        metadata: {
          status: 'active'  // Explicitly set to 'active' for "open" state
        },
      },
    ],
  },
};

exports.getNotificationsForStatusChange = (oldStatus, newStatus, booking) => {
  const notifications = [];
  
  // Add specific mappings for status transitions
  if (oldStatus === 'requested' && newStatus === 'confirmed') {
    notifications.push({
      type: NotificationTypes.BOOKING_CONFIRMED,
      recipients: ['both']
    });
  }
  
  return notifications;
};

const getNotificationsForBookingStatus = (status, booking) => {
  console.log('[BookingNotificationMapper] Processing notifications for booking:', {
    bookingId: booking._id,
    status: status,
    bookingType: booking.bookingType,
    coach: booking.coach,
    client: booking.user,
    sessionType: booking.sessionType?._id,
    start: booking.start,
    timestamp: new Date().toISOString()
  });

  const config = BookingStatusToNotification[status];
  if (!config) {
    console.warn('[BookingNotificationMapper] No notification config found for status:', {
      status,
      bookingId: booking._id,
      availableStatuses: Object.keys(BookingStatusToNotification)
    });
    return [];
  }

  // Get metadata from notification type configuration
  const typeMetadata = NotificationMetadata[config.type] || {};

  const notifications = config.notifications.flatMap(notifConfig => {
    const recipients = [];
    
    if (notifConfig.recipient === 'coach' || notifConfig.recipient === 'both') {
      if (!booking.coach) {
        console.warn('[BookingNotificationMapper] Missing coach for notification:', {
          bookingId: booking._id,
          status: status
        });
        return [];
      }
      
      recipients.push({
        ...notifConfig,
        type: notifConfig.type || config.type,  // Use specific type if provided
        recipient: booking.coach._id.toString(),
        recipientType: 'coach',
        status: notifConfig.metadata?.status || NotificationStatus.ACTIVE,  // Apply status from metadata
        metadata: {
          ...notifConfig.metadata,
          bookingId: booking._id,
          sessionType: booking.sessionType?._id,
          startTime: booking.start,
          endTime: booking.end,
          bookingType: booking.bookingType
        }
      });
    }

    if (notifConfig.recipient === 'client' || notifConfig.recipient === 'both') {
      if (!booking.user) {
        console.warn('[BookingNotificationMapper] Missing client for notification:', {
          bookingId: booking._id,
          status: status
        });
        return [];
      }
      
      recipients.push({
        ...notifConfig,
        type: notifConfig.type || config.type,  // Use specific type if provided
        recipient: booking.user._id.toString(),
        recipientType: 'client',
        status: notifConfig.metadata?.status || NotificationStatus.ACTIVE,  // Apply status from metadata
        metadata: {
          ...notifConfig.metadata,
          bookingId: booking._id,
          sessionType: booking.sessionType?._id,
          startTime: booking.start,
          endTime: booking.end,
          bookingType: booking.bookingType
        }
      });
    }

    return recipients;
  });

 console.log('[BookingNotificationMapper] Generated notifications:', {
    bookingId: booking._id,
    status: status,
    notificationType: config.type,
    count: notifications.length,
    recipients: notifications.map(n => ({
      type: n.type,
      recipient: n.recipient,
      recipientType: n.recipientType,
      status: n.status,  // Log the status
      channels: n.channels
    }))
  });

  return notifications;
};

module.exports = {
  BookingStatusToNotification,
  getNotificationsForBookingStatus
};