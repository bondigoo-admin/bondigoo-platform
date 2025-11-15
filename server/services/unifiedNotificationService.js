const { NotificationTypes, NotificationCategories, NotificationPriorities, validateNotificationData, NotificationMetadata } = require('../utils/notificationHelpers');
const NotificationSettings = require('../models/NotificationSettings');
const emailService = require('./notificationService'); // existing email service
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Program = require('../models/Program');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const ProgramCategory = require('../models/ProgramCategory');
const LiveSession = require('../models/LiveSession');
const { logger } = require('../utils/logger');
const { getSocketService } = require('./socketService');
const { BookingStatusToNotification } = require('../utils/bookingNotificationMapper');
const mongoose = require('mongoose');
const { NotificationTemplateMap } = require('../utils/notificationTemplates');
const path = require('path');
const { i18next } = require('../config/i18n');
const FsBackend = require('i18next-fs-backend');

const CONTEXT_FREE_NOTIFICATION_TYPES = new Set([
  NotificationTypes.USER_ACCOUNT_WARNING,
  NotificationTypes.REPORT_ACTIONED,
  NotificationTypes.USER_CONTENT_HIDDEN,
  NotificationTypes.ACCOUNT_SUSPENDED,
  NotificationTypes.REPORT_DISMISSED,
  NotificationTypes.COACH_VERIFICATION_APPROVED,
  NotificationTypes.COACH_VERIFICATION_REJECTED,
  NotificationTypes.VERIFICATION_EXPIRING_SOON,
  NotificationTypes.WELCOME,
  NotificationTypes.EMAIL_VERIFICATION,
  NotificationTypes.PASSWORD_RESET,
  NotificationTypes.PAYOUT_INITIATED
]);

class UnifiedNotificationService {
  async sendNotification(notificationConfig, bookingData, socketService = getSocketService()) {
    const initialLog = typeof logger !== 'undefined' && typeof console.log === 'function' ? logger : {
      info: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
    initialLog.info('[UnifiedNotificationService] sendNotification called with config:', {
      type: notificationConfig.type,
      recipient: notificationConfig.recipient, // Check this
      recipientType: notificationConfig.recipientType,
      requiresAction: notificationConfig.requiresAction, // Check this
      metadataBookingId: notificationConfig.metadata?.bookingId,
      timestamp: new Date().toISOString()
    });
    if (notificationConfig.type === NotificationTypes.PAYMENT_RECEIVED && notificationConfig.metadata?.bookingId) {
      const recentPaymentNotification = await Notification.findOne({
        type: NotificationTypes.PAYMENT_RECEIVED,
        'metadata.bookingId': notificationConfig.metadata.bookingId,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
      });
    
      if (recentPaymentNotification) {
        console.log('[UnifiedNotificationService] Suppressing duplicate PAYMENT_RECEIVED notification:', {
          bookingId: notificationConfig.metadata.bookingId,
          existingNotificationId: recentPaymentNotification._id,
          timestamp: new Date().toISOString()
        });
        return; // Exit early to prevent duplicate
      }
    }

    const log = typeof logger !== 'undefined' && typeof console.log === 'function' ? logger : {
      info: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
  
    log.info('[UnifiedNotificationService] Sending notification (main log):', {
      type: notificationConfig.type,
      recipient: notificationConfig.recipient,
      channels: notificationConfig.channels,
      bookingDataExists: !!bookingData,
      bookingDataId: bookingData?._id,
      metadataBookingId: notificationConfig.metadata?.bookingId,
      senderId: notificationConfig.sender,
      timestamp: new Date().toISOString()
    });

    try {
      let recipientId = notificationConfig.recipient || (bookingData?.user?._id?.toString());
      if (!recipientId || recipientId === 'fallback-user-id') {
        recipientId = notificationConfig.sender || 
                      bookingData?.user?._id?.toString() || 
                      bookingData?.coach?._id?.toString() || 
                      '66f418d10a19ec0e4bbd377e'; // Extended fallback to include coach
        log.warn('[UnifiedNotificationService] Invalid recipient, using fallback:', {
          originalRecipient: notificationConfig.recipient,
          newRecipient: recipientId,
          bookingUserId: bookingData?.user?._id,
          bookingCoachId: bookingData?.coach?._id,
          timestamp: new Date().toISOString()
        });
      }
  
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(recipientId);
      if (!isValidObjectId) {
        log.error('[UnifiedNotificationService] Recipient is not a valid ObjectId:', {
          recipientId,
          timestamp: new Date().toISOString()
        });
        throw new Error('Recipient must be a valid ObjectId');
      }
  
      notificationConfig.recipient = recipientId;
  const settings = await NotificationSettings.getActive();

  const isContextFree = CONTEXT_FREE_NOTIFICATION_TYPES.has(notificationConfig.type);
  let populatedBooking = bookingData;

  if (!isContextFree) {
    if (!populatedBooking && notificationConfig.metadata?.bookingId) {
      log.warn('[UnifiedNotificationService] Context data missing, attempting to fetch from metadata.bookingId', {
        bookingId: notificationConfig.metadata.bookingId,
        type: notificationConfig.type,
        timestamp: new Date().toISOString()
      });

      // Try to find a Booking first (most common case).
      let entity = await Booking.findById(notificationConfig.metadata.bookingId)
        .populate('coach', 'firstName lastName email')
        .populate('user', 'firstName lastName email')
        .populate('sessionType');

      // If no Booking is found, and it's a payment-related notification,
      // let's check if the ID belongs to a Payment record.
      if (!entity && (notificationConfig.type === NotificationTypes.PAYMENT_RECEIVED || notificationConfig.type === NotificationTypes.PAYMENT_MADE_BY_USER)) {
         log.info('[UnifiedNotificationService] Could not find Booking. Checking for Payment record instead.', { id: notificationConfig.metadata.bookingId });
          const payment = await Payment.findById(notificationConfig.metadata.bookingId)
              .populate({
                  path: 'booking',
                  populate: [
                      { path: 'coach' },
                      { path: 'user' },
                      { path: 'sessionType' }
                  ]
              })
              .populate({
                  path: 'program',
                  populate: { path: 'coach' }
              });

          if (payment) {
              if (payment.booking) {
                  log.info('[UnifiedNotificationService] Found associated Booking via Payment record.', { bookingId: payment.booking._id });
                  entity = payment.booking;
              } else if (payment.program) {
                  log.info('[UnifiedNotificationService] Found associated Program via Payment record.', { programId: payment.program._id });
                  entity = payment.program;
              }
          }
      }
      
      populatedBooking = entity;
    } else if (!populatedBooking && notificationConfig.metadata?.programId) {
      log.info('[UnifiedNotificationService] No booking context, attempting to fetch Program data from metadata.programId', {
          programId: notificationConfig.metadata.programId,
          type: notificationConfig.type,
      });
      populatedBooking = await Program.findById(notificationConfig.metadata.programId)
          .populate('coach', 'firstName lastName email');
    } else if (populatedBooking?.constructor?.modelName === 'Booking' && (!populatedBooking.coach || !populatedBooking.user)) {
      log.info('[UnifiedNotificationService] Populating incomplete booking data:', {
        bookingId: populatedBooking._id,
        hasCoach: !!populatedBooking.coach,
        hasUser: !!populatedBooking.user,
        timestamp: new Date().toISOString()
      });
      populatedBooking = await Booking.findById(populatedBooking._id || notificationConfig.metadata?.bookingId)
        .populate('coach', 'firstName lastName email')
        .populate('user', 'firstName lastName email')
        .populate('sessionType');
    }

    if (populatedBooking?.constructor?.modelName === 'Payment' && (!populatedBooking.recipientDoc || !populatedBooking.payerDoc)) {
        console.log('[UnifiedNotificationService] Populating Payment context object.', { paymentId: populatedBooking._id });
        populatedBooking = await Payment.findById(populatedBooking._id)
            .populate('recipient', 'firstName lastName email') // For coach
            .populate('payer', 'firstName lastName email');   // For client
    }

    if (!populatedBooking || !populatedBooking._id) {
      log.error('[UnifiedNotificationService] Failed to fetch or populate valid context data (booking or program):', {
        bookingId: notificationConfig.metadata?.bookingId,
        programId: notificationConfig.metadata?.programId,
        populatedBookingExists: !!populatedBooking,
        timestamp: new Date().toISOString()
      });
      throw new Error('Context data (booking or program) not found or invalid');
    }
  } else {
      if (!populatedBooking) {
          populatedBooking = {};
      }
  }

  notificationConfig.channels = notificationConfig.channels || ['in_app', 'email'];
  if (notificationConfig.channels.includes('in_app')) {
        await this.createInAppNotification(notificationConfig, populatedBooking, settings, socketService);
      }
      if (notificationConfig.channels.includes('email')) {
        await this.sendEmailNotification(notificationConfig, populatedBooking);
      }
  
      log.info('[UnifiedNotificationService] Notification sent successfully:', {
        type: notificationConfig.type,
        recipient: notificationConfig.recipient,
        bookingId: populatedBooking._id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      log.error('[UnifiedNotificationService] Error sending notification:', {
        error: error.message,
        stack: error.stack,
        config: notificationConfig,
        hasBookingData: !!bookingData,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

async createInAppNotification(config, bookingData, settings, socketService) {
    console.log('[UnifiedNotificationService] Creating in-app notification:', {
      type: config.type,
      recipient: config.recipient,
      recipientType: config.recipientType,
      bookingId: bookingData._id,
      hasBookingData: !!bookingData,
  timestamp: new Date().toISOString()
  });

  const isContextFree = CONTEXT_FREE_NOTIFICATION_TYPES.has(config.type);

  try {
    if (!isContextFree && (!bookingData || !bookingData._id)) {
      throw new Error('Invalid booking data provided');
    }

    const populatedBooking = bookingData;

    if (!isContextFree && !populatedBooking) {
      throw new Error('Could not fetch populated booking data');
    }
  
    logger.debug('[UnifiedNotificationService] Populated booking data:', {
        id: populatedBooking._id,
        hasCoach: !!populatedBooking.coach,
        hasUser: !!populatedBooking.user,
        hasSessionType: !!populatedBooking.sessionType,
        status: populatedBooking.status,
        timestamp: new Date().toISOString()
      });
  
       const content = await this.generateNotificationContent(config, populatedBooking);
  
      const notification = new Notification({
        recipient: config.recipient,
        sender: config.sender,
        type: config.type,
        category: config.category || NotificationMetadata[config.type]?.category,
        priority: config.priority || NotificationMetadata[config.type]?.priority,
        content,
        metadata: {
          bookingId: config.metadata?.bookingId,
          liveSessionId: config.metadata?.liveSessionId || (bookingData.constructor.modelName === 'LiveSession' ? bookingData._id : null),
          programId: config.metadata?.programId,
          lessonId: config.metadata?.lessonId,
          commentId: config.metadata?.commentId,
          sessionId: config.metadata?.sessionId,
          reviewId: config.metadata?.reviewId,
          auditId: config.metadata?.auditId,
          additionalData: {
            auditId: config.metadata?.auditId,
            ...config.metadata,
            ...(populatedBooking.constructor.modelName === 'Booking' && {
                startTime: populatedBooking.start,
                endTime: populatedBooking.end,
                bookingType: populatedBooking.bookingType,
                status: populatedBooking.status,
            }),
            requiresAction: config.requiresAction,
            validActions: content.data?.actions
          }
        },
        channels: config.channels,
        status: 'active',
        delivery: {
          attempts: 0,
          maxAttempts: settings?.delivery?.maxAttempts || 3,
          statuses: []
        }
      });
  
      await notification.save();
  
      console.log('[UnifiedNotificationService] Created notification:', {
        id: notification._id,
        type: notification.type,
        recipient: notification.recipient,
        content: {
          message: notification.content.message,
          paymentStatus: notification.content.data.paymentStatus,
          actions: notification.content.data.actions
        },
        timestamp: new Date().toISOString()
      });
  
      if (socketService) {
        await socketService.emitBookingNotification(notification, [notification.recipient], populatedBooking);
        socketService.emitToUser(notification.recipient.toString(), 'invalidate_notifications');
        console.log('[UnifiedNotificationService] Emitted in-app notification and invalidation trigger via socket:', {
          notificationId: notification._id,
          recipient: notification.recipient,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.warn('[UnifiedNotificationService] Socket service unavailable for in-app notification:', {
          notificationId: notification._id,
          timestamp: new Date().toISOString()
        });
      }
  
      return notification;
    } catch (error) {
      logger.error('[UnifiedNotificationService] Error creating notification:', {
        error: error.message,
        stack: error.stack,
        config: { type: config.type, recipient: config.recipient },
        bookingDataId: bookingData?._id,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

async sendEmailNotification(config, populatedBooking) {
  const jobQueueService = require('../services/jobQueueService');
    console.log('[UnifiedNotificationService] Preparing to send email notification:', {
      type: config.type,
      recipientId: config.recipient,
    });
  
    try {
      const User = mongoose.model('User');
      const notificationMeta = NotificationMetadata[config.type];
      const templateInfo = NotificationTemplateMap[config.type];

      if (!templateInfo) {
        logger.warn(`[UnifiedNotificationService] No email template mapping found for notification type: "${config.type}". Skipping email.`);
        return;
      }

      const recipientUser = await User.findById(config.recipient).select('email firstName lastName preferredLanguage settings.notificationPreferences').lean();
      if (!recipientUser || !recipientUser.email) {
          logger.error('[UnifiedNotificationService] Recipient user not found or has no email.', { recipientId: config.recipient });
          return;
      }
      
      const isMandatory = new Set([
          NotificationTypes.EMAIL_VERIFICATION,
          NotificationTypes.PASSWORD_RESET,
          NotificationTypes.ACCOUNT_SUSPENDED,
      ]).has(config.type);

      if (!isMandatory) {
          const prefs = recipientUser.settings?.notificationPreferences;
          if (prefs?.email === false) {
              console.log(`[UnifiedNotificationService] Email suppressed by master toggle for user ${config.recipient}.`, { type: config.type });
              return;
          }
          if (notificationMeta?.category && prefs?.emailPreferencesByCategory?.[notificationMeta.category] === false) {
              console.log(`[UnifiedNotificationService] Email suppressed by category toggle "${notificationMeta.category}" for user ${config.recipient}.`, { type: config.type });
              return;
          }
      }
      
      const lang = recipientUser.preferredLanguage || 'de';
      await i18next.loadLanguages(lang);
      const t = i18next.getFixedT(lang, 'notifications');

      const isWelcomeEmail = config.type === NotificationTypes.WELCOME;
      const isVerificationEmail = config.type === NotificationTypes.EMAIL_VERIFICATION;
      
      let templateData = {
        lang,
        firstName: recipientUser.firstName,
        button_url: config.metadata?.button_url || `${process.env.FRONTEND_URL}/dashboard`,
        ...config.metadata,
        settings_url: `${process.env.FRONTEND_URL}/settings`,
        help_url: `${process.env.FRONTEND_URL}/help`,
        footer_link_settings: t('welcome.email.footer_link_settings'),
        footer_link_help: t('welcome.email.footer_link_help'),
        footer_text_1: t('welcome.email.footer_text_1'),
      };
      
      if (isWelcomeEmail) {
         Object.assign(templateData, {
          subject: t('welcome.email.subject'),
          headline: t('welcome.email.headline'),
          main_body_text: t('welcome.email.main_body_text', { firstName: recipientUser.firstName }),
          button_text: t('welcome.email.button_text'),
          getting_started_text: t('welcome.email.getting_started_text'),
          usp_title: t('welcome.email.usp_title'),
          usp_1_title: t('welcome.email.usp_1_title'),
          usp_1_text: t('welcome.email.usp_1_text'),
          usp_2_title: t('welcome.email.usp_2_title'),
          usp_2_text: t('welcome.email.usp_2_text'),
          usp_3_title: t('welcome.email.usp_3_title'),
          usp_3_text: t('welcome.email.usp_3_text'),
          testimonial_quote: t('welcome.email.testimonial_quote'),
          testimonial_author: t('welcome.email.testimonial_author'),
        });
      } else {
        const i18nKeyPrefix = `${config.type.toLowerCase()}.email`;
        Object.assign(templateData, {
          subject: t(`${i18nKeyPrefix}.subject`, config.metadata),
          headline: t(`${i18nKeyPrefix}.headline`, config.metadata),
          main_body_text: t(`${i18nKeyPrefix}.main_body_text`, config.metadata),
          button_text: t(`${i18nKeyPrefix}.button_text`, config.metadata),
        });
        if(isVerificationEmail) {
            templateData.button_url = config.metadata.verification_link;
        }
      }

      const jobPayload = {
        notificationType: config.type,
        recipientEmail: recipientUser.email,
        language: lang,
        templateData,
        mailjetTemplateId: templateInfo.id
      };

      await jobQueueService.emailQueue().add(`send-${config.type}`, jobPayload);

      console.log('[UnifiedNotificationService] Email job queued successfully.', {
        type: config.type,
        recipient: config.recipient,
        mailjetTemplateId: templateInfo.id
      });

    } catch (error) {
      logger.error('[UnifiedNotificationService] Failed to queue email notification:', {
        error: error.message,
        stack: error.stack,
        type: config.type,
      });
    }
}

  async getNotificationsForStatusChange(booking, oldStatus, newStatus) {
    logger.debug('[UnifiedNotificationService] Getting notifications for status change:', {
      bookingId: booking._id,
      oldStatus,
      newStatus
    });

    const notificationConfigs = BookingStatusToNotification[newStatus]?.notifications || [];
    
    return notificationConfigs.map(config => ({
      ...config,
      metadata: {
        bookingId: booking._id,
        oldStatus,
        newStatus,
        sessionType: booking.sessionType,
        startTime: booking.start,
        endTime: booking.end
      }
    }));
  }

  async handleBookingStatusChange(booking, oldStatus, newStatus) {
    console.log('[UnifiedNotificationService] Processing booking status change:', {
      bookingId: booking._id,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString()
    });
  
    const notificationConfig = BookingStatusToNotification[newStatus];
    if (!notificationConfig) {
      logger.warn('[UnifiedNotificationService] No notification config found for booking status:', newStatus);
      return;
    }
  
    const notifications = notificationConfig.notifications;
    for (const notification of notifications) {
      const notificationData = {
        type: notification.type || notificationConfig.type,
        recipient: this.getRecipientId(notification.recipient, booking),
        priority: notification.priority,
        category: notification.category,
        channels: notification.channels,
        requiresAction: notification.requiresAction,
        metadata: {
          bookingId: booking._id,
          oldStatus,
          newStatus,
          status: newStatus,
          actionResult: newStatus,
          sessionType: booking.sessionType,
          startTime: booking.start,
          endTime: booking.end
        }
      };
  
      try {
        logger.debug('[UnifiedNotificationService] Validating notification data:', notificationData);
        validateNotificationData(notificationData);
        
        const notificationInstance = new Notification(notificationData);
        await notificationInstance.save();
        
        console.log('[UnifiedNotificationService] Notification created:', {
          id: notificationInstance._id,
          type: notificationData.type,
          recipient: notificationInstance.recipient
        });
        
        await this.sendNotifications(notificationInstance, booking);
      } catch (error) {
        logger.error('[UnifiedNotificationService] Error creating notification:', {
          error: error.message,
          stack: error.stack,
          notificationData
        });
      }
    }
  }

  async sendNotifications(notification, booking) {
    console.log('[UnifiedNotificationService] Starting sendNotifications:', {
      notificationId: notification._id,
      recipient: notification.recipient,
      channels: ['in_app', 'email'],
      timestamp: new Date().toISOString()
    });
    const socketService = getSocketService();
    const notificationSettings = await NotificationSettings.findOne({ userId: notification.recipient });

    if (notificationSettings?.inAppNotificationsEnabled) {
      try {
        await socketService.emitBookingNotification(notification, [notification.recipient], booking);
        console.log('[UnifiedNotificationService] In-app notification sent:', notification._id);
      } catch (error) {
        logger.error('[UnifiedNotificationService] Error sending in-app notification:', {
          error: error.message,
          notificationId: notification._id
        });
      }
    }

    if (notificationSettings?.emailNotificationsEnabled) {
      try {
        await this.sendEmailNotification(notification, booking);
        console.log('[UnifiedNotificationService] Email notification sent:', notification._id);
      } catch (error) {
        logger.error('[UnifiedNotificationService] Error sending email notification:', {
          error: error.message,
          notificationId: notification._id
        });
      }
    }
  }

  async processSocketNotification(data, socket) {
    console.log('[UnifiedNotificationService] Processing socket notification:', {
      type: data.type,
      recipientId: data.recipientId
    });

    const notification = await this.createInAppNotification(data.recipientId, data, null, await NotificationSettings.getActive());
    
    await this.emitSocketNotification(notification, socket.server);

    console.log('[UnifiedNotificationService] Socket notification processed successfully:', {
      notificationId: notification._id,
      recipientId: data.recipientId
    });
  }

  async handleSocketDelivery(notification, booking) {
    const socketService = getSocketService();
    if (socketService) {
      await socketService.emitBookingNotification(
        notification,
        [notification.recipient],
        booking
      );
      
      // Update delivery status
      notification.delivery.statuses.push({
        channel: 'in_app',
        status: 'delivered',
        timestamp: new Date()
      });
      await notification.save();
    }
  }

  async handleEmailDelivery(notification, booking, recipientType) {
    try {
      // Get recipient email
      const recipient = await (recipientType === 'coach' 
        ? User.findById(booking.coach) 
        : User.findById(booking.user));

      if (!recipient?.email) {
        logger.warn('[UnifiedNotificationService] No email for recipient:', {
          recipientId: recipient?._id,
          type: recipientType
        });
        return;
      }

      await emailService.sendBookingEmail(
        notification.type,
        recipient.email,
        {
          notification,
          booking,
          recipient
        }
      );

      // Update delivery status
      notification.delivery.statuses.push({
        channel: 'email',
        status: 'sent',
        timestamp: new Date()
      });
      await notification.save();

    } catch (error) {
      logger.error('[UnifiedNotificationService] Email delivery failed:', {
        error: error.message,
        notificationId: notification._id,
        recipientType
      });
      // Don't throw - email failure shouldn't break the whole notification
    }
  }

  async processBookingNotification(config, booking) {
    console.log('[UnifiedNotificationService] Processing booking notification:', {
      recipientType: config.recipientType,
      bookingId: booking._id,
      type: config.type
    });

    try {
      // Get recipient ID based on type
      const recipientId = config.recipientType === 'coach' ? booking.coach : booking.user;

      // Get user notification preferences
      const settings = await NotificationSettings.getActive();
      
      // Create notification
      const notification = await this.createInAppNotification(
        recipientId,
        config,
        booking,
        settings
      );

      // Handle different delivery channels in parallel
      await Promise.all([
        // Socket delivery
        this.handleSocketDelivery(notification, booking),
        // Email delivery if enabled
        this.handleEmailDelivery(notification, booking, config.recipientType),
        // Other channels as needed
      ]);

      return notification;

    } catch (error) {
      logger.error('[UnifiedNotificationService] Error processing notification:', {
        error: error.message,
        stack: error.stack,
        bookingId: booking._id,
        recipientType: config.recipientType
      });
      throw error;
    }
  }

  async emitSocketNotification(notification, io) {
    console.log('[UnifiedNotificationService] Emitting socket notification:', {
      notificationId: notification._id,
      recipient: notification.recipient
    });

    try {
      // Populate any referenced data needed by the frontend
      const populatedNotification = await Notification.findById(notification._id)
        .populate('sender', 'firstName lastName email profilePicture')
        .populate({
          path: 'metadata.bookingId',
          populate: [
            { path: 'sessionType', select: 'name duration price' },
            { path: 'coach', select: 'firstName lastName email' },
            { path: 'user', select: 'firstName lastName email' }
          ]
        });

      if (!populatedNotification) {
        throw new Error('Could not populate notification data');
      }

      // Format for socket emission
      const socketData = {
        ...populatedNotification.toObject(),
        _id: populatedNotification._id.toString(),
        recipient: populatedNotification.recipient.toString(),
        sender: populatedNotification.sender ? {
          ...populatedNotification.sender.toObject(),
          _id: populatedNotification.sender._id.toString()
        } : null,
        timestamp: new Date().toISOString()
      };

      // Emit to specific recipient's room
      io.to(notification.recipient.toString()).emit('notification', socketData);

      console.log('[UnifiedNotificationService] Socket notification emitted successfully:', {
        notificationId: notification._id,
        recipient: notification.recipient
      });

    } catch (error) {
      console.error('[UnifiedNotificationService] Error emitting socket notification:', {
        error: error.message,
        stack: error.stack,
        notificationId: notification._id
      });
      throw error;
    }
  }

  async triggerReviewPrompts(session, booking) {
    try {
      logger.debug('[UnifiedNotificationService] Starting review prompt triggers', {
        sessionId: session._id,
        coachId: booking.coach._id,
        clientId: booking.user._id,
        timestamp: new Date().toISOString()
      });
      // Send review prompt to coach
      await this.sendNotification({
        recipient: booking.coach._id,
        type: NotificationTypes.REVIEW_PROMPT_COACH,
        category: NotificationCategories.REVIEW,
        priority: NotificationPriorities.MEDIUM,
        channels: ['in_app', 'email'],
        metadata: { sessionId: session._id },
      }, booking);
  
      // Send review prompt to client
      await this.sendNotification({
        recipient: booking.user._id,
        type: NotificationTypes.REVIEW_PROMPT_CLIENT,
        category: NotificationCategories.REVIEW,
        priority: NotificationPriorities.MEDIUM,
        channels: ['in_app', 'email'],
        metadata: { sessionId: session._id },
      }, booking);
  
      console.log('[UnifiedNotificationService] Review prompts triggered successfully', {
        sessionId: session._id,
        coachId: booking.coach._id,
        clientId: booking.user._id,
      });
    } catch (error) {
      logger.error('[UnifiedNotificationService] Error triggering review prompts', {
        sessionId: session._id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

generateNotificationContent(config, bookingData) {
  console.log('[DATA TRACE | Notif Service] generateNotificationContent received config:', JSON.stringify(config, null, 2));
     switch (config.type) {
        case NotificationTypes.USER_ACCOUNT_WARNING:
        return {
            title: 'notifications:user_account_warning.title',
            message: 'notifications:user_account_warning.message',
            data: {
                auditId: config.metadata?.auditId,
                flag_reason_translation: config.metadata?.flag_reason_translation || 'general_guideline_violation',
                warning_count: config.metadata?.warning_count || 1,
                validActions: ['contact_support']
            }
        };
        case NotificationTypes.WELCOME:
        case NotificationTypes.EMAIL_VERIFICATION:
        case NotificationTypes.PASSWORD_RESET:
          return { title: config.type, message: 'This notification is email-only.', data: {} };
        case NotificationTypes.REPORT_ACTIONED:
            return {
                title: 'notifications:report_actioned.title',
                message: 'notifications:report_actioned.message',
                data: { validActions: [] }
            };
        case NotificationTypes.USER_CONTENT_HIDDEN:
            return {
                title: 'notifications:user_content_hidden.title',
                message: 'notifications:user_content_hidden.message',
                data: {
                    auditId: config.metadata?.auditId,
                    flag_reason_translation: config.metadata?.flag_reason_translation || 'our policies',
                    truncated_review_comment: config.metadata?.truncated_review_comment || '[content]',
                    validActions: ['contact_support']
                }
            };
        case NotificationTypes.ACCOUNT_SUSPENDED:
            return {
                title: 'notifications:user_account_suspended.title',
                message: 'notifications:user_account_suspended.message',
                data: {
                    auditId: config.metadata?.auditId,
                    suspension_duration: config.metadata?.suspension_duration || 'a temporary period',
                    suspension_type: config.metadata?.suspension_type || 'limited',
                    suspension_end_date: config.metadata?.suspension_end_date ? new Date(config.metadata.suspension_end_date).toLocaleString() : 'N/A',
                    flag_reason_translation: config.metadata?.flag_reason_translation || 'our policies',
                    validActions: ['contact_support']
                }
            };
       case NotificationTypes.REPORT_DISMISSED:
            return {
                title: 'notifications:report_dismissed.title',
                message: 'notifications:report_dismissed.message',
                data: { validActions: [] }
            };
        case NotificationTypes.COACH_VERIFICATION_APPROVED:
            return {
                title: 'notifications:coach_verification_approved.title',
                message: 'notifications:coach_verification_approved.message',
                data: {
                    validActions: ['view_profile', 'update_availability']
                }
            };
        case NotificationTypes.COACH_VERIFICATION_REJECTED:
            return {
                title: 'notifications:coach_verification_rejected.title',
                message: 'notifications:coach_verification_rejected.message',
                data: {
                    rejection_reason: config.metadata?.rejection_reason || 'Please review our verification requirements.',
                    validActions: ['resubmit_verification', 'contact_support']
                }
            };
        case NotificationTypes.VERIFICATION_EXPIRING_SOON:
            return {
                title: 'notifications:verification_expiring_soon.title',
                message: 'notifications:verification_expiring_soon.message',
                data: {
                    expiry_date: config.metadata?.expiry_date ? new Date(config.metadata.expiry_date).toLocaleDateString() : 'soon',
                    validActions: ['renew_verification']
                }
            };
    }
    const logger = require('../utils/logger').logger;
    const User = mongoose.model('User');

    console.log('[UnifiedNotificationService] Generating notification content:', {
      type: config.type,
      recipientType: config.recipientType,
      bookingId: bookingData._id,
      hasCoach: !!bookingData.coach,
      hasUser: !!bookingData.user,
      metadataAmount: config.metadata?.amount, 
      metadataAmountInCents: config.metadata?.amountInCents,
      metadataCurrency: config.metadata?.currency,
      timestamp: new Date().toISOString()
    });

    try {
      const modelName = bookingData.constructor.modelName;
      const isPaymentContext = modelName === 'Payment';
      const isProgramContext = modelName === 'Program';

      const coachForNotif = isPaymentContext ? bookingData.recipient : bookingData.coach;
      let clientForNotif = isPaymentContext ? bookingData.payer : (bookingData.user || bookingData.client);
      
      if (isProgramContext && !clientForNotif) {
        clientForNotif = { firstName: config.metadata?.clientName || 'A new student' };
      }
      
      const isWebinarType = !isPaymentContext && bookingData.sessionType?._id?.toString() === '66ec54f94a8965b22af33fd9'; // WEBINAR_TYPE_ID_STRING

      if (!coachForNotif || !coachForNotif.firstName) { // Check coach.firstName as proxy for populated coach
          logger.error('[UnifiedNotificationService] Generating content: Missing or incomplete coach data.', { type: config.type, contextId: bookingData._id, coachData: coachForNotif });
          throw new Error('Missing or incomplete coach data for notification.');
      }

      // For non-webinar BOOKING_CONFIRMED to coach, user is required.
      if (config.recipientType === 'coach' && 
          config.type === NotificationTypes.BOOKING_CONFIRMED && 
          !isWebinarType && 
          (!clientForNotif || !clientForNotif.firstName)) {
        logger.error('[UnifiedNotificationService] Generating content: Coach notification for non-webinar booking, but client is missing or incomplete.', { type: config.type, contextId: bookingData._id, sessionTypeId: bookingData.sessionType?._id, userData: clientForNotif });
        throw new Error('Missing client data for coach notification on this booking type.');
      }

     let otherPartyName = 'The other party';
      let clientNameForCoachNotification = 'A participant'; // Default for coach viewing a webinar attendee OR if name is missing

      if (config.recipientType === 'coach') {
           if (isWebinarType) {
              if (config.metadata && (config.metadata.attendeeName || config.metadata.clientName)) {
                  clientNameForCoachNotification = config.metadata.attendeeName || config.metadata.clientName;
              }
              otherPartyName = clientNameForCoachNotification; 
          } else if (clientForNotif && clientForNotif.firstName) { // 1-on-1 scenario, coach is recipient
              clientNameForCoachNotification = `${clientForNotif.firstName} ${clientForNotif.lastName}`;
              otherPartyName = clientNameForCoachNotification;
          } else if (!clientForNotif && !isWebinarType) {
              logger.warn('[UnifiedNotificationService] Coach recipient, not webinar, but client is missing. Using default names.', { type: config.type, contextId: bookingData._id });
          }
      } else if (config.recipientType === 'client') { 
          if (coachForNotif && coachForNotif.firstName) {
              otherPartyName = `${coachForNotif.firstName} ${coachForNotif.lastName}`;
          }
      }


      let amountForDisplay = 'unknown';
      const currency = config.metadata?.currency?.toUpperCase() || 'CHF';

      if (config.metadata?.amount !== undefined && typeof config.metadata.amount === 'number' && !isNaN(config.metadata.amount)) {
          amountForDisplay = config.metadata.amount.toFixed(2);
          logger.debug('[UnifiedNotificationService] amountForDisplay set from metadata.amount', { amountForDisplay, currency });
      } else if (config.metadata?.amountInCents !== undefined && typeof config.metadata.amountInCents === 'number' && !isNaN(config.metadata.amountInCents)) {
          amountForDisplay = (config.metadata.amountInCents / 100).toFixed(2);
          logger.debug('[UnifiedNotificationService] amountForDisplay set from metadata.amountInCents', { amountForDisplay, currency });
      } else {
        logger.debug('[UnifiedNotificationService] No valid amount found in metadata for display. This may be expected for certain notification types or if amount is not applicable.', { metadata: config.metadata, type: config.type });
      }

      let content;
      switch (config.type) {
        case NotificationTypes.BOOKING_CONFIRMED:
          const isCoachRecipient = config.recipientType === 'coach';
          
          // For client (attendee of webinar or 1-on-1)
          if (!isCoachRecipient) {
            content = {
              title: isWebinarType ? NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT : NotificationTypes.BOOKING_CONFIRMED,
              message: isWebinarType 
                ? `Your registration for "${bookingData.title || bookingData.sessionType?.name}" with ${otherPartyName} is confirmed!`
                : `Your session with ${otherPartyName} is confirmed!`,
              data: {
                bookingId: bookingData._id,
                bookingTime: bookingData.start,
                duration: (new Date(bookingData.end) - new Date(bookingData.start)) / (1000 * 60),
                bookingType: bookingData.bookingType,
                requiresAction: config.requiresAction || false,
                validActions: ['view', 'reschedule', 'cancel'], // Standard client actions
                status: bookingData.status,
                actionResult: config.metadata?.actionResult || bookingData.status,
                name: otherPartyName, // Coach's name
                date: new Date(bookingData.start).toLocaleDateString(),
                time: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
                sessionType: bookingData.sessionType?.name || 'Session',
                webinarTitle: isWebinarType ? (bookingData.title || bookingData.sessionType?.name) : undefined,
                webinarLink: isWebinarType ? (bookingData.webinarLink || bookingData.sessionLink?.url) : undefined,
                paymentStatus: bookingData.payment?.status || config.metadata?.paymentStatus || 'completed'
              }
            };
        if ((bookingData.payment?.status === 'pending' || bookingData.payment?.status === 'payment_required') || 
              config.metadata?.paymentStatus === 'pending'
            ) {
              content.data.paymentStatus = bookingData.payment?.status && (bookingData.payment.status === 'pending' || bookingData.payment.status === 'payment_required') 
                                            ? bookingData.payment.status 
                                            : 'pending';
              content.data.actions = [{
                type: 'pay_now', label: 'Pay Now', endpoint: `/bookings/${bookingData._id}/pay`, data: { bookingId: bookingData._id }
              }, ...(content.data.validActions || [])];
              content.message = isWebinarType 
                ? `Your registration for "${bookingData.title || bookingData.sessionType?.name}" is confirmed! Please complete payment.`
                : `Your session with ${otherPartyName} is confirmed! Please complete the payment.`;
            }
          } else { // For Coach
            if (isWebinarType) {
              content = {
                title: NotificationTypes.NEW_WEBINAR_ATTENDEE_COACH || 'new_webinar_attendee_coach', 
                message: `${clientNameForCoachNotification} has registered for your webinar: "${bookingData.title || bookingData.sessionType?.name}".`,
                data: {
                  bookingId: bookingData._id, 
                  attendeeName: clientNameForCoachNotification,
                  webinarTitle: bookingData.title || bookingData.sessionType?.name,
                  date: new Date(bookingData.start).toLocaleDateString(),
                  time: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
                  currentAttendeeCount: bookingData.attendees?.length || 1, 
                  maxAttendees: bookingData.maxAttendees,
                  status: bookingData.status,
                  validActions: ['view_webinar_details']
                }
              };
            } else { // 1-on-1 booking confirmation for coach
              content = {
                title: NotificationTypes.BOOKING_CONFIRMED,
                message: `Your session with ${otherPartyName} is confirmed.`, // otherPartyName is client here
                data: {
                  bookingId: bookingData._id,
                  bookingTime: bookingData.start,
                  duration: (new Date(bookingData.end) - new Date(bookingData.start)) / (1000 * 60),
                  bookingType: bookingData.bookingType,
                  requiresAction: config.requiresAction || false,
                  validActions: ['view'],
                  status: bookingData.status,
                  actionResult: config.metadata?.actionResult || bookingData.status,
                  name: otherPartyName, // Client's name
                  date: new Date(bookingData.start).toLocaleDateString(),
                  time: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
                  sessionType: bookingData.sessionType?.name || 'Session',
                  // No paymentStatus for coach in 1-on-1 confirmation, they see payment_made_by_user
                }
              };
            }
          }
          break;

          case NotificationTypes.COACH_BOOKING_REQUEST:
          content = {
            title: NotificationTypes.COACH_BOOKING_REQUEST,
            message: NotificationTypes.COACH_BOOKING_REQUEST,
            data: {
              bookingId: bookingData._id,
              coachName: `${bookingData.coach.firstName} ${bookingData.coach.lastName}`,
              sessionTitle: bookingData.title,
              sessionType: bookingData.sessionType?.name || 'Session',
              date: new Date(bookingData.start).toLocaleDateString(),
              time: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              status: bookingData.status,
              requiresAction: true,
              validActions: ['accept_by_client', 'decline_by_client']
            }
          };
          break;

        case NotificationTypes.BOOKING_CONFIRMED_BY_CLIENT:
          content = {
            title: NotificationTypes.BOOKING_CONFIRMED_BY_CLIENT,
            message: NotificationTypes.BOOKING_CONFIRMED_BY_CLIENT,
            data: {
              bookingId: bookingData._id,
              clientName: `${bookingData.user.firstName} ${bookingData.user.lastName}`,
              sessionTitle: bookingData.title,
              sessionType: bookingData.sessionType?.name || 'Session',
              date: new Date(bookingData.start).toLocaleDateString(),
              time: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              status: 'confirmed',
              requiresAction: false,
              validActions: ['view']
            }
          };
          break;

        case NotificationTypes.BOOKING_DECLINED_BY_CLIENT:
          content = {
            title: NotificationTypes.BOOKING_DECLINED_BY_CLIENT,
            message: NotificationTypes.BOOKING_DECLINED_BY_CLIENT,
            data: {
              bookingId: bookingData._id,
              clientName: `${bookingData.user.firstName} ${bookingData.user.lastName}`,
              sessionTitle: bookingData.title,
              declineReason: config.metadata?.declineReason || '-',
              status: 'declined',
              requiresAction: false,
              validActions: ['view']
            }
          };
          break;

          case NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT:
          content = {
            title: NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT,
            message: NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT, // Frontend will use this as i18n key
             data: {
              bookingId: bookingData._id,
              requiresAction: config.requiresAction || false,
              validActions: ['view_webinar_details', 'add_to_calendar'],
              status: bookingData.status,
              coachName: config.metadata?.coachName || `${bookingData.coach.firstName || ''} ${bookingData.coach.lastName || ''}`.trim(), 
              date: config.metadata?.date || new Date(bookingData.start).toLocaleDateString(),
              time: config.metadata?.time || new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              webinarTitle: config.metadata?.webinarTitle || bookingData.title || bookingData.sessionType?.name, // Prioritize metadata
              webinarLink: config.metadata?.webinarLink || bookingData.webinarLink || bookingData.sessionLink?.url,
              paymentStatus: config.metadata?.paymentStatus || bookingData.payment?.status || 'completed',
              amount: config.metadata?.amount, // Already in your structure, ensure it's passed
              currency: config.metadata?.currency // Already in your structure, ensure it's passed
            }
          };
          if ((bookingData.payment?.status === 'pending' || bookingData.payment?.status === 'payment_required') || 
                config.metadata?.paymentStatus === 'pending'
              ) {
                content.data.paymentStatus = bookingData.payment?.status && (bookingData.payment.status === 'pending' || bookingData.payment.status === 'payment_required') 
                                              ? bookingData.payment.status 
                                              : 'pending';
                content.data.actions = [{
                  type: 'pay_now', label: 'Pay Now', endpoint: `/bookings/${bookingData._id}/pay`, data: { bookingId: bookingData._id }
                }, ...(content.data.validActions || [])];
                // The message key itself implies whether payment is pending or not on the frontend
          }
          break;

          case NotificationTypes.BOOKING_CANCELLED_BY_YOU:
      content = {
        title: NotificationTypes.BOOKING_CANCELLED_BY_YOU, // Use as i18n key
        message: NotificationTypes.BOOKING_CANCELLED_BY_YOU, // Use as i18n key
        data: {
          bookingId: bookingData._id.toString(),
          sessionTitle: config.metadata?.sessionTitle || bookingData.title || 'the session',
          coachName: config.metadata?.coachName || `${bookingData.coach?.user?.firstName || 'The'} ${bookingData.coach?.user?.lastName || 'Coach'}`,
          sessionDate: config.metadata?.sessionDate ? new Date(config.metadata.sessionDate).toLocaleDateString() : new Date(bookingData.start).toLocaleDateString(),
          sessionTime: config.metadata?.sessionDate ? new Date(config.metadata.sessionDate).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
          refundAmount: config.metadata?.refundAmount,
          refundCurrency: config.metadata?.refundCurrency?.toUpperCase(),
          isRefundDue: config.metadata?.isRefundDue,
          cancellationReason: config.metadata?.cancellationReason || "-",
          status: 'cancelled_by_client',
          validActions: ['view_receipt'] 
        }
      };
      // The frontend will use isRefundDue, refundAmount, and refundCurrency to construct the dynamic part of the message.
      break;

    case NotificationTypes.CLIENT_CANCELLED_BOOKING:
      content = {
        title: NotificationTypes.CLIENT_CANCELLED_BOOKING, // Use as i18n key
        message: NotificationTypes.CLIENT_CANCELLED_BOOKING, // Use as i18n key
        data: {
          bookingId: bookingData._id.toString(),
          clientName: config.metadata?.clientName || `${bookingData.user?.firstName || 'A'} ${bookingData.user?.lastName || 'Client'}`,
          sessionTitle: config.metadata?.sessionTitle || bookingData.title || 'the session',
          sessionDate: config.metadata?.sessionDate ? new Date(config.metadata.sessionDate).toLocaleDateString() : new Date(bookingData.start).toLocaleDateString(),
          sessionTime: config.metadata?.sessionDate ? new Date(config.metadata.sessionDate).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
          cancellationReason: config.metadata?.cancellationReason || "-",
          availabilityRestored: config.metadata?.availabilityRestored,
          isWebinar: config.metadata?.isWebinar,
          status: 'cancelled_by_client',
          validActions: ['view_booking_details'] 
        }
      };
      // The frontend will use availabilityRestored to construct the dynamic part of the message.
      break;

case NotificationTypes.WEBINAR_REGISTRATION_CANCELLED_BY_YOU:
          content = {
            title: NotificationTypes.WEBINAR_REGISTRATION_CANCELLED_BY_YOU, // Used as i18n key by frontend
            message: NotificationTypes.WEBINAR_REGISTRATION_CANCELLED_BY_YOU, // Used as i18n key by frontend
            data: {
              bookingId: bookingData._id.toString(),
              webinarTitle: config.metadata?.webinarTitle || bookingData.title || 'the webinar',
              coachName: config.metadata?.coachName || `${bookingData.coach?.firstName || 'The'} ${bookingData.coach?.lastName || 'Coach'}`,
              webinarDate: config.metadata?.webinarDate ? new Date(config.metadata.webinarDate).toLocaleDateString() : (bookingData.start ? new Date(bookingData.start).toLocaleDateString() : 'N/A'),
              webinarTime: config.metadata?.webinarDate ? new Date(config.metadata.webinarDate).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : (bookingData.start ? new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'N/A'),
              refundAmount: config.metadata?.refundAmount, // This should be populated by the controller
              refundCurrency: config.metadata?.refundCurrency?.toUpperCase(), // This should be populated
              isRefundDue: config.metadata?.isRefundDue, // This should be populated
              cancellationReason: config.metadata?.cancellationReason || null, // Send null if no reason
              status: 'cancelled', // Reflects the attendee's registration status for THIS webinar
              validActions: ['view_receipt'] // Example action
            }
          };
          break;

        case NotificationTypes.WEBINAR_ATTENDEE_CANCELLED:
          content = {
            title: NotificationTypes.WEBINAR_ATTENDEE_CANCELLED, // Used as i18n key
            message: NotificationTypes.WEBINAR_ATTENDEE_CANCELLED, // Used as i18n key
            data: {
              bookingId: bookingData._id.toString(),
              attendeeName: config.metadata?.attendeeName || 'A participant',
              attendeeId: config.metadata?.attendeeId,
              webinarTitle: config.metadata?.webinarTitle || bookingData.title || 'the webinar',
              webinarDate: config.metadata?.webinarDate ? new Date(config.metadata.webinarDate).toLocaleDateString() : (bookingData.start ? new Date(bookingData.start).toLocaleDateString() : 'N/A'),
              webinarTime: config.metadata?.webinarDate ? new Date(config.metadata.webinarDate).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : (bookingData.start ? new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'N/A'),
              cancellationReason: config.metadata?.cancellationReason || null, // Send null if no reason
              remainingSpots: config.metadata?.remainingSpots,
              status: bookingData.status, // Main webinar booking status (likely unchanged by one attendee cancelling)
              validActions: ['view_webinar_details', 'view_attendee_list']
            }
          };
          break;

        case NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH:
          content = {
            title: NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH,
            message: NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH, // Frontend will use this as i18n key
           data: {
              bookingId: bookingData._id, 
              attendeeName: config.metadata?.attendeeName || clientNameForCoachNotification, // Prioritize metadata
              webinarTitle: config.metadata?.webinarTitle || bookingData.title || bookingData.sessionType?.name, // Prioritize metadata
              date: config.metadata?.date || new Date(bookingData.start).toLocaleDateString(),
              time: config.metadata?.time || new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              currentAttendeeCount: config.metadata?.currentAttendeeCount || bookingData.attendees?.length || 1, 
              maxAttendees: bookingData.maxAttendees,
              status: bookingData.status,
              validActions: ['view_webinar_details', 'view_attendee_list']
            }
          };
          break;

         case NotificationTypes.PAYMENT_RECEIVED:
          const isProgramPurchase = !!bookingData.program;
          console.log('[UnifiedNotificationService] Generating PAYMENT_RECEIVED content', {
            context: isProgramPurchase ? 'Program' : 'Booking',
            paymentId: bookingData._id,
            amountForDisplay,
          });

          if (isProgramPurchase) {
            content = {
              title: 'program_purchase_confirmed',
              message: 'program_purchase_confirmed',
              data: {
                programId: bookingData.program._id,
                paymentId: bookingData._id,
                amount: amountForDisplay,
                currency,
                paymentStatus: 'completed',
                validActions: ['view_program'],
                status: 'completed'
              }
            };
          } else {
            content = {
              title: 'payment_received',
              message: 'payment_received',
              data: {
                bookingId: bookingData.booking._id,
                paymentId: bookingData._id,
                amount: amountForDisplay,
                currency,
                paymentStatus: 'completed',
                validActions: ['view_booking'],
                status: 'confirmed'
              }
            };
          }
          break;

        case NotificationTypes.PAYMENT_REMINDER:
          console.log('[UnifiedNotificationService] Generating PAYMENT_REMINDER content', {
            bookingId: bookingData._id,
            recipientType: config.recipientType
          });
          content = {
            title: 'Payment Reminder',
            message: `Reminder: Your session with ${bookingData.coach.firstName} ${bookingData.coach.lastName} is in 24 hours. Please complete the payment to confirm your spot.`,
            data: {
              bookingId: bookingData._id,
              sessionStart: bookingData.start,
              actions: [{
                type: 'pay_now',
                label: 'Pay Now',
                endpoint: `/bookings/${bookingData._id}/pay`,
                data: { bookingId: bookingData._id }
              }],
              sessionType: bookingData.sessionType?.name || 'Session',
              paymentStatus: 'pending'
            }
          };
          break;

         case NotificationTypes.PAYMENT_MADE_BY_USER:
          const isProgramSale = config.metadata?.additionalData?.type === 'program_purchase';
          if (isProgramSale) {
            content = {
              title: 'program_sale_coach',
              message: 'program_sale_coach',
              data: {
                bookingId: bookingData._id,
                clientName: config.metadata?.clientName || 'A user',
                programTitle: config.metadata?.sessionType || 'your program',
                amount: amountForDisplay,
                currency,
                paymentStatus: 'completed',
                validActions: ['view_program_details'],
                status: 'completed'
              }
            };
          } else {
             content = {
                title: 'payment_made_by_user',
                message: 'payment_made_by_user',
                 data: {
                bookingId: bookingData._id,
                clientName: clientNameForCoachNotification,
                amount: amountForDisplay,
                currency,
                paymentStatus: config.metadata?.paymentStatus || bookingData.payment?.status || 'completed',
                validActions: config.metadata?.type === 'program_purchase' ? ['view_program'] : ['view_booking'],
                status: config.metadata?.paymentStatus === 'completed' ? 'confirmed' : (bookingData.status || 'pending'),
                date: config.metadata?.date || (bookingData.start ? new Date(bookingData.start).toLocaleDateString() : new Date().toLocaleDateString())
              }
            };
          }
          break;

        case NotificationTypes.PROGRAM_PURCHASE_CONFIRMED:
          console.log('[UnifiedNotificationService] Generating PROGRAM_PURCHASE_CONFIRMED content from Payment context.');
          content = {
            title: 'program_purchase_confirmed',
            message: 'program_purchase_confirmed',
            data: {
              bookingId: bookingData.program._id,
              programTitle: bookingData.program.title,
              coachName: `${coachForNotif.firstName} ${coachForNotif.lastName}`,
              amount: amountForDisplay,
              currency,
              paymentStatus: 'completed',
              validActions: ['view_program'],
              status: 'completed'
            }
          };
          break;

        case NotificationTypes.PROGRAM_SALE_COACH:
          console.log('[UnifiedNotificationService] Generating PROGRAM_SALE_COACH content from Payment context.');
          content = {
            title: 'program_sale_coach',
            message: 'program_sale_coach',
            data: {
              bookingId: bookingData.program._id,
              clientName: `${clientForNotif.firstName} ${clientForNotif.lastName}`,
              programTitle: bookingData.program.title,
              amount: amountForDisplay,
              currency,
              paymentStatus: 'completed',
              validActions: ['view_program_details'],
              status: 'completed'
            }
          };
          break;

       

        case NotificationTypes.OVERTIME_PAYMENT_CAPTURED:
          content = {
            title: 'Overtime Payment Processed', 
            message: `overtime_payment_captured_message`, 
            data: {
                bookingId: bookingData._id,
                sessionId: config.metadata?.sessionId,
                amount: amountForDisplay, 
                currency: currency,
                paymentStatus: 'captured',
                validActions: ['view_booking'] 
            }
          };
          break;
        
        case NotificationTypes.OVERTIME_PAYMENT_RELEASED:
          content = {
            title: 'Overtime Authorization Released',
            message: 'overtime_payment_released_message',
            data: {
                bookingId: bookingData._id,
                sessionId: config.metadata?.sessionId,
                paymentStatus: 'released',
                validActions: ['view_booking']
            }
          };
          break;

        case NotificationTypes.OVERTIME_PAYMENT_COLLECTED:
          content = {
            title: 'Overtime Payment Collected',
            message: `overtime_payment_collected_message`,
            data: {
                bookingId: bookingData._id,
                sessionId: config.metadata?.sessionId,
                amount: amountForDisplay, 
                currency: currency,
                clientName: config.metadata?.clientName || `${bookingData.user.firstName} ${bookingData.user.lastName}`,
                paymentStatus: 'collected',
                validActions: ['view_booking'] 
            }
          };
          break;
        
        case NotificationTypes.OVERTIME_PAYMENT_CAPTURE_FAILED:
            content = {
              title: 'Overtime Capture Failed',
              message: 'overtime_payment_capture_failed_message',
              data: {
                bookingId: bookingData._id,
                sessionId: config.metadata?.sessionId,
                paymentIntentId: config.metadata?.paymentIntentId,
                error: config.metadata?.error || 'Unknown capture error',
                paymentStatus: 'capture_failed',
                validActions: ['contact_support', 'view_booking'] 
              }
            };
            break;

            case NotificationTypes.SESSION_ENDED:
              const userNameForCoachContext = config.metadata?.additionalData?.clientName || bookingData.user.firstName;
              const coachNameForClientContext = config.metadata?.additionalData?.coachName || bookingData.coach.firstName;
              const reasonText = config.metadata?.additionalData?.reason || 'Session concluded.';
              const captureStatusText = config.metadata?.additionalData?.finalCaptureStatus || 'N/A';
              
              let paymentDetailsDisplay = `Payment Status: ${captureStatusText}`; // Default display
              // Use amountForDisplay which is already calculated at the top of the function
              // based on config.metadata.amount or config.metadata.additionalData.amount
              if (amountForDisplay !== 'unknown' && currency && (captureStatusText === 'captured' || captureStatusText === 'partially_captured')) {
                paymentDetailsDisplay = `Amount Captured: ${amountForDisplay} ${currency}`;
              } else if (captureStatusText === 'released') {
                paymentDetailsDisplay = 'Payment Authorized & Released (No Charge)';
              } else if (captureStatusText === 'no_capture_needed') {
                paymentDetailsDisplay = 'No Overtime Payment Processed This Time';
              } else if (captureStatusText === 'capture_failed') {
                paymentDetailsDisplay = `Payment Capture Failed (Status: ${captureStatusText})`;
              }
    
    
              content = {
                title: 'notifications:session_ended_title', 
                message: config.recipientType === 'coach' || config.recipient.equals(bookingData.coach._id)
                  ? 'notifications:session_ended_message_coach' 
                  : 'notifications:session_ended_message_client',
                data: {
                  bookingId: bookingData._id.toString(),
                  sessionId: config.metadata?.sessionId || config.metadata?.additionalData?.sessionId,
                  userName: userNameForCoachContext, 
                  coachName: coachNameForClientContext, 
                  reason: reasonText,
                  captureStatus: paymentDetailsDisplay, // Use the constructed display text
                  // Include raw amount and currency if they exist in metadata for frontend flexibility
                  amount: config.metadata?.additionalData?.amount, 
                  currency: config.metadata?.additionalData?.currency?.toUpperCase(),
                  startTime: bookingData.start,
                  endTime: bookingData.end,
                  sessionType: bookingData.sessionType?.name || 'Session',
                }
              };
              console.log(`[UnifiedNotificationService] Generated SESSION_ENDED content`, { type: config.type, recipient: config.recipient, contentData: content.data });
              break;

        case NotificationTypes.REVIEW_PROMPT_COACH:
        case NotificationTypes.REVIEW_PROMPT_CLIENT:
          content = {
            title: config.type, 
            message: config.type, 
            data: {
              bookingId: bookingData._id,
              sessionId: config.metadata?.sessionId || bookingData._id, 
              reviewUrl: `/sessions/${config.metadata?.sessionId || bookingData._id}/review`,
              name: otherPartyName,
              sessionType: bookingData.sessionType?.name || 'Session',
              date: new Date(bookingData.start).toLocaleDateString(),
              time: new Date(bookingData.start).toLocaleTimeString()
            }
          };
          break;

          case NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_CLIENT:
          content = {
            title: NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_CLIENT,
            message: NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_CLIENT,
            data: {
              bookingId: bookingData._id,
              name: otherPartyName, // Coach's name
              sessionType: bookingData.sessionType?.name || 'Session',
              oldDate: config.metadata?.oldStartTime ? new Date(config.metadata.oldStartTime).toLocaleDateString() : 'N/A',
              oldTime: config.metadata?.oldStartTime ? new Date(config.metadata.oldStartTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'N/A',
              newDate: new Date(bookingData.start).toLocaleDateString(),
              newTime: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              status: bookingData.status,
              validActions: ['view', 'cancel']
            }
          };
          break;

        case NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_COACH:
          content = {
            title: NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_COACH,
            message: NotificationTypes.RESCHEDULE_CONFIRMED_AUTO_COACH,
            data: {
              bookingId: bookingData._id,
              name: otherPartyName, // Client's name
              sessionType: bookingData.sessionType?.name || 'Session',
              oldDate: config.metadata?.oldStartTime ? new Date(config.metadata.oldStartTime).toLocaleDateString() : 'N/A',
              oldTime: config.metadata?.oldStartTime ? new Date(config.metadata.oldStartTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'N/A',
              newDate: new Date(bookingData.start).toLocaleDateString(),
              newTime: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              status: bookingData.status,
              validActions: ['view']
            }
          };
          break;

      case NotificationTypes.RESCHEDULE_REQUEST_SENT_TO_COACH:
          content = {
            title: NotificationTypes.RESCHEDULE_REQUEST_SENT_TO_COACH,
            message: NotificationTypes.RESCHEDULE_REQUEST_SENT_TO_COACH,
            data: {
              bookingId: bookingData._id,
              coachName: config.metadata?.coachName || `${bookingData.coach?.firstName || ''} ${bookingData.coach?.lastName || ''}`.trim(),
              sessionTitle: config.metadata?.sessionTitle || bookingData.title || bookingData.sessionType?.name || 'Session',
              originalDate: config.metadata?.originalDate || new Date(bookingData.start).toLocaleDateString(),
              originalTime: config.metadata?.originalTime || new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              status: bookingData.status,
              requiresAction: false,
              validActions: ['view_booking_details']
            }
          };
          break;

          case NotificationTypes.CLIENT_REQUESTED_RESCHEDULE:
          const proposedSlotsForCoach = config.metadata?.proposedSlots?.map(slot => 
            `${new Date(slot.start).toLocaleDateString()} ${new Date(slot.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - ${new Date(slot.end).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
          ) || ['N/A'];
          const notificationMetaData = NotificationMetadata[NotificationTypes.CLIENT_REQUESTED_RESCHEDULE] || {};

          content = {
            title: NotificationTypes.CLIENT_REQUESTED_RESCHEDULE,
            message: NotificationTypes.CLIENT_REQUESTED_RESCHEDULE,
            data: {
              bookingId: bookingData._id,
              clientName: config.metadata?.clientName || `${bookingData.user?.firstName || 'A'} ${bookingData.user?.lastName || 'Client'}`,
              sessionType: config.metadata?.sessionType || bookingData.sessionType?.name || 'Session',
              sessionTitle: config.metadata?.sessionTitle || bookingData.title || 'Session',
              originalDate: config.metadata?.originalDate || new Date(bookingData.start).toLocaleDateString(),
              originalTime: config.metadata?.originalTime || new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              proposedSlots: proposedSlotsForCoach.join('; '),
              clientMessage: config.metadata?.clientMessage || '',
              status: bookingData.status, // Should be 'pending_reschedule_client_request'
              requiresAction: notificationMetaData.requiresAction !== undefined ? notificationMetaData.requiresAction : true,
              validActions: notificationMetaData.validActions || ['approve_reschedule_request', 'decline_reschedule_request', 'counter_propose_reschedule_request', 'view_booking_details']
            }
          };
          break;

          case NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_CLIENT_CONFIRM:
        content = {
          title: NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_CLIENT_CONFIRM, // For i18n key
          message: NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_CLIENT_CONFIRM, // For i18n key
          data: {
            bookingId: bookingData._id.toString(),
            sessionTitle: config.metadata?.sessionTitle || bookingData.title,
            coachName: config.metadata?.coachName || `${bookingData.coach.firstName} ${bookingData.coach.lastName}`,
            newStartTime: config.metadata?.newStartTime || bookingData.start,
            newEndTime: config.metadata?.newEndTime || bookingData.end,
            originalStartTime: config.metadata?.originalStartTime,
            originalEndTime: config.metadata?.originalEndTime,
            clientMessage: config.metadata?.clientMessage || null,
            status: bookingData.status,
            validActions: NotificationMetadata[config.type]?.validActions || ['view_booking_details']
          }
        };
        break;

      case NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_COACH_NOTIF:
        content = {
          title: NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_COACH_NOTIF, // For i18n key
          message: NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_COACH_NOTIF, // For i18n key
          data: {
            bookingId: bookingData._id.toString(),
            sessionTitle: config.metadata?.sessionTitle || bookingData.title,
            clientName: config.metadata?.clientName || `${bookingData.user.firstName} ${bookingData.user.lastName}`,
            newStartTime: config.metadata?.newStartTime || bookingData.start,
            newEndTime: config.metadata?.newEndTime || bookingData.end,
            originalStartTime: config.metadata?.originalStartTime,
            originalEndTime: config.metadata?.originalEndTime,
            clientMessage: config.metadata?.clientMessage || null,
            status: bookingData.status,
            validActions: NotificationMetadata[config.type]?.validActions || ['view_booking_details']
          }
        };
        break;

      case NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_CLIENT_CONFIRM:
        content = {
          title: NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_CLIENT_CONFIRM, // For i18n key
          message: NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_CLIENT_CONFIRM, // For i18n key
          data: {
            bookingId: bookingData._id.toString(),
            sessionTitle: config.metadata?.sessionTitle || bookingData.title,
            coachName: config.metadata?.coachName || `${bookingData.coach.firstName} ${bookingData.coach.lastName}`,
            originalStartTime: config.metadata?.originalStartTime || bookingData.start, // Booking time is unchanged
            originalEndTime: config.metadata?.originalEndTime || bookingData.end,
            clientMessage: config.metadata?.clientMessage || null,
            status: bookingData.status, // Should be 'confirmed' (original booking stands)
            validActions: NotificationMetadata[config.type]?.validActions || ['view_booking_details', 'contact_coach']
          }
        };
        break;

      case NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_COACH_NOTIF:
        content = {
          title: NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_COACH_NOTIF, // For i18n key
          message: NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_COACH_NOTIF, // For i18n key
          data: {
            bookingId: bookingData._id.toString(),
            sessionTitle: config.metadata?.sessionTitle || bookingData.title,
            clientName: config.metadata?.clientName || `${bookingData.user.firstName} ${bookingData.user.lastName}`,
            originalStartTime: config.metadata?.originalStartTime || bookingData.start, // Booking time is unchanged
            originalEndTime: config.metadata?.originalEndTime || bookingData.end,
            clientMessage: config.metadata?.clientMessage || null,
            status: bookingData.status, // Should be 'confirmed'
            validActions: NotificationMetadata[config.type]?.validActions || ['view_booking_details']
          }
        };
        break;
         case NotificationTypes.COACH_PROPOSED_NEW_RESCHEDULE_TIME:
        // This case should already exist based on previous logs, but ensure it's comprehensive
        const coachProposedSlotsForClient = config.metadata?.proposedSlots?.map(slot => 
            `${new Date(slot.start).toLocaleDateString()} ${new Date(slot.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - ${new Date(slot.end).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
          ) || ['N/A'];
        content = {
            title: NotificationTypes.COACH_PROPOSED_NEW_RESCHEDULE_TIME,
            message: NotificationTypes.COACH_PROPOSED_NEW_RESCHEDULE_TIME, // Frontend will use this as i18n key
            data: {
                bookingId: bookingData._id.toString(),
                coachName: config.metadata?.coachName || `${bookingData.coach.firstName} ${bookingData.coach.lastName}`,
                sessionTitle: config.metadata?.sessionTitle || bookingData.title,
                originalStartTime: config.metadata?.originalStartTime || bookingData.start,
                originalEndTime: config.metadata?.originalEndTime || bookingData.end,
                proposedSlots: coachProposedSlotsForClient.join('; '), // Pass as string for simple display or keep array if frontend handles list
                coachReason: config.metadata?.coachReason || null,
                status: bookingData.status, // Should be 'pending_reschedule_coach_request'
                requiresAction: NotificationMetadata[config.type]?.requiresAction !== undefined ? NotificationMetadata[config.type].requiresAction : true,
                validActions: NotificationMetadata[config.type]?.validActions || ['client_accept_coach_proposal', 'client_decline_coach_proposal', 'client_propose_new_time_to_coach']
            }
        };
        break;

        case NotificationTypes.PROGRAM_COMMENT_POSTED:
          content = {
            title: 'notifications:program_comment_posted_title',
            message: 'notifications:program_comment_posted_message',
            data: {
              programId: config.metadata.programId,
              lessonId: config.metadata.lessonId,
              commentId: config.metadata.commentId,
              programTitle: config.metadata.programTitle,
              lessonTitle: config.metadata.lessonTitle,
              commenterName: config.metadata.commenterName,
              validActions: ['view_comment']
            }
          };
          break;

        case NotificationTypes.PROGRAM_COMMENT_REPLY:
          content = {
            title: 'notifications:program_comment_reply_title',
            message: 'notifications:program_comment_reply_message',
            data: {
              programId: config.metadata.programId,
              lessonId: config.metadata.lessonId,
              commentId: config.metadata.commentId,
              programTitle: config.metadata.programTitle,
              lessonTitle: config.metadata.lessonTitle,
              commenterName: config.metadata.commenterName,
              validActions: ['view_comment', 'reply']
            }
          };
          break;

          case NotificationTypes.NEW_PROGRAM_REVIEW:
            content = {
              title: 'notifications:new_program_review_title',
              message: 'notifications:new_program_review_message',
              data: {
                programId: config.metadata.programId,
                reviewId: config.metadata.reviewId,
                programTitle: config.metadata.programTitle,
                reviewerName: config.metadata.reviewerName,
                rating: config.metadata.rating,
                validActions: ['view_review']
              }
            };
        break;
         case NotificationTypes.PROGRAM_ASSIGNMENT_SUBMITTED:
            content = {
              title: 'notifications:program_assignment_submitted_title',
              message: 'notifications:program_assignment_submitted_message',
              data: {
                programId: config.metadata.programId,
                lessonId: config.metadata.lessonId,
                programTitle: config.metadata.programTitle,
                lessonTitle: config.metadata.lessonTitle,
                studentName: config.metadata.studentName,
                validActions: ['review_assignment']
              }
            };
        break;
        case NotificationTypes.PROGRAM_COMPLETED:
            content = {
              title: 'notifications:program_completed_title',
              message: 'notifications:program_completed_message',
              data: {
                programId: config.metadata.programId,
                programTitle: config.metadata.programTitle,
                validActions: ['view_program', 'leave_review']
              }
            };
        break;

        case NotificationTypes.NEW_EARNING_COACH:
        content = {
          title: 'notifications:new_earning_coach_title', 
          message: 'notifications:new_earning_coach_message', 
          data: {
            paymentId: config.metadata.paymentId,
            netAmount: config.metadata.netAmount,
            currency: config.metadata.currency,
            clientName: config.metadata.clientName,
            status: 'completed',
            validActions: ['view_earnings_summary']
          }
        };
        break;

       case NotificationTypes.PAYOUT_ON_HOLD:
        content = {
          title: 'payout_on_hold_title',
          message: 'payout_on_hold_message',
          data: {
            paymentId: config.metadata.paymentId,
            payoutAmount: config.metadata.payoutAmount,
            currency: currency,
            adminReason: config.metadata.adminReason,
            status: 'on_hold',
            validActions: ['view_earnings_summary', 'contact_support']
          }
        };
        break;

      case NotificationTypes.PAYOUT_RELEASED:
        content = {
          title: 'payout_released_title',
          message: 'payout_released_message',
          data: {
            paymentId: config.metadata.paymentId,
            payoutAmount: config.metadata.payoutAmount,
            currency: currency,
            status: 'pending',
            validActions: ['view_earnings_summary']
          }
        };
        break;

         case NotificationTypes.LIVE_SESSION_RECEIPT_CLIENT:
          const snapshotClient = config.metadata.priceSnapshot || {};
          content = {
            title: 'notifications:live_session_receipt_client_title',
            message: 'notifications:live_session_receipt_client_message',
            data: {
              liveSessionId: bookingData._id,
              coachName: `${coachForNotif.firstName} ${coachForNotif.lastName}`,
              durationInSeconds: snapshotClient.duration,
              finalCost: snapshotClient.grossAmount?.toFixed(2) || 'N/A',
              taxAmount: snapshotClient.taxAmount?.toFixed(2),
              netAmount: snapshotClient.netAmount?.toFixed(2),
              currency: currency,
              status: 'completed',
              validActions: ['view_receipt', 'book_again']
            }
          };
          break;

        case NotificationTypes.LIVE_SESSION_EARNINGS_COACH:
          const snapshotCoach = config.metadata.priceSnapshot || {};
          const netPayout = (snapshotCoach.netAmount || 0) - (snapshotCoach.platformFeeAmount || 0);
          content = {
            title: 'notifications:live_session_earnings_coach_title',
            message: 'notifications:live_session_earnings_coach_message',
            data: {
              liveSessionId: bookingData._id,
              clientName: `${clientForNotif.firstName} ${clientForNotif.lastName}`,
              durationInSeconds: snapshotCoach.duration,
              grossRevenue: snapshotCoach.netAmount?.toFixed(2) || 'N/A',
              platformFee: snapshotCoach.platformFeeAmount?.toFixed(2),
              netPayout: netPayout > 0 ? netPayout.toFixed(2) : '0.00',
              currency: currency,
              status: 'completed',
              validActions: ['view_earnings_summary']
            }
          };
          break;

          case NotificationTypes.REFUND_REQUESTED_FOR_COACH:
        content = {
          title: NotificationTypes.REFUND_REQUESTED_FOR_COACH,
          message: NotificationTypes.REFUND_REQUESTED_FOR_COACH,
          data: {
            bookingId: bookingData._id,
            clientName: config.metadata?.clientName || `${bookingData.user?.firstName || 'A'} ${bookingData.user?.lastName || 'Client'}`,
            sessionTitle: bookingData.title,
            requiresAction: true,
            validActions: ['review_refund_request']
          }
        };
        break;

      case NotificationTypes.REFUND_REQUEST_ESCALATED:
        content = {
          title: NotificationTypes.REFUND_REQUEST_ESCALATED,
          message: NotificationTypes.REFUND_REQUEST_ESCALATED,
          data: {
            bookingId: bookingData._id,
            sessionTitle: bookingData.title,
            requiresAction: false,
            validActions: ['view_dispute_details']
          }
        };
        break;
      
      case NotificationTypes.REFUND_PROCESSED_COACH:
        content = {
          title: NotificationTypes.REFUND_PROCESSED_COACH,
          message: NotificationTypes.REFUND_PROCESSED_COACH,
          data: {
            bookingId: bookingData._id,
            paymentId: config.metadata?.paymentId,
            refundAmount: config.metadata?.refundAmount,
            currency: config.metadata?.currency,
            coachDebitAmount: config.metadata?.coachDebitAmount,
            isPostPayout: config.metadata?.isPostPayout,
            requiresAction: false,
            validActions: ['view_transaction_history']
          }
        };
        break;

      case NotificationTypes.REFUND_PROCESSED_CLIENT:
        content = {
          title: NotificationTypes.REFUND_PROCESSED_CLIENT,
          message: NotificationTypes.REFUND_PROCESSED_CLIENT,
          data: {
            bookingId: bookingData._id,
            paymentId: config.metadata?.paymentId,
            refundAmount: config.metadata?.refundAmount,
            currency: config.metadata?.currency,
            requiresAction: false,
            validActions: ['view_booking_details']
          }
        };
        break;

        case NotificationTypes.UPCOMING_SESSION_REMINDER:
          content = {
            title: 'notifications:upcoming_session_reminder.title',
            message: 'notifications:upcoming_session_reminder.message',
            data: {
              bookingId: bookingData._id,
              name: otherPartyName,
              sessionType: bookingData.sessionType?.name || 'Session',
              date: new Date(bookingData.start).toLocaleDateString(),
              time: new Date(bookingData.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
              status: bookingData.status,
              validActions: ['view']
            }
          };
          break;
        case NotificationTypes.COACH_CANCELLED_SESSION:
          content = {
            title: 'notifications:coach_cancelled_session.title',
            message: 'notifications:coach_cancelled_session.message',
            data: {
              bookingId: bookingData._id,
              coachName: `${coachForNotif.firstName} ${coachForNotif.lastName}`,
              sessionTitle: bookingData.title || bookingData.sessionType?.name,
              sessionDate: new Date(bookingData.start).toLocaleDateString(),
              status: 'cancelled_by_coach',
              validActions: ['view_booking_details']
            }
          };
          break;
        case NotificationTypes.NEW_EARNING:
          content = {
            title: 'notifications:new_earning.title',
            message: 'notifications:new_earning.message',
            data: {
              amount: amountForDisplay,
              currency: currency,
              clientName: config.metadata?.clientName || 'a client',
              status: 'completed',
              validActions: ['view_earnings_summary']
            }
          };
          break;
        case NotificationTypes.PAYOUT_INITIATED:
          content = {
            title: 'notifications:payout_initiated.title',
            message: 'notifications:payout_initiated.message',
            data: {
              payoutAmount: amountForDisplay,
              currency: currency,
              status: 'processed',
              validActions: ['view_earnings_summary']
            }
          };
          break;

        default:
          content = {
            title: config.type,
            message: config.type,
            data: {
              bookingId: bookingData._id,
              bookingTime: bookingData.start,
              duration: (new Date(bookingData.end) - new Date(bookingData.start)) / (1000 * 60),
              bookingType: bookingData.bookingType,
              requiresAction: config.requiresAction || false,
              validActions: config.actions || [],
              status: bookingData.status,
              actionResult: config.metadata?.actionResult || bookingData.status,
              name: otherPartyName,
              date: new Date(bookingData.start).toLocaleDateString(),
              time: new Date(bookingData.start).toLocaleTimeString(),
              sessionType: bookingData.sessionType?.name || 'Session'
            }
          };
      }

      console.log('[UnifiedNotificationService] Generated notification content:', {
        type: config.type,
        title: content.title,
        message: content.message,
        status: content.data.status || 'N/A',
        actionResult: content.data.actionResult || 'N/A',
        paymentStatus: content.data.paymentStatus || 'N/A',
        dataAmount: content.data.amount,
        dataCurrency: content.data.currency,
        timestamp: new Date().toISOString()
      });

      return content;
    } catch (error) {
      logger.error('[UnifiedNotificationService] Error generating notification content:', {
        error: error.message,
        stack: error.stack,
        type: config.type,
        bookingId: bookingData._id,
        configRecipientType: config.recipientType,
        timestamp: new Date().toISOString()
      });
      return {
        title: config.type,
        message: 'An error occurred while generating this notification.',
        data: {
          bookingId: bookingData._id,
          error: true
        }
      };
    }
  }
  

}

module.exports = new UnifiedNotificationService();