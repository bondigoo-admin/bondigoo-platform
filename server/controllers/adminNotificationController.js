const NotificationSettings = require('../models/NotificationSettings');
const { logger } = require('../utils/logger');

exports.getSettings = async (req, res) => {
  try {
    logger.info('[AdminNotificationController] Fetching notification settings');
    let settings = await NotificationSettings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = await NotificationSettings.create({
        defaults: {
          channels: {
            email: true,
            push: true,
            inApp: true
          },
          timing: {
            sessionReminders: 30,
            dailyDigest: true,
            digestTime: '09:00',
            quietHoursEnabled: false,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00'
          }
        },
        retentionPeriod: {
          read: 30,
          unread: 90,
          important: 180
        },
        batchProcessing: {
          enabled: true,
          interval: 5,
          maxBatchSize: 100
        },
        throttling: {
          enabled: true,
          maxPerMinute: 60,
          maxPerHour: 1000,
          cooldownPeriod: 5
        }
      });
      logger.info('[AdminNotificationController] Created default notification settings');
    }

    res.json(settings);
  } catch (error) {
    logger.error('[AdminNotificationController] Error fetching settings:', error);
    res.status(500).json({ message: 'Error fetching notification settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    logger.info('[AdminNotificationController] Updating notification settings');
    const settings = await NotificationSettings.findOneAndUpdate(
      {},
      { $set: req.body },
      { new: true, upsert: true }
    );

    // Emit settings update event for real-time sync
    req.io.emit('notification_settings_updated', settings);

    logger.info('[AdminNotificationController] Settings updated successfully');
    res.json(settings);
  } catch (error) {
    logger.error('[AdminNotificationController] Error updating settings:', error);
    res.status(500).json({ message: 'Error updating notification settings' });
  }
};

exports.getDeliveryStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    logger.info('[AdminNotificationController] Fetching delivery stats', { startDate, endDate });

    const stats = await Notification.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          delivered: {
            $sum: {
              $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
            }
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
            }
          },
          read: {
            $sum: {
              $cond: [{ $eq: ['$isRead', true] }, 1, 0]
            }
          }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    logger.error('[AdminNotificationController] Error fetching delivery stats:', error);
    res.status(500).json({ message: 'Error fetching delivery statistics' });
  }
};

exports.getNotificationTemplates = async (req, res) => {
  try {
    logger.info('[AdminNotificationController] Fetching notification templates');
    const templates = await NotificationTemplate.find()
      .sort({ type: 1, language: 1 });
    res.json(templates);
  } catch (error) {
    logger.error('[AdminNotificationController] Error fetching templates:', error);
    res.status(500).json({ message: 'Error fetching notification templates' });
  }
};

exports.updateNotificationTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const templateData = req.body;
    logger.info('[AdminNotificationController] Updating notification template', { id });

    const template = await NotificationTemplate.findByIdAndUpdate(
      id,
      { $set: templateData },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    logger.error('[AdminNotificationController] Error updating template:', error);
    res.status(500).json({ message: 'Error updating notification template' });
  }
};

exports.resetToDefaults = async (req, res) => {
  try {
    logger.info('[AdminNotificationController] Resetting notification settings to defaults');
    await NotificationSettings.deleteMany({});
    const defaultSettings = await NotificationSettings.create({
      // Default settings object
    });

    // Emit settings reset event
    req.io.emit('notification_settings_reset', defaultSettings);

    res.json(defaultSettings);
  } catch (error) {
    logger.error('[AdminNotificationController] Error resetting settings:', error);
    res.status(500).json({ message: 'Error resetting notification settings' });
  }
};