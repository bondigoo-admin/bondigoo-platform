const { Queue, Worker } = require('bullmq');
const connection = require('../redisClient');
const { logger } = require('../utils/logger');
const assetCleanupWorkerProcessor = require('../workers/assetCleanupWorker');

let io;
const queues = {};
const workers = [];
const environmentPrefix = process.env.ENVIRONMENT_NAME || 'development';

const getQueueName = (name) => `${environmentPrefix}-${name}`;

const broadcastQueueUpdate = () => {
    if (io) {
        io.emit('job_queue_update');
    }
};

const initialize = (socketIoInstance) => {
    io = socketIoInstance;
    logger.info('[BullMQ] Initializing Job Queue Service...', { prefix: environmentPrefix });

    const defaultJobOptions = {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
    };

    const workerOptions = {
        connection,
        concurrency: 5,
    };

    const queueDefinitions = [
        { name: 'live-session-jobs', processor: require.resolve('./processors/liveSessionProcessor') },
        { name: 'status-reset-jobs', processor: require.resolve('./processors/statusResetProcessor') },
        { name: 'account-cleanup-queue', processor: require.resolve('./processors/accountCleanupProcessor') },
        { name: 'user-data-deletion-queue', processor: require.resolve('./processors/userDataDeletionProcessor') },
        { name: 'moderation-actions-queue', processor: require.resolve('./processors/moderationActionsProcessor') },
        { name: 'asset-cleanup', processor: assetCleanupWorkerProcessor }
    ];

    for (const def of queueDefinitions) {
        const prefixedName = getQueueName(def.name);
        logger.info(`[BullMQ] Registering queue: ${prefixedName}`);
        
        queues[def.name] = new Queue(prefixedName, { connection, defaultJobOptions });
        
        const worker = new Worker(prefixedName, def.processor, workerOptions);
        
        worker.on('completed', broadcastQueueUpdate);
        worker.on('failed', (job, err) => {
            logger.error(`[BullMQ] Job ${job?.name}:${job?.id} in queue ${prefixedName} failed.`, { error: err.message, stack: err.stack, data: job?.data });
            broadcastQueueUpdate();
        });

        workers.push(worker);
    }

    logger.info('[BullMQ] All Queues and Workers have been initialized.');
};

const getQueue = (name) => {
    const queue = queues[name];
    if (!queue) {
        throw new Error(`Queue "${name}" is not initialized. Available queues: ${Object.keys(queues).join(', ')}`);
    }
    return queue;
};

module.exports = {
    initialize,
    liveSessionQueue: () => getQueue('live-session-jobs'),
    statusResetQueue: () => getQueue('status-reset-jobs'),
    accountCleanupQueue: () => getQueue('account-cleanup-queue'),
    userDataDeletionQueue: () => getQueue('user-data-deletion-queue'),
    moderationActionsQueue: () => getQueue('moderation-actions-queue'),
    assetCleanupQueue: () => getQueue('asset-cleanup'),
    allQueues: () => queues,
};