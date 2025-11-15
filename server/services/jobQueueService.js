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

const queueDefinitions = [
    { name: 'live-session-jobs', processor: require('./processors/liveSessionProcessor') },
    { name: 'status-reset-jobs', processor: require('./processors/statusResetProcessor') },
    { name: 'account-cleanup-queue', processor: require('./processors/accountCleanupProcessor') },
    { name: 'user-data-deletion-queue', processor: require('./processors/userDataDeletionProcessor') },
    { name: 'moderation-actions-queue', processor: require('./processors/moderationActionsProcessor') },
    { name: 'asset-cleanup', processor: assetCleanupWorkerProcessor },
    { name: 'email-queue', processor: require('./processors/emailProcessor') }
];

const initializeQueues = () => {
    console.log('[BullMQ] Initializing Job Queues for API Server...', { prefix: environmentPrefix });

    const defaultJobOptions = {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
    };
    
    const emailJobOptions = { ...defaultJobOptions, attempts: 5, backoff: { type: 'exponential', delay: 5000 }};

    for (const def of queueDefinitions) {
        if (!queues[def.name]) {
            const prefixedName = getQueueName(def.name);
            console.log(`[BullMQ] Registering queue: ${prefixedName}`);
            const options = def.name === 'email-queue' ? emailJobOptions : defaultJobOptions;
            queues[def.name] = new Queue(prefixedName, { connection, defaultJobOptions: options });
        }
    }
    console.log('[BullMQ] All Queues have been initialized.');
};

const startWorkers = (socketIoInstance) => {
    io = socketIoInstance;
    console.log('[BullMQ] Starting all Job Queue Workers...', { prefix: environmentPrefix });

    const workerOptions = {
        connection,
        concurrency: 5,
    };
    
    initializeQueues();

    for (const def of queueDefinitions) {
        const prefixedName = getQueueName(def.name);
        const worker = new Worker(prefixedName, def.processor, workerOptions);
        
        worker.on('active', (job) => {
            console.log(`[BullMQ-WORKER] Job ${job?.name}:${job?.id} ACTIVE in queue ${prefixedName}.`);
        });

        worker.on('completed', (job) => {
            console.log(`[BullMQ-WORKER] Job ${job?.name}:${job?.id} in queue ${prefixedName} completed.`);
            broadcastQueueUpdate();
        });

        worker.on('failed', (job, err) => {
            logger.error(`[BullMQ-WORKER] Job ${job?.name}:${job?.id} in queue ${prefixedName} failed.`, { error: err.message, stack: err.stack, data: job?.data });
            broadcastQueueUpdate();
        });

        workers.push(worker);
    }
};

const getQueue = (name) => {
    if (Object.keys(queues).length === 0) {
        initializeQueues();
    }
    const queue = queues[name];
    if (!queue) {
        throw new Error(`Queue "${name}" is not defined. Available queues: ${Object.keys(queues).join(', ')}`);
    }
    return queue;
};

module.exports = {
    initializeQueues,
    startWorkers,
    liveSessionQueue: () => getQueue('live-session-jobs'),
    statusResetQueue: () => getQueue('status-reset-jobs'),
    accountCleanupQueue: () => getQueue('account-cleanup-queue'),
    userDataDeletionQueue: () => getQueue('user-data-deletion-queue'),
    moderationActionsQueue: () => getQueue('moderation-actions-queue'),
    assetCleanupQueue: () => getQueue('asset-cleanup'),
    emailQueue: () => getQueue('email-queue'),
    allQueues: () => queues,
};