import { NotificationTypes } from '../../utils/notificationHelpers';
import BookingNotificationService from './BookingNotificationService';
import moment from 'moment';

class SessionReminderService {
  // Default reminder times (can be overridden by user preferences)
  defaultReminderTimes = [
    { minutes: 1440, type: 'day_before' },    // 24 hours
    { minutes: 60, type: 'hour_before' },     // 1 hour
    { minutes: 15, type: 'starting_soon' }    // 15 minutes
  ];

  async scheduleSessionReminders(sessionData, recipients, options = {}) {
    try {
      const { start, end } = sessionData;
      const sessionStart = moment(start);

      for (const recipient of recipients) {
        // Get user's notification preferences
        const userSettings = await getNotificationSettings(recipient);
        const reminderTimes = this.getReminderTimes(userSettings);

        for (const reminder of reminderTimes) {
          const reminderTime = moment(sessionStart).subtract(reminder.minutes, 'minutes');
          
          // Don't schedule if reminder time has passed
          if (reminderTime.isBefore(moment())) {
            continue;
          }

          await this.scheduleReminder(
            sessionData,
            recipient,
            reminderTime.toDate(),
            reminder.type,
            options
          );
        }
      }
    } catch (error) {
      console.error('[SessionReminderService] Error scheduling reminders:', error);
      throw error;
    }
  }

  async scheduleReminder(sessionData, recipientId, scheduledTime, reminderType, options) {
    // Schedule the reminder in your task queue/scheduler
    // This is a placeholder - implement with your preferred scheduling system
    await schedulerService.schedule({
      type: 'SESSION_REMINDER',
      data: {
        sessionData,
        recipientId,
        reminderType,
        options
      },
      scheduledTime,
      handler: async () => {
        await BookingNotificationService.sendBookingNotification(
          sessionData,
          recipientId,
          NotificationTypes.SESSION_STARTING_SOON,
          {
            ...options,
            reminderType,
            scheduledTime
          }
        );
      }
    });
  }

  getReminderTimes(userSettings) {
    if (!userSettings?.timing?.sessionReminders) {
      return this.defaultReminderTimes;
    }

    // Convert user preferences to reminder times
    // This is where you'd implement custom reminder time logic
    return this.defaultReminderTimes;
  }
}

export default new SessionReminderService();