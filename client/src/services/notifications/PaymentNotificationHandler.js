import { logger } from '../../utils/logger';
import UnifiedNotificationService from '../unifiedNotificationService';
import { NotificationTypes, NotificationCategories, NotificationPriorities } from '../../utils/notificationHelpers';
import { PAYMENT_STATES } from '../../constants/paymentConstants';

class PaymentNotificationHandler {
  constructor() {
    this.notificationService = UnifiedNotificationService;
    this.pendingNotifications = new Map();
  }

  async sendPaymentReminder(bookingId, scheduledTime) {
    logger.info('[PaymentNotificationHandler] Sending payment reminder:', {
      bookingId,
      scheduledTime: moment(scheduledTime).format(),
      timestamp: new Date().toISOString()
    });

    try {
      await this.notificationService.sendNotification({
        type: NotificationTypes.PAYMENT_REQUIRED,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.HIGH,
        bookingId,
        channels: ['email', 'in_app'],
        metadata: {
          scheduledTime,
          reminderType: 'scheduled_payment',
          validUntil: moment(scheduledTime).add(24, 'hours').toISOString()
        }
      });
    } catch (error) {
      logger.error('[PaymentNotificationHandler] Error sending payment reminder:', {
        error: error.message,
        bookingId,
        stack: error.stack
      });
      this._queueFailedNotification(bookingId, 'reminder', { scheduledTime });
    }
  }

  async notifyPaymentFailed(bookingId, error, retryAvailable = true) {
    logger.error('[PaymentNotificationHandler] Payment failure notification:', {
      bookingId,
      error: error.message,
      retryAvailable,
      timestamp: new Date().toISOString()
    });

    try {
      await this.notificationService.sendNotification({
        type: NotificationTypes.PAYMENT_FAILED,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.HIGH,
        bookingId,
        channels: ['email', 'in_app', 'sms'],
        metadata: {
          error: error.message,
          code: error.code,
          retryAvailable,
          recoveryInstructions: retryAvailable 
            ? 'Please try again or use a different payment method'
            : 'Please contact support for assistance'
        }
      });
    } catch (notifError) {
      logger.error('[PaymentNotificationHandler] Error sending failure notification:', {
        error: notifError.message,
        bookingId,
        stack: notifError.stack
      });
      this._queueFailedNotification(bookingId, 'failure', { error, retryAvailable });
    }
  }

  async notifyPaymentSuccess(bookingId, paymentDetails) {
    logger.info('[PaymentNotificationHandler] Payment success notification:', {
      bookingId,
      paymentId: paymentDetails?.id,
      timestamp: new Date().toISOString()
    });

    try {
      await this.notificationService.sendNotification({
        type: NotificationTypes.PAYMENT_SUCCESS,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.MEDIUM,
        bookingId,
        channels: ['email', 'in_app'],
        metadata: {
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          paymentMethod: paymentDetails.paymentMethod,
          receiptUrl: paymentDetails.receiptUrl
        }
      });
    } catch (error) {
      logger.error('[PaymentNotificationHandler] Error sending success notification:', {
        error: error.message,
        bookingId,
        stack: error.stack
      });
      this._queueFailedNotification(bookingId, 'success', { paymentDetails });
    }
  }

  async notifyPaymentScheduled(bookingId, scheduledTime, amount, currency) {
    logger.info('[PaymentNotificationHandler] Payment scheduled notification:', {
      bookingId,
      scheduledTime: moment(scheduledTime).format(),
      amount,
      currency,
      timestamp: new Date().toISOString()
    });

    try {
      await this.notificationService.sendNotification({
        type: NotificationTypes.PAYMENT_SCHEDULED,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.MEDIUM,
        bookingId,
        channels: ['email', 'in_app'],
        metadata: {
          scheduledTime,
          amount,
          currency,
          reminderSchedule: [
            moment(scheduledTime).subtract(24, 'hours').toISOString(),
            moment(scheduledTime).subtract(1, 'hour').toISOString()
          ]
        }
      });
    } catch (error) {
      logger.error('[PaymentNotificationHandler] Error sending scheduled notification:', {
        error: error.message,
        bookingId,
        stack: error.stack
      });
      this._queueFailedNotification(bookingId, 'scheduled', { scheduledTime, amount, currency });
    }
  }

  async notifyCoachPaymentStatus(bookingId, status, amount, currency) {
    logger.info('[PaymentNotificationHandler] Coach payment status notification:', {
      bookingId,
      status,
      amount,
      currency,
      timestamp: new Date().toISOString()
    });

    try {
      await this.notificationService.sendNotification({
        type: NotificationTypes.COACH_PAYMENT_STATUS,
        category: NotificationCategories.PAYMENT,
        priority: NotificationPriorities.LOW,
        bookingId,
        channels: ['in_app'],
        metadata: {
          status,
          amount,
          currency,
          estimatedPayout: moment().add(7, 'days').toISOString()
        }
      });
    } catch (error) {
      logger.error('[PaymentNotificationHandler] Error sending coach notification:', {
        error: error.message,
        bookingId,
        stack: error.stack
      });
      this._queueFailedNotification(bookingId, 'coach_status', { status, amount, currency });
    }
  }

  async retryFailedNotifications() {
    for (const [bookingId, notifications] of this.pendingNotifications.entries()) {
      logger.info('[PaymentNotificationHandler] Retrying failed notifications:', {
        bookingId,
        count: notifications.length,
        timestamp: new Date().toISOString()
      });

      for (const notification of notifications) {
        try {
          switch (notification.type) {
            case 'reminder':
              await this.sendPaymentReminder(bookingId, notification.data.scheduledTime);
              break;
            case 'failure':
              await this.notifyPaymentFailed(bookingId, notification.data.error, notification.data.retryAvailable);
              break;
            case 'success':
              await this.notifyPaymentSuccess(bookingId, notification.data.paymentDetails);
              break;
            case 'scheduled':
              await this.notifyPaymentScheduled(
                bookingId, 
                notification.data.scheduledTime,
                notification.data.amount,
                notification.data.currency
              );
              break;
            case 'coach_status':
              await this.notifyCoachPaymentStatus(
                bookingId,
                notification.data.status,
                notification.data.amount,
                notification.data.currency
              );
              break;
          }
          // Remove successful notification from queue
          notifications.splice(notifications.indexOf(notification), 1);
        } catch (error) {
          logger.error('[PaymentNotificationHandler] Retry failed:', {
            error: error.message,
            bookingId,
            notificationType: notification.type,
            stack: error.stack
          });
        }
      }

      if (notifications.length === 0) {
        this.pendingNotifications.delete(bookingId);
      }
    }
  }

  _queueFailedNotification(bookingId, type, data) {
    if (!this.pendingNotifications.has(bookingId)) {
      this.pendingNotifications.set(bookingId, []);
    }

    this.pendingNotifications.get(bookingId).push({
      type,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0
    });

    logger.info('[PaymentNotificationHandler] Queued failed notification:', {
      bookingId,
      type,
      timestamp: new Date().toISOString()
    });
  }
}

export default new PaymentNotificationHandler();