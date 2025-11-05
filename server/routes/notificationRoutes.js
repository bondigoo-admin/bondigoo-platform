const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Notification = require('../models/Notification');
const notificationController = require('../controllers/notificationController');
const { logger } = require('../utils/logger');

router.post('/', auth, async (req, res) => {
  console.log('[NotificationRoutes] Incoming notification request:', {
    type: req.body.type,
    recipient: req.body.recipient,
    sender: req.user?._id,
    timestamp: new Date().toISOString()
  });
  
  try {
    const result = await notificationController.createNotification(req, res);
    return result;
  } catch (error) {
    console.error('[NotificationRoutes] Error in notification creation:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    });
  }
});

router.get('/', auth, (req, res) => {
  console.log('[NotificationRoutes] CORRECT GET / HANDLER | Forwarding to notificationController.getNotifications. Query:', req.query);
  notificationController.getNotifications(req, res);
});

// Mark all notifications as read
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { 
        $set: { 
          isRead: true,
          readAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
});

router.put('/batch/read', auth, notificationController.batchMarkAsRead);

router.put('/:id/read', auth, async (req, res) => {
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
      logger.warn('[NotificationRoutes] Notification not found', {
        notificationId: req.params.id,
        userId: req.user._id
      });
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    logger.info('[NotificationRoutes] Notification marked as read', {
      notificationId: req.params.id,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    // Emit Socket.IO event
    if (req.io) {
      req.io.to(req.user._id.toString()).emit('notification_read', {
        notificationId: req.params.id,
        isRead: true,
        readAt: notification.readAt.toISOString()
      });
      logger.info('[NotificationRoutes] Emitted notification_read event', {
        notificationId: req.params.id,
        userId: req.user._id
      });
    } else {
      logger.warn('[NotificationRoutes] Socket.IO not available', {
        notificationId: req.params.id
      });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error marking notification as read:', {
      error: error.message,
      stack: error.stack,
      notificationId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

router.put('/batch/trash', auth, notificationController.batchMoveToTrash);

router.patch('/:id/actioned', auth, async (req, res) => {
  try {
    const result = await notificationController.markNotificationAsActioned(req, res);
    return result;
  } catch (error) {
    logger.error('[NotificationRoutes] Error marking notification as actioned:', {
      error: error.message,
      stack: error.stack,
      notificationId: req.params.id
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as actioned',
      error: error.message
    });
  }
});

// Empty trash
router.delete('/trash/empty', auth, async (req, res) => {
  try {
    console.log('[NotificationRoutes] Emptying trash for user:', req.user._id);
    
    const result = await Notification.updateMany(
      {
        recipient: req.user._id,
        status: 'trash'
      },
      {
        $set: {
          status: 'deleted',
          deletedAt: new Date()
        }
      }
    );

    logger.info('[NotificationRoutes] Empty trash successful:', {
      modified: result.modifiedCount
    });

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error emptying trash:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to empty trash'
    });
  }
});

module.exports = router;