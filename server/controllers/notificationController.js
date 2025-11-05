const Notification = require('../models/Notification');
const User = require('../models/User');
const { NotificationMetadata, NotificationCategories, NotificationPriorities } = require('../utils/notificationHelpers');
const UnifiedNotificationService = require('../services/unifiedNotificationService');
const { logger } = require('../utils/logger');
const Booking = require('../models/Booking');

exports.createNotification = async (req, res) => {
  console.log('[NotificationController] Creating notification:', {
    body: req.body,
    userId: req.user?._id,
    timestamp: new Date().toISOString()
  });

  if (!req.user?._id) {
    logger.warn('[NotificationController] Unauthorized notification attempt');
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }

  const { recipient, type, content, metadata = {}, priority = 'medium', channels = ['in_app'] } = req.body;

  if (!recipient || !type || !content) {
    logger.warn('[NotificationController] Missing required fields:', {
      hasRecipient: !!recipient,
      hasType: !!type,
      hasContent: !!content
    });
    return res.status(400).json({ 
      success: false, 
      message: 'Recipient, type, and content are required' 
    });
  }

  try {
    const notificationMeta = NotificationMetadata[type] || {
      category: NotificationCategories.SYSTEM,
      priority: NotificationPriorities.LOW
    };

    console.log('[NotificationController] Resolved notification metadata:', {
      type,
      category: notificationMeta.category,
      priority: notificationMeta.priority
    });

    const notificationData = {
      recipient,
      sender: req.user._id,
      type,
      content,
      metadata: {
        ...metadata,
        ...(metadata.bookingId && {
          bookingId: metadata.bookingId,
          additionalData: {
            ...metadata.additionalData,
            notificationType: type,
            category: notificationMeta.category
          }
        })
      },
      category: notificationMeta.category,
      priority: priority || notificationMeta.priority,
      status: 'active',
      channels,
    };

    logger.debug('[NotificationController] Creating notification with data:', {
      type: notificationData.type,
      category: notificationData.category,
      recipient: notificationData.recipient,
      hasBooking: !!notificationData.metadata.bookingId
    });

    // Call sendNotification and store the result
    await UnifiedNotificationService.sendNotification(notificationData);
    // Since sendNotification doesn't return the notification, fetch it or skip _id access
    const notification = await Notification.findOne({ 
      type, 
      recipient, 
      'metadata.bookingId': notificationData.metadata.bookingId 
    }).sort({ createdAt: -1 });

    console.log('[NotificationController] Notification created successfully:', {
      id: notification?._id || 'not-returned',
      type: notificationData.type,
      recipient: notificationData.recipient,
      timestamp: new Date().toISOString()
    });

    if (req.io && notification) {
      await UnifiedNotificationService.emitSocketNotification(notification, req.io);
    }

    return res.status(201).json({
      success: true,
      notification: notification || { message: 'Notification sent, details not returned' }
    });

  } catch (error) {
    logger.error('[NotificationController] Error creating notification:', {
      error: error.message,
      stack: error.stack,
      type,
      recipient,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'ValidationError') {
      logger.error('[NotificationController] Validation error details:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.keys(error.errors).reduce((acc, key) => {
          acc[key] = error.errors[key].message;
          return acc;
        }, {})
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    });
  }
};

exports.getNotifications = async (req, res) => {
  console.log('--- [BACKEND-CONTROLLER] GET NOTIFICATIONS (Efficient Version) ---');
  try {
    const {
      status = 'all',
      limit = 50,
      offset = 0,
      excludeTrash = 'true',
      isRead
    } = req.query;

    console.log('[Efficient] Fetching notifications for user:', req.user._id, 'with params:', req.query);

     const query = {
      recipient: req.user._id
    };

    if (status && status !== 'all') {
      query.status = status;
    } else if (excludeTrash === 'true') {
      query.status = { $ne: 'trash' };
    }

    if (isRead === 'true' || isRead === 'false') {
      query.isRead = isRead === 'true';
    }

    console.log('[Efficient] Final Mongoose Query:', JSON.stringify(query));

    const [notifications, totalCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .populate('sender', 'firstName lastName email profilePicture')
         .populate({
          path: 'metadata.bookingId',
          populate: [
            { path: 'sessionType', select: 'name duration price' },
            { path: 'coach', select: 'firstName lastName email profilePicture' },
            { path: 'user', select: 'firstName lastName email profilePicture' }
          ]
        })
        .lean(),
      Notification.countDocuments(query)
    ]);
    
    console.log(`[Efficient] Query complete. Found ${notifications.length} notifications.`);

    res.json({
      success: true,
      notifications: notifications,
      pagination: {
        total: totalCount,
        offset: Number(offset),
        limit: Number(limit),
        hasMore: totalCount > (Number(offset) + Number(limit))
      }
    });

  } catch (error) {
    console.error('[NotificationController] Unrecoverable error in getNotifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

const markAsRead = async (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }

  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id,
        recipient: req.user._id 
      },
      { 
        $set: { 
          isRead: true,
          readAt: new Date()
        }
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    return res.json({
      success: true,
      notification
    });

  } catch (err) {
    log('error', 'Failed to mark notification as read', { error: err.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

exports.batchMarkAsRead = async (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const { notificationIds } = req.body;
    logger.info('[NotificationController] Batch mark as read request', { notificationIds, userId: req.user._id });

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      logger.warn('[NotificationController] Invalid notificationIds', { notificationIds });
      return res.status(400).json({
        success: false,
        message: 'notificationIds must be a non-empty array',
      });
    }

    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        recipient: req.user._id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    logger.info('[NotificationController] Batch mark as read successful', { modifiedCount: result.modifiedCount });

    if (req.io) {
      req.io.to(req.user._id.toString()).emit('notification_read_batch', {
        notificationIds,
        isRead: true,
        readAt: new Date().toISOString(),
      });
      logger.info('[NotificationController] Emitted notification_read_batch event', { notificationIds });
    }

    return res.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    logger.error('[NotificationController] Batch mark as read error:', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
    });
  }
};

exports.updateNotificationStatus = async (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }

  try {
    const { status } = req.body;
    const validStatuses = ['active', 'archived', 'trash'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status provided'
      });
    }

    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id,
        recipient: req.user._id,
        status: { $ne: 'deleted' }
      },
      { 
        $set: { 
          status,
          [`${status}At`]: new Date(),
          ...(status === 'trash' ? {
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          } : {})
        }
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Emit socket event for real-time updates
    if (req.io) {
      const socketData = {
        notificationId: notification._id,
        status,
        timestamp: new Date().toISOString()
      };
      req.io.to(req.user._id.toString()).emit('notification_status_changed', socketData);
    }

    return res.json({
      success: true,
      notification
    });

  } catch (err) {
    console.error('[NotificationController] Update status error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update notification status'
    });
  }
};

const populateNotificationBooking = async (notification) => {
  console.log('[NotificationController] Populating booking data for notification:', notification._id);
  
  if (notification.metadata?.bookingId) {
    try {
      // If bookingId is already populated, return as is
      if (typeof notification.metadata.bookingId !== 'string') {
        console.log('[NotificationController] Booking already populated:', notification.metadata.bookingId._id);
        return notification;
      }

      const booking = await Booking.findById(notification.metadata.bookingId)
        .populate('sessionType', 'name')
        .lean();

      if (!booking) {
        console.warn('[NotificationController] Booking not found:', notification.metadata.bookingId);
        return notification;
      }

      console.log('[NotificationController] Successfully populated booking:', {
        notificationId: notification._id,
        bookingId: booking._id,
        sessionType: booking.sessionType?.name
      });

      notification.metadata.bookingId = booking;
      return notification;
    } catch (error) {
      console.error('[NotificationController] Error populating booking:', {
        notificationId: notification._id,
        error: error.message
      });
      return notification;
    }
  }
  return notification;
};

exports.getNotificationsByStatus = async (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }

  try {
    const { status = 'active', limit = 50, offset = 0 } = req.query;
    console.log('[NotificationController] Fetching notifications by status:', {
      userId: req.user._id,
      status,
      limit,
      offset
    });

    const query = {
      recipient: req.user._id,
      status: status
    };

    const [notifications, totalCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .populate('sender', 'firstName lastName email profilePicture')
         .populate({
          path: 'metadata.bookingId',
          populate: [
            { 
              path: 'sessionType',
              select: 'name duration price'
            },
            {
              path: 'coach',
              select: 'firstName lastName email profilePicture'
            },
            {
              path: 'user',
              select: 'firstName lastName email profilePicture'
            }
          ]
        })
        .lean(),
      Notification.countDocuments(query)
    ]);

    console.log('[NotificationController] Processing notifications:', {
      total: notifications.length,
      withBookings: notifications.filter(n => n.metadata?.bookingId).length,
      bookingIds: notifications
        .filter(n => n.metadata?.bookingId)
        .map(n => n.metadata.bookingId._id)
    });

    const formattedNotifications = notifications.map(notification => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
      _id: notification._id.toString(),
      recipient: notification.recipient.toString(),
      sender: notification.sender ? {
        ...notification.sender,
        _id: notification.sender._id.toString()
      } : null
    }));

    return res.json({
      success: true,
      notifications: formattedNotifications,
      pagination: {
        total: totalCount,
        offset: Number(offset),
        limit: Number(limit),
        hasMore: totalCount > (Number(offset) + Number(limit))
      }
    });

  } catch (err) {
    console.error('[NotificationController] Fetch by status error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

exports.batchMoveToTrash = async (req, res) => {
  try {
    console.log('[NotificationController] Batch moving to trash:', req.body.notificationIds);
    
    const { notificationIds } = req.body;
    if (!Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        message: 'notificationIds must be an array'
      });
    }

    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        recipient: req.user._id,
        status: { $ne: 'deleted' }
      },
      {
        $set: {
          status: 'trash',
          trashedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      }
    );

    console.log('[NotificationController] Batch move to trash result:', {
      modified: result.modifiedCount,
      total: notificationIds.length
    });

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('[NotificationController] Error moving to trash:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move notifications to trash'
    });
  }
};

exports.markNotificationAsActioned = async (req, res) => {
  if (!req.user?._id) {
    logger.warn('[NotificationController] Unauthorized attempt to mark notification as actioned', {
      userId: req.user?._id,
      timestamp: new Date().toISOString()
    });
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { id } = req.params;

  try {
    console.log('[NotificationController] Attempting to mark notification as actioned', {
      notificationId: id,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    const notification = await Notification.findOneAndUpdate(
      { 
        _id: id,
        recipient: req.user._id,
        status: { $ne: 'deleted' }
      },
      { 
        $set: { 
          status: 'actioned',
          actionedAt: new Date()
        }
      },
      { new: true }
    );

    if (!notification) {
      logger.warn('[NotificationController] Notification not found or not owned by user', {
        notificationId: id,
        userId: req.user._id
      });
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    console.log('[NotificationController] Notification marked as actioned successfully', { 
      notificationId: id, 
      status: notification.status,
      timestamp: new Date().toISOString()
    });

    // Emit socket event for real-time update
    if (req.io) {
      req.io.to(notification.recipient.toString()).emit('notification_status_updated', {
        notificationId: notification._id,
        status: notification.status,
        timestamp: new Date().toISOString()
      });
      console.log('[NotificationController] Emitted notification_status_updated event', {
        notificationId: notification._id,
        recipient: notification.recipient.toString(),
        status: notification.status,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.warn('[NotificationController] Socket.io instance not available for real-time update', {
        notificationId: id
      });
    }

    return res.json({
      success: true,
      notification: {
        ...notification.toObject(),
        _id: notification._id.toString(),
        recipient: notification.recipient.toString(),
        sender: notification.sender ? notification.sender.toString() : null
      }
    });
  } catch (error) {
    logger.error('[NotificationController] Error marking notification as actioned', {
      notificationId: id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({ success: false, message: 'Failed to mark notification as actioned' });
  }
};

module.exports = {
  createNotification: exports.createNotification,
  getNotifications: exports.getNotifications,
  markAsRead,
  getNotificationsByStatus: exports.getNotificationsByStatus,
  updateNotificationStatus: exports.updateNotificationStatus,
  batchMarkAsRead: exports.batchMarkAsRead,
  batchMoveToTrash: exports.batchMoveToTrash,
  markNotificationAsActioned: exports.markNotificationAsActioned
};