const cron = require('node-cron');
const Coach = require('../models/Coach');
const UnifiedNotificationService = require('../services/unifiedNotificationService');
const { logger } = require('../utils/logger');

const runVerificationExpiryReminders = async () => {
  logger.info('[VerificationExpiryReminderJob] Starting job...');
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  try {
    const coachesWithExpiringVerifications = await Coach.find({
      'settings.insuranceRecognition.registries': {
        $elemMatch: {
          status: 'verified',
          expiryDate: { $lt: thirtyDaysFromNow }
        }
      }
    }).select('user settings.insuranceRecognition.registries');

    for (const coach of coachesWithExpiringVerifications) {
      for (const registry of coach.settings.insuranceRecognition.registries) {
        if (registry.status === 'verified' && registry.expiryDate < thirtyDaysFromNow) {
          
          await UnifiedNotificationService.sendNotification({
            type: 'VERIFICATION_EXPIRING_SOON',
            recipient: coach.user.toString(),
            recipientType: 'coach',
            metadata: {
              registryName: registry.name,
              expiryDate: registry.expiryDate.toISOString()
            }
          });
        }
      }
    }
    logger.info(`[VerificationExpiryReminderJob] Processed ${coachesWithExpiringVerifications.length} coaches.`);
  } catch (error) {
    logger.error('[VerificationExpiryReminderJob] Error during job execution:', { error: error.message });
  }
};

module.exports.scheduleVerificationExpiryReminders = () => {
  cron.schedule('0 4 * * *', runVerificationExpiryReminders, {
    scheduled: true,
    timezone: "UTC"
  });
};