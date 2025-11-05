const { Queue, Worker } = require('bullmq');
const connection = require('../redisClient'); 
const { logger } = require('../utils/logger');
const cloudinary = require('../utils/cloudinaryConfig');
const User = require('../models/User');
const moderationService = require('./moderationService');
const Message = require('../models/Message');
const assetCleanupWorker = require('../workers/assetCleanupWorker');
const Program = require('../models/Program');
const Coach = require('../models/Coach');
const Lesson = require('../models/Lesson');

let io;

const initialize = (socketIoInstance) => {
    io = socketIoInstance;
    console.log('[BullMQ] Socket.io instance received for real-time updates.');

    new Worker('asset-cleanup', assetCleanupWorker, { connection });
    console.log('[BullMQ] Asset Cleanup Worker initialized.');
};

const broadcastQueueUpdate = () => {
    if (io) {
        io.emit('job_queue_update');
    }
};

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 3600, // keep up to 1 hour
    count: 1000, // keep up to 1000 jobs
  },
  removeOnFail: {
    age: 24 * 3600, // keep failed jobs for 24 hours
  },
};

const liveSessionQueue = new Queue('live-session-jobs', { connection, defaultJobOptions });
const statusResetQueue = new Queue('status-reset-jobs', { connection, defaultJobOptions });
const accountCleanupQueue = new Queue('account-cleanup-queue', { connection, defaultJobOptions });
const userDataDeletionQueue = new Queue('user-data-deletion-queue', { connection, defaultJobOptions });
const moderationActionsQueue = new Queue('moderation-actions-queue', { connection, defaultJobOptions });
const assetCleanupQueue = new Queue('asset-cleanup', { connection, defaultJobOptions });

const workerOptions = {
  connection,
  // Concurrency defines how many jobs this worker can process at the same time.
  concurrency: 5, 
};

const liveSessionWorker = new Worker('live-session-jobs', async job => {
  const liveSessionManager = require('./liveSessionManager');
  /*console.log(`[BullMQ] Processing job '${job.name}' from 'live-session-jobs'`, { jobId: job.id, data: job.data });
  switch (job.name) {
    case 'monitor-session':
      await liveSessionManager.monitorSession(job.data.sessionId);
      break;
    case 'force-end-session':
      await liveSessionManager.forceEndSession(job.data.sessionId);
      break;
  }*/
}, workerOptions);

const statusResetWorker = new Worker('status-reset-jobs', async job => {
  const liveSessionManager = require('./liveSessionManager');
  const { coachId, expectedStatus } = job.data;
  console.log(`[BullMQ] Processing status reset for coach: ${coachId} to ${expectedStatus}`);
  await liveSessionManager.resetCoachStatus(coachId, expectedStatus);
}, workerOptions);



const accountCleanupWorker = new Worker('account-cleanup-queue', async job => {
  const assetCleanupService = require('./assetCleanupService');

  if (job.name === 'delete-user-attachments') {
    const { userId } = job.data;
    const logContext = { job: 'accountCleanupWorker:delete-user-attachments', userId };
    logger.info('Processing job to delete ALL assets for user.', logContext);

    try {
      const user = await User.findById(userId).lean();
      if (!user) {
        logger.warn('User not found for cleanup job. Aborting.', logContext);
        return;
      }
      
      const assetIdsToDelete = { image: new Set(), video: new Set(), raw: new Set() };
      
      // 1. Gather User assets
      if (user.profilePicture?.publicId) assetIdsToDelete.image.add(user.profilePicture.publicId);
      if (user.backgrounds?.length > 0) {
        user.backgrounds.forEach(bg => bg.publicId && assetIdsToDelete.image.add(bg.publicId));
      }
      
      // 2. Gather Coach assets if user is a coach
      if (user.role === 'coach') {
        const coach = await Coach.findOne({ user: userId }).lean();
        if (coach) {
          if (coach.profilePicture?.publicId) assetIdsToDelete.image.add(coach.profilePicture.publicId);
          if (coach.videoIntroduction?.publicId) assetIdsToDelete.video.add(coach.videoIntroduction.publicId);
          if (coach.settings?.insuranceRecognition?.registries?.length > 0) {
            coach.settings.insuranceRecognition.registries.forEach(reg => {
              if (reg.verificationDocument?.publicId) assetIdsToDelete.raw.add(reg.verificationDocument.publicId);
            });
          }
        }
        
        // 3. Gather Program assets owned by the coach
        const programs = await Program.find({ coach: userId }).populate('modules').lean();
        for (const program of programs) {
          if (program.programImages?.length > 0) {
            program.programImages.forEach(img => img.publicId && assetIdsToDelete.image.add(img.publicId));
          }
          if (program.trailerVideo?.publicId) assetIdsToDelete.video.add(program.trailerVideo.publicId);

          const lessonIds = program.modules.flatMap(m => m.lessons);
          const lessons = await Lesson.find({ _id: { $in: lessonIds } }).select('content').lean();
          for (const lesson of lessons) {
            lesson.content?.files?.forEach(file => {
              if (file.publicId) {
                if (file.resourceType === 'video') assetIdsToDelete.video.add(file.publicId);
                else assetIdsToDelete.image.add(file.publicId); // Treat 'raw'/'document' as image type for simplicity here
              }
            });
            lesson.content?.presentation?.slides?.forEach(slide => {
              if (slide.imagePublicId) assetIdsToDelete.image.add(slide.imagePublicId);
              if (slide.audioPublicId) assetIdsToDelete.video.add(slide.audioPublicId);
            });
          }
        }
      }
      
      // 4. Gather message attachments (reusing existing logic)
      let lastMsgId = null;
      const batchSize = 500;
      let hasMoreMessages = true;
      while (hasMoreMessages) {
        const query = { senderId: userId, 'attachment.publicId': { $exists: true } };
        if (lastMsgId) query._id = { $gt: lastMsgId };
        const messages = await Message.find(query).sort({ _id: 1 }).limit(batchSize).select('attachment.publicId attachment.resourceType').lean();
        if (messages.length === 0) {
          hasMoreMessages = false;
          continue;
        }
        lastMsgId = messages[messages.length - 1]._id;
        messages.forEach(msg => {
            if(msg.attachment?.publicId) {
                const type = msg.attachment.resourceType === 'video' ? 'video' : 'image'; // Simplify to image/video
                assetIdsToDelete[type].add(msg.attachment.publicId);
            }
        });
        if (messages.length < batchSize) hasMoreMessages = false;
      }
      
      // 5. Queue all collected IDs for deletion
      logger.info('Collected all assets for user deletion.', {
        ...logContext,
        imageCount: assetIdsToDelete.image.size,
        videoCount: assetIdsToDelete.video.size,
        rawCount: assetIdsToDelete.raw.size,
      });

      if (assetIdsToDelete.image.size > 0) assetCleanupService.queueAssetDeletion([...assetIdsToDelete.image], 'image');
      if (assetIdsToDelete.video.size > 0) assetCleanupService.queueAssetDeletion([...assetIdsToDelete.video], 'video');
      if (assetIdsToDelete.raw.size > 0) assetCleanupService.queueAssetDeletion([...assetIdsToDelete.raw], 'raw');

    } catch (error) {
      logger.error('Error in account cleanup worker.', { ...logContext, error: error.message, stack: error.stack });
      throw error;
    }
  } else if (job.name === 'delete-cloudinary-asset') {
    // This job is now superseded by the asset-cleanup-queue, but we'll leave it to not break old code
    const { publicId, resourceType = 'raw' } = job.data;
    if (publicId) {
      await assetCleanupService.queueAssetDeletion(publicId, resourceType);
    } else {
      logger.warn('[BullMQ] delete-cloudinary-asset job ran without a publicId.');
    }
  }
}, workerOptions);

const userDataDeletionWorker = new Worker('user-data-deletion-queue', async job => {
  const { userId } = job.data;
  if (!userId) {
    logger.error('[UserDataDeletionWorker] Job received without a userId.', job.data);
    return;
  }
  const logContext = { job: 'delete-user-data', userId };
  console.log('Starting permanent deletion process for user.', logContext);

  try {
    // This is a placeholder for a comprehensive data cleanup service.
    // In a real application, you would delete associated Bookings, Payments, etc.,
    // or anonymize them according to data retention policies.
    // For now, we focus on the core user deletion.

    await User.findByIdAndDelete(userId);

    console.log('Successfully deleted user document from database.', logContext);
  } catch (error) {
    logger.error('Error during user data deletion worker.', { ...logContext, error: error.message, stack: error.stack });
    throw error;
  }
}, workerOptions);

const moderationActionsWorker = new Worker('moderation-actions-queue', async job => {
  await moderationService.resolveFlag(job.data);
}, workerOptions);

liveSessionWorker.on('failed', (job, err) => logger.error(`[BullMQ] Job ${job.name}:${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data }));
statusResetWorker.on('failed', (job, err) => logger.error(`[BullMQ] Status reset job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data }));
accountCleanupWorker.on('failed', (job, err) => logger.error(`[BullMQ] Account cleanup job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data }));
userDataDeletionWorker.on('failed', (job, err) => logger.error(`[BullMQ] User data deletion job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data }));

moderationActionsWorker.on('completed', broadcastQueueUpdate);
moderationActionsWorker.on('failed', (job, err) => {
    logger.error(`[BullMQ] Moderation action job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data });
    broadcastQueueUpdate();
});

liveSessionWorker.on('completed', broadcastQueueUpdate);
liveSessionWorker.on('failed', (job, err) => {
    logger.error(`[BullMQ] Job ${job.name}:${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data });
    broadcastQueueUpdate();
});

statusResetWorker.on('completed', broadcastQueueUpdate);
statusResetWorker.on('failed', (job, err) => {
    logger.error(`[BullMQ] Status reset job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data });
    broadcastQueueUpdate();
});

accountCleanupWorker.on('completed', broadcastQueueUpdate);
accountCleanupWorker.on('failed', (job, err) => {
    logger.error(`[BullMQ] Account cleanup job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data });
    broadcastQueueUpdate();
});

userDataDeletionWorker.on('completed', broadcastQueueUpdate);
userDataDeletionWorker.on('failed', (job, err) => {
    logger.error(`[BullMQ] User data deletion job ${job.id} failed.`, { error: err.message, stack: err.stack, data: job.data });
    broadcastQueueUpdate();
});

const allQueues = {
  'live-session-jobs': liveSessionQueue,
  'status-reset-jobs': statusResetQueue,
  'account-cleanup-queue': accountCleanupQueue,
  'user-data-deletion-queue': userDataDeletionQueue,
  'moderation-actions-queue': moderationActionsQueue,
};

module.exports = {
  initialize,
  liveSessionQueue,
  statusResetQueue,
  accountCleanupQueue,
  userDataDeletionQueue,
  moderationActionsQueue,
  assetCleanupQueue,
  allQueues,
};