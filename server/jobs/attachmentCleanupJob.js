// Replace the entire contents of `server/jobs/attachmentCleanupJob.js` with this:

const Message = require('../models/Message');
const cloudinary = require('../utils/cloudinaryConfig');
const { logger } = require('../utils/logger');

module.exports.runAttachmentCleanup = async () => {
  const logContext = { job: 'runAttachmentCleanup' };
  console.log('CRON-START: Starting daily attachment cleanup job.', logContext);

  try {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    // Process in batches to avoid high memory usage
    const messagesToDelete = await Message.find({
      createdAt: { $lt: threeYearsAgo },
      'attachment.publicId': { $exists: true }
    }).limit(500).select('attachment.publicId').lean();

    if (messagesToDelete.length === 0) {
      console.log('CRON-SUCCESS: No attachments older than 3 years found to clean up.', logContext);
      return;
    }

    const publicIds = messagesToDelete.map(m => m.attachment.publicId);
    logContext.batchSize = publicIds.length;
    console.log(`CRON-PROGRESS: Found ${publicIds.length} old attachments to delete.`, logContext);

    const deletionResult = await cloudinary.api.delete_resources(publicIds, { resource_type: 'auto', type: 'private' });
    
    const successfullyDeletedIds = deletionResult.deleted ? Object.keys(deletionResult.deleted) : [];
    logContext.deletedFromCloudinary = successfullyDeletedIds.length;

    if (successfullyDeletedIds.length > 0) {
      const dbUpdateResult = await Message.updateMany(
        { 'attachment.publicId': { $in: successfullyDeletedIds } },
        { $unset: { attachment: "" } }
      );
      logContext.updatedInDb = dbUpdateResult.modifiedCount;
      console.log('CRON-SUCCESS: Successfully processed a batch of old attachments.', logContext);
    } else {
      logger.warn('CRON-WARNING: Cloudinary reported 0 successful deletions for the batch. No DB update performed.', logContext);
    }
  } catch (error) {
    logger.error('CRON-FAILURE: Error during attachment cleanup job.', { ...logContext, error: error.message, stack: error.stack });
  }
};