const cron = require('node-cron');
const moment = require('moment');
const Booking = require('../models/Booking');
const NotificationSettings = require('../models/NotificationSettings');
const UnifiedNotificationService = require('./unifiedNotificationService');
const { logger } = require('../utils/logger');
const { shouldSendNotification } = require('../utils/notificationUtils');

class ReminderService {
  constructor(io) {
    this.io = io;
    this.initialize();
  }

  initialize() {
    try {
      // Check for upcoming sessions every minute
      cron.schedule('30 * * * *', () => this.checkUpcomingSessions());
      console.log('[ReminderService] Initialized reminder service with cron schedules');
    } catch (error) {
      logger.error('[ReminderService] Error initializing service:', { error: error.message });
    }
  }

  async checkUpcomingSessions() {
    try {
      const settings = await NotificationSettings.getActive();
      await this.sendReminders(15); // Existing 15-minute session reminders
      await this.sendPaymentReminders(1440); // 24 hours = 1440 minutes
      await this.sendPaymentReminders(30);   // 30 minutes
    } catch (error) {
      logger.error('[ReminderService] Error checking upcoming sessions:', { error: error.message });
    }
  }

  async sendReminders(minutesBefore) {
    const start = moment().add(minutesBefore, 'minutes');
    const end = moment(start).add(1, 'minute');

    try {
      const upcomingSessions = await Booking.find({
        start: { $gte: start.toDate(), $lt: end.toDate() },
        status: 'confirmed',
        reminderSent: { $ne: `${minutesBefore}min` }
      }).populate('user coach sessionType');

      console.log(`[ReminderService] Found ${upcomingSessions.length} sessions starting in ${minutesBefore} minutes`);

      for (const session of upcomingSessions) {
        await this.sendSessionReminder(session, minutesBefore);
      }
    } catch (error) {
      logger.error(`[ReminderService] Error sending ${minutesBefore} minute reminders:`, { error: error.message });
    }
  }

  async sendPaymentReminders(minutesBefore) {
    const now = moment();
    const start = moment().add(minutesBefore, 'minutes').subtract(5, 'minutes'); 
    const end = moment().add(minutesBefore, 'minutes').add(5, 'minutes');       
  
    logger.info('[ReminderService:sendPaymentReminders] Checking for payment reminders.', {
      currentTime: now.toISOString(),
      minutesBefore,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      timestamp: new Date().toISOString()
    });
  
    let sessionsWithPendingPayments;
    try {
      sessionsWithPendingPayments = await Booking.find({
        start: { $gte: start.toDate(), $lte: end.toDate() }, 
        status: 'confirmed',
        isAvailability: false,
        'payment.status': 'pending',
        'reminders': { $not: { $elemMatch: { type: 'payment', identifier: `${minutesBefore}min` } } } 
      }).populate('user coach sessionType');
    } catch (error) {
      logger.error('[ReminderService:sendPaymentReminders] Error fetching bookings for payment reminders.', {
        minutesBefore,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return; // Exit if fetching bookings fails
    }
  
    logger.info(`[ReminderService:sendPaymentReminders] Found ${sessionsWithPendingPayments.length} sessions needing a ${minutesBefore}min payment reminder.`, {
      count: sessionsWithPendingPayments.length,
      minutesBefore,
      sessionIds: sessionsWithPendingPayments.map(s => s._id.toString()),
      timestamp: new Date().toISOString()
    });
  
    if (sessionsWithPendingPayments.length === 0 && (minutesBefore === 1440 || minutesBefore === 30)) { 
      logger.info(`[ReminderService:sendPaymentReminders] No sessions found needing a ${minutesBefore}-minute payment reminder at this check.`, {
        minutesBefore,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        timestamp: new Date().toISOString()
      });
    }
  
    for (const session of sessionsWithPendingPayments) {
      logger.info(`[ReminderService:sendPaymentReminders] Processing ${minutesBefore}min payment reminder for session.`, {
          bookingId: session._id.toString(),
          userId: session.user?._id?.toString(),
          sessionStart: session.start.toISOString(),
          minutesBefore,
          timestamp: new Date().toISOString()
      });
      // Ensure to call the correct sendPaymentReminder that accepts minutesBefore
      await this.sendPaymentReminder(session, minutesBefore); 
    }
  }

  async sendPaymentReminder(session, minutesBefore) { // This should be the only definition
    try {
      if (!session.user || !session.user._id) {
          logger.error('[ReminderService:sendPaymentReminder] Session is missing user or user ID. Cannot send payment reminder.', {
              bookingId: session._id.toString(),
              sessionUserObjectExists: !!session.user,
              minutesBefore,
              timestamp: new Date().toISOString()
          });
          return;
      }
      const recipientId = session.user._id;
      const hoursUntilStart = moment(session.start).diff(moment(), 'hours', true);

      const notificationData = {
        recipient: recipientId.toString(),
        type: 'payment_reminder', 
        category: 'payment',
        priority: 'medium', 
        channels: ['in_app', 'email'], 
        metadata: { 
          bookingId: session._id.toString(),
          hoursUntilStart: hoursUntilStart.toFixed(1),
          reminderType: `${minutesBefore}min`,
          sessionStart: session.start.toISOString(),
          sessionEnd: session.end.toISOString(),
          sessionTypeName: session.sessionType?.name || 'Unknown Session Type'
        }
      };
  
      logger.info('[ReminderService:sendPaymentReminder] Preparing to send notification and update booking.', {
        bookingId: session._id.toString(),
        recipientId: recipientId.toString(),
        minutesBefore,
        notificationType: notificationData.type,
        timestamp: new Date().toISOString()
      });

      await UnifiedNotificationService.sendNotification(notificationData, session);
  
      const updateResult = await Booking.findByIdAndUpdate(session._id, {
        $push: {
          reminders: {
            type: 'payment',
            identifier: `${minutesBefore}min`,
            sentAt: new Date(),
            channels: notificationData.channels, 
            metadata: { 
                hoursUntilStart: hoursUntilStart.toFixed(1),
            }
          }
        }
      }, { new: false }); // Setting new: false is fine as we don't use the returned doc here
  
      if (updateResult) { // findByIdAndUpdate returns the document *before* update by default (if new:false or undefined)
        logger.info('[ReminderService:sendPaymentReminder] Successfully sent payment reminder and initiated booking update.', {
          bookingId: session._id.toString(),
          recipientId: recipientId.toString(),
          minutesBefore,
          updateAcknowledgedOrDocReturned: updateResult != null,
          timestamp: new Date().toISOString()
        });
      } else {
        // This case means the booking was not found by its ID, which would be highly unusual if it was just queried.
        logger.error('[ReminderService:sendPaymentReminder] Booking not found during update attempt after sending reminder.', {
            bookingId: session._id.toString(),
            recipientId: recipientId.toString(),
            minutesBefore,
            timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      logger.error('[ReminderService:sendPaymentReminder] Error sending payment reminder.', {
        bookingId: session._id ? session._id.toString() : 'Unknown Booking ID',
        minutesBefore,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }

  async sendSessionReminder(session, minutesBefore) {
    try {
      // Skip all reminders for availability slots
      if (session.isAvailability) {
        logger.info('[ReminderService] Skipping reminder for availability slot', {
          bookingId: session._id,
          coachId: session.coach._id,
          userId: session.user?._id,
          timestamp: new Date().toISOString()
        });
        return;
      }
  
      // For regular bookings (isAvailability: false)
      if (!session.isAvailability) {
        // Check for self-referential booking
        const isSelfReferential = session.user && session.coach && 
          session.user._id.toString() === session.coach._id.toString();
  
        if (isSelfReferential) {
          logger.warn('[ReminderService] Self-referential booking detected, sending only to client', {
            bookingId: session._id,
            userId: session.user._id,
            coachId: session.coach._id,
            timestamp: new Date().toISOString()
          });
          // Send only to client (user)
          const shouldSendClient = await shouldSendNotification({
            type: 'session_reminder',
            recipient: session.user._id
          }, session.user.notificationPreferences);
  
          if (shouldSendClient) {
            const notificationData = {
              recipient: session.user._id,
              type: 'session_reminder',
              category: 'session',
              priority: 'high',
              channels: ['in_app'],
              metadata: {
                bookingId: session._id,
                reminderType: `${minutesBefore}min`
              }
            };
            await UnifiedNotificationService.sendNotification(notificationData, session);
            logger.info('[ReminderService] Sent session reminder to client (self-referential)', {
              bookingId: session._id,
              recipientId: session.user._id,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // Send to both coach and client if IDs differ
          if (session.coach) {
            const shouldSendCoach = await shouldSendNotification({
              type: 'session_reminder',
              recipient: session.coach._id
            }, session.coach.notificationPreferences);
  
            if (shouldSendCoach) {
              const notificationData = {
                recipient: session.coach._id,
                type: 'session_reminder',
                category: 'session',
                priority: 'high',
                channels: ['in_app'],
                metadata: {
                  bookingId: session._id,
                  reminderType: `${minutesBefore}min`
                }
              };
              await UnifiedNotificationService.sendNotification(notificationData, session);
              logger.info('[ReminderService] Sent session reminder to coach', {
                bookingId: session._id,
                recipientId: session.coach._id,
                timestamp: new Date().toISOString()
              });
            }
          }
  
          if (session.user) {
            const shouldSendClient = await shouldSendNotification({
              type: 'session_reminder',
              recipient: session.user._id
            }, session.user.notificationPreferences);
  
            if (shouldSendClient) {
              const notificationData = {
                recipient: session.user._id,
                type: 'session_reminder',
                category: 'session',
                priority: 'high',
                channels: ['in_app'],
                metadata: {
                  bookingId: session._id,
                  reminderType: `${minutesBefore}min`
                }
              };
              await UnifiedNotificationService.sendNotification(notificationData, session);
              logger.info('[ReminderService] Sent session reminder to client', {
                bookingId: session._id,
                recipientId: session.user._id,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }
  
      // Handle group sessions: send to all attendees including coach
      if (session.attendees && session.attendees.length > 0) {
        for (const attendee of session.attendees) {
          const shouldSendAttendee = await shouldSendNotification({
            type: 'session_reminder',
            recipient: attendee.userId
          }, attendee.notificationPreferences || session.user?.notificationPreferences);
  
          if (shouldSendAttendee) {
            const notificationData = {
              recipient: attendee.userId,
              type: 'session_reminder',
              category: 'session',
              priority: 'high',
              channels: ['in_app'],
              metadata: {
                bookingId: session._id,
                reminderType: `${minutesBefore}min`
              }
            };
            await UnifiedNotificationService.sendNotification(notificationData, session);
            logger.info('[ReminderService] Sent session reminder to attendee', {
              bookingId: session._id,
              recipientId: attendee.userId,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
  
      await Booking.findByIdAndUpdate(session._id, {
        $addToSet: { reminderSent: `${minutesBefore}min` }
      });
  
      logger.info(`[ReminderService] Processed ${minutesBefore} minute reminder for session ${session._id}`);
    } catch (error) {
      logger.error(`[ReminderService] Error sending reminder for session ${session._id}:`, { 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = ReminderService;