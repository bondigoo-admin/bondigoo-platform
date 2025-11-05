const cloudinary = require('../utils/cloudinaryConfig');
const { logger } = require('../utils/logger');

module.exports = async (job) => {
  const { publicIds, resourceType, type } = job.data;
  const logContext = { 
    jobName: 'assetCleanupWorker', 
    jobId: job.id,
    count: publicIds.length, 
    resourceType, 
    type 
  };
  console.log(`[assetCleanupWorker] START: Processing job to delete Cloudinary assets.`, logContext);
  console.log(`[assetCleanupWorker] Job ${job.id}: Public IDs to be deleted:`, publicIds);
  
  try {
    const result = await cloudinary.api.delete_resources(publicIds, { resource_type: resourceType, type: type });
    
    const deleted = result.deleted || {};
    const deletedCount = Object.keys(deleted).length;
    const partial = result.partial || false;
    
    const failedEntries = partial ? publicIds.filter(id => !deleted[id]) : [];
    const failedCount = failedEntries.length;

    logContext.deletedCount = deletedCount;
    logContext.failedCount = failedCount;
    logContext.isPartialFailure = partial;

    if (failedCount > 0) {
      logger.warn('[assetCleanupWorker] PARTIAL-FAILURE: Cloudinary reported some assets could not be deleted.', { ...logContext, failedPublicIds: failedEntries, cloudinaryResponse: result });
    } else {
      console.log(`[assetCleanupWorker] SUCCESS: Cloudinary deletion job completed successfully. Deleted ${deletedCount} asset(s).`, logContext);
    }

  } catch (error) {
    logger.error('[assetCleanupWorker] FAILURE: API call to Cloudinary failed. Job will be retried.', { ...logContext, errorMessage: error.message });
    throw error;
  }
};