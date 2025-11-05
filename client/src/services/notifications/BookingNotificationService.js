// services/notifications/BookingNotificationService.js
import { NotificationTypes } from '../../utils/notificationHelpers';
import { getNotificationPreferences } from '../notificationAPI';
import { sendNotification } from '../socketService';
import moment from 'moment';

class BookingNotificationService {
  async sendBookingNotification(notificationData, recipientId, type, options = {}) {
    try {
      // Get recipient's notification preferences
      const userPreferences = await getNotificationPreferences(recipientId);
      
      // Check if user has disabled this type of notification
      if (userPreferences?.types?.[type] === false) {
        console.log(`[BookingNotificationService] Notifications of type ${type} are disabled for user ${recipientId}`);
        return null;
      }

      // Determine notification priority
      const priority = this.getNotificationPriority(type);

      // Get content based on type
      const content = {
        title: options.t(`notifications:${type}.title`, {
          coachName: notificationData.coachName,
          clientName: notificationData.clientName
        }),
        message: options.t(`notifications:${type}.message`, {
          date: moment(notificationData.start).format('LL'),
          time: moment(notificationData.start).format('LT'),
          duration: notificationData.duration || 
            moment(notificationData.end).diff(moment(notificationData.start), 'minutes'),
          sessionType: notificationData.sessionTypeName
        })
      };

      // Create the notification
      return await sendNotification({
        recipient: recipientId,
        type,
        priority,
        content,
        metadata: options.metadata,
        channels: ['in_app', 'email']
      });
    } catch (error) {
      console.error('[BookingNotificationService] Error sending notification:', error);
      throw new Error('Failed to send booking notification');
    }
  }

  async scheduleSessionReminders(bookingData, recipients, options = {}) {
    try {
      console.log('[BookingNotificationService] Scheduling reminders for booking:', {
        bookingId: bookingData._id,
        recipients
      });

      const reminderTimes = [60, 30, 15, 5]; // minutes before session
      const sessionStart = moment(bookingData.start);

      for (const recipient of recipients) {
        for (const minutes of reminderTimes) {
          const reminderTime = moment(sessionStart).subtract(minutes, 'minutes');
          
          // Only schedule if it's in the future
          if (reminderTime.isAfter(moment())) {
            await sendNotification({
              recipient,
              type: NotificationTypes.SESSION_REMINDER,
              priority: 'medium',
              content: {
                title: options.t('notifications:sessionReminder.title'),
                message: options.t('notifications:sessionReminder.message', {
                  minutes,
                  sessionType: bookingData.sessionTypeName,
                  time: sessionStart.format('LT')
                })
              },
              metadata: {
                bookingId: bookingData._id,
                reminderTime: minutes
              },
              channels: ['in_app', 'email'],
              scheduledFor: reminderTime.toDate()
            });
          }
        }
      }
    } catch (error) {
      console.error('[BookingNotificationService] Error scheduling reminders:', error);
      // Don't throw - reminder failure shouldn't break the booking flow
      return false;
    }
  }

  async isInQuietHours(userId) {
    try {
      const preferences = await getNotificationPreferences(userId);
      
      if (!preferences?.timing?.quietHoursEnabled) {
        return false;
      }

      const now = moment();
      const start = moment(preferences.timing.quietHoursStart, 'HH:mm');
      const end = moment(preferences.timing.quietHoursEnd, 'HH:mm');

      if (start.isAfter(end)) {
        return now.isAfter(start) || now.isBefore(end);
      }

      return now.isBetween(start, end);
    } catch (error) {
      console.error('[BookingNotificationService] Error checking quiet hours:', error);
      return false;
    }
  }

  // Add this new method to BookingNotificationService.js at the bottom of the class
async createNotification(recipientId, type, options = {}) {
  try {
    console.log('[BookingNotificationService] Creating notification:', {
      recipientId,
      type,
      options
    });

    const notification = {
      recipient: recipientId,
      type,
      priority: this.getNotificationPriority(type),
      content: {
        title: options.t(`notifications:${type}.title`, options.templateData),
        message: options.t(`notifications:${type}.message`, options.templateData)
      },
      metadata: options.metadata || {},
      channels: options.channels || ['in_app'],
      sender: options.senderId
    };

    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(notification),
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('[BookingNotificationService] Notification created:', result);
    return result;
  } catch (error) {
    console.error('[BookingNotificationService] Error creating notification:', error);
    throw error;
  }
}

  getNotificationPriority(type) {
    switch (type) {
      case NotificationTypes.BOOKING_REQUEST:
      case NotificationTypes.SESSION_STARTING_SOON:
        return 'high';
      case NotificationTypes.BOOKING_CONFIRMED:
      case NotificationTypes.BOOKING_DECLINED:
        return 'medium';
      default:
        return 'low';
    }
  }
}

export default new BookingNotificationService();