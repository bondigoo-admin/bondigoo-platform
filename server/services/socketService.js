const { logger } = require('../utils/logger');
const { SOCKET_EVENTS } = require ('../utils/socket_events');
const Notification = require('../models/Notification');
const User = require('../models/User');

class SocketNotificationService {
  constructor(io) {
    this.io = io;
    this.retryAttempts = new Map();
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 1000;
  }
  
   emitToAdmins(event, data) {
    if (!this.io) {
      logger.error(`[SocketService] EMIT TO ADMINS FAILED: IO not initialized. Event '${event}' was NOT SENT.`);
      return;
    }
    this.io.to('admin_room').emit(event, data);
    logger.info(`[SocketService] EMIT SUCCESS: Broadcasted event '${event}' to admin_room.`);
  }
  
async addUser(userId, socketId) {
    if (!userId) {
      logger.error('[SocketService] FAILED to add user: Invalid userId.', { userId, socketId });
      return;
    }
    const userIdStr = userId.toString();
    try {
      const sockets = await this.io.in(userIdStr).allSockets();
      if (sockets.size === 1) { // This is the user's FIRST connection
        this.broadcastUserStatus(userIdStr, 'online');
        logger.info(`[SocketService] User ${userIdStr}'s FIRST connection detected. Status broadcasted to ONLINE.`);
        
        // Fire-and-forget the database update, but log any potential errors.
        User.findByIdAndUpdate(userIdStr, { status: 'online', lastStatusUpdate: new Date() })
          .catch(dbError => {
            logger.error(`[SocketService] Background DB update to ONLINE for user ${userIdStr} failed.`, { error: dbError.message });
          });
      } else {
        logger.info(`[SocketService] User ${userIdStr} has another active connection. Total: ${sockets.size}. Status remains online.`);
      }
    } catch (error) {
      logger.error(`[SocketService] Failed to check sockets for user ${userIdStr} to set status online.`, { error: error.message });
    }
  }

   async removeUser(userId, socketId) {
    if (!userId) {
      logger.warn(`[SocketService] Cannot remove user status - no userId provided for socket ${socketId}.`);
      return;
    }
    const userIdStr = userId.toString();
    try {
      // Check if any OTHER sockets for this user are still connected
      const sockets = await this.io.in(userIdStr).allSockets();
      if (sockets.size === 0) { // This was the last socket for this user
        await User.findByIdAndUpdate(userIdStr, { status: 'offline', lastStatusUpdate: new Date() });
        this.broadcastUserStatus(userIdStr, 'offline');
        logger.info(`[SocketService] User ${userIdStr}'s LAST connection disconnected. Status set to OFFLINE.`);
      } else {
        logger.info(`[SocketService] User ${userIdStr} still has ${sockets.size} active connection(s). Status remains online.`);
      }
    } catch (error) {
      logger.error(`[SocketService] Failed to set user ${userIdStr} status to offline.`, { error: error.message });
    }
  }

  async emitWithRetry(event, data, recipients, retryCount = 0) {
    try {
      if (!this.io) {
        throw new Error('Socket service not initialized');
      }
 
      recipients.forEach(recipientId => {
        this.io.to(recipientId.toString()).emit(event, data);
      });
 
      logger.debug('[SocketService] Event emitted successfully:', {
        event,
        recipients: recipients.length
      });
 
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        console.warn('[SocketService] Retrying event emission:', {
          event,
          attempt: retryCount + 1,
          error: error.message
        });
 
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.emitWithRetry(event, data, recipients, retryCount + 1);
      }
 
      console.error('[SocketService] Max retries reached for event:', {
        event,
        recipients,
        error: error.message
      });
      throw error;
    }
  }

  async emitBookingNotification(notification, recipients, bookingData = null) {
    console.log('[SocketNotificationService] Emitting booking notification:', {
      notificationId: notification._id,
      type: notification.type,
      recipients: recipients.length,
      bookingId: bookingData?._id
    });

    const isMongooseObject = bookingData && typeof bookingData.toObject === 'function';

    const notificationData = {
      ...notification.toObject(),
      _id: notification._id.toString(),
      booking: isMongooseObject ? {
        ...bookingData.toObject(),
        _id: bookingData._id.toString(),
        coach: bookingData.coach ? bookingData.coach.toString() : null,
        user: bookingData.user ? bookingData.user.toString() : null
      } : null,
      timestamp: new Date().toISOString()
    };

    for (const recipientId of recipients) {
      try {
        await this.emitWithRetry(SOCKET_EVENTS.NOTIFICATION, notificationData, [recipientId]);
        
        logger.debug('[SocketNotificationService] Notification emitted to:', {
          recipientId,
          type: notification.type,
          hasBookingData: !!bookingData
        });
      } catch (error) {
        console.error('[SocketNotificationService] Failed to emit notification:', {
          error: error.message,
          recipientId,
          notificationId: notification._id
        });
      }
    }
  }

  emitToUser(userId, event, data) {
    if (!this.io) {
      logger.error(`[SocketService] EMIT FAILED: IO not initialized. Event '${event}' was NOT SENT.`);
      return;
    }
    if (!userId || !event) {
      logger.error(`[SocketService] EMIT FAILED: Invalid arguments for event '${event}'.`, { userId });
      return;
    }
    const targetRoom = userId.toString();
    this.io.to(targetRoom).emit(event, data);
    logger.info(`[SocketService] EMIT SUCCESS: Broadcasted event '${event}' to user room '${targetRoom}'.`);
  }

  broadcastUserStatus(userId, status) {
    if (this.io) {
      this.io.emit('user_status_update', { userId, status });
      console.log(`[SocketService] Broadcasting status update for user ${userId}`, { status });
    } else {
      logger.error('[SocketService] Cannot broadcast status, io not initialized.');
    }
  }

  async emitAvailabilityUpdate(availabilityId, action, recipients, originalBookingId = null) {
    try {
      const data = {
        availabilityId: availabilityId.toString(),
        action,
        originalBookingId: originalBookingId?.toString(),
        timestamp: new Date().toISOString()
      };
   
      await this.emitWithRetry('availability_update', data, recipients);
   
    } catch (error) {
      console.error('[SocketService] Failed to emit availability update:', {
        availabilityId,
        action,
        originalBookingId,
        error: error.message
      });
    }
  }

  async emitBookingStatusUpdate(bookingId, status, recipients) {
    try {
      const data = {
        bookingId: bookingId.toString(),
        status,
        timestamp: new Date().toISOString()
      };
 
      await this.emitWithRetry(SOCKET_EVENTS.BOOKING_UPDATE, data, recipients);
 
      console.log('[SocketService] Booking status update emitted:', {
        bookingId,
        status,
        recipients: recipients.length
      });
    } catch (error) {
      console.error('[SocketService] Failed to emit booking status:', {
        bookingId,
        status,
        error: error.message
      });
      // Rethrow as this is a critical update
      throw error;
    }
  }

  async emitBookingUpdate(bookingId, updatedBookingData, recipients) {
    try {
      const data = {
        bookingId: bookingId.toString(),
        bookingData: updatedBookingData, // Send the full updated booking object
        timestamp: new Date().toISOString()
      };
      // Assuming SOCKET_EVENTS.BOOKING_DATA_UPDATE is or will be defined
      // If not, you can reuse SOCKET_EVENTS.BOOKING_UPDATE if the frontend can handle different payloads for it.
      // For clarity, a new event name like BOOKING_DATA_UPDATE might be better.
      // Let's assume a generic BOOKING_UPDATE event can handle this payload for now.
      await this.emitWithRetry(SOCKET_EVENTS.BOOKING_UPDATE, data, recipients); 
 
      console.log('[SocketService] Full booking update emitted:', {
        event: SOCKET_EVENTS.BOOKING_UPDATE,
        bookingId,
        recipients: recipients.length
      });
    } catch (error) {
      logger.error('[SocketService] Failed to emit full booking update:', {
        event: SOCKET_EVENTS.BOOKING_UPDATE,
        bookingId,
        error: error.message
      });
      throw error; // Or handle more gracefully depending on requirements
    }
  }

  emitNotificationAction(notificationId, action, result, affectedUsers) {
    console.log('[SocketNotificationService] Emitting notification action:', {
      notificationId,
      action,
      affectedUsers: affectedUsers.length
    });

    const actionData = {
      notificationId: notificationId.toString(),
      action,
      result,
      timestamp: new Date().toISOString()
    };

    affectedUsers.forEach(userId => {
      this.io.to(userId.toString()).emit(SOCKET_EVENTS.NOTIFICATION_ACTION, actionData);
    });
  }

  async emitNewMessage(message, recipients) {
    try {
      console.log('[SocketService] Preparing to emit NEW_MESSAGE', {
        messageId: message._id,
        recipientCount: recipients.length,
        timestamp: new Date().toISOString(),
      });
  
      const messageData = {
        messageObject: message,
        timestamp: new Date().toISOString(),
      };
  
      for (const recipientId of recipients) {
        if (!recipientId) {
          logger.warn('[SocketService] Skipping emission - Invalid recipientId', {
            messageId: message._id,
            timestamp: new Date().toISOString(),
          });
          continue;
        }
  
        logger.debug('[SocketService] Emitting NEW_MESSAGE to user room', {
          messageId: message._id,
          recipientId,
          roomStatus: this.io.sockets.adapter.rooms.get(recipientId.toString())?.size ? 'active' : 'inactive',
          timestamp: new Date().toISOString(),
        });
  
        this.io.to(recipientId.toString()).emit(SOCKET_EVENTS.NEW_MESSAGE, messageData);
      }
  
      console.log('[SocketService] Successfully emitted NEW_MESSAGE to all recipients', {
        messageId: message._id,
        recipientCount: recipients.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[SocketService] Failed to emit NEW_MESSAGE', {
        messageId: message._id,
        recipientCount: recipients.length,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async emitConversationRead(readerUserId, targetUserId, conversationId) {
    try {
      if (!targetUserId || !conversationId) {
        logger.warn('[SocketService] Skipping emitConversationRead - Missing parameters', { readerUserId, targetUserId, conversationId });
        return;
      }
      const payload = {
        conversationId: conversationId.toString(),
        readerUserId,
        timestamp: new Date().toISOString(),
      };
      this.io.to(targetUserId.toString()).emit(SOCKET_EVENTS.CONVERSATION_READ, payload);
      console.log('[SocketService] Emitted CONVERSATION_READ', { readerUserId, targetUserId, conversationId });
    } catch (error) {
      logger.error('[SocketService] Failed to emit CONVERSATION_READ', { readerUserId, targetUserId, conversationId, error: error.message });
      throw error;
    }
  }

  async handleNotificationDelivery(notificationId, recipientId, status = 'delivered') {
    console.log('[SocketNotificationService] Handling notification delivery:', {
      notificationId,
      recipientId,
      status
    });

    try {
      await Notification.findByIdAndUpdate(
        notificationId,
        {
          $set: {
            'delivery.statuses.$[elem].status': status,
            'delivery.statuses.$[elem].timestamp': new Date()
          }
        },
        {
          arrayFilters: [{ 'elem.channel': 'in_app' }],
          new: true
        }
      );

      logger.debug('[SocketNotificationService] Notification delivery status updated:', {
        notificationId,
        status
      });
    } catch (error) {
      console.error('[SocketNotificationService] Error updating delivery status:', {
        error: error.message,
        notificationId,
        recipientId
      });
    }
  }
}

// Create and export singleton instance
let instance = null;

const initializeSocketService = (io) => {
  if (!instance) {
    instance = new SocketNotificationService(io);
  }
  return instance;
};

module.exports = {
  initializeSocketService,
  getSocketService: () => instance
};