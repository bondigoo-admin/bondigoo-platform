// cleanupResources.js
const cron = require('node-cron');
const Session = require('./models/Session');
const cloudinary = require('cloudinary').v2;
const { logger } = require('./utils/logger');

const cleanupUnusedResources = async () => {
  try {
    const cleanupThreshold = new Date();
    cleanupThreshold.setDate(cleanupThreshold.getDate() - 30); // 30 days ago

    // Find completed sessions older than 30 days
    const oldSessions = await Session.find({
      state: 'completed',
      endedAt: { $lt: cleanupThreshold },
    });

    for (const session of oldSessions) {
      const resourcesToDelete = session.resources || [];
      if (resourcesToDelete.length === 0) continue;

      for (const resource of resourcesToDelete) {
        try {
          // Extract public_id from URL
          const urlParts = resource.url.split('/');
          const publicIdWithExt = urlParts.pop();
          const publicId = `sessions/${session.bookingId.toString()}/resources/${publicIdWithExt.split('.')[0]}`;

          // Delete from Cloudinary (assume 'raw' for non-media files; adjust if needed)
          await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
          logger.info('[cleanupResources] Deleted resource from Cloudinary', { publicId, sessionId: session._id });
        } catch (error) {
          logger.error('[cleanupResources] Failed to delete resource from Cloudinary', {
            resourceId: resource._id,
            url: resource.url,
            error: error.message,
          });
        }
      }

      // Clear resources from session document
      session.resources = [];
      await session.save();
      logger.info('[cleanupResources] Cleared resources from session', { sessionId: session._id });
    }

    if (oldSessions.length > 0) {
      logger.info('[cleanupResources] Cleanup completed', { sessionsProcessed: oldSessions.length });
    }
  } catch (error) {
    logger.error('[cleanupResources] Cleanup process error', { error: error.message, stack: error.stack });
  }
};

// Schedule to run daily at midnight
cron.schedule('0 0 * * *', cleanupUnusedResources);

module.exports = { cleanupUnusedResources };