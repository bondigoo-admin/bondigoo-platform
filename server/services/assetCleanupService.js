const { assetCleanupQueue } = require('./jobQueueService');
const { logger } = require('../utils/logger');

/**
 * Queues Cloudinary assets for deletion in the background.
 * @param {string | string[]} publicIds - A single public_id or an array of public_ids to delete.
 * @param {string} resourceType - The Cloudinary resource type ('image', 'video', 'raw', or 'auto'). Defaults to 'auto'.
 * @param {boolean} isPrivate - Whether the asset is private. Defaults to true.
 */
const queueAssetDeletion = async (publicIds, resourceType = 'auto', isPrivate = true) => {
  if (!publicIds || publicIds.length === 0) {
    return;
  }

  const idsToDelete = Array.isArray(publicIds) ? publicIds : [publicIds];
  const type = isPrivate ? 'private' : 'upload';

  const logContext = { job: 'queueAssetDeletion', count: idsToDelete.length, resourceType, type };

  try {
    const validIds = idsToDelete.filter(id => id);
    if (validIds.length === 0) return;

    const job = await assetCleanupQueue.add('delete-cloudinary-assets', {
      publicIds: validIds,
      resourceType,
      type,
    });
    console.log(`[assetCleanupService] Successfully queued job ${job.id} to delete ${validIds.length} assets.`);
  } catch (error) {
    logger.error('Failed to queue asset deletion job.', { ...logContext, error: error.message });
  }
};

module.exports = { queueAssetDeletion };