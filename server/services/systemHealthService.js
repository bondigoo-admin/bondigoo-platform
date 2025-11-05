const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { allQueues } = require('./jobQueueService');

const getHealth = async (redisClient) => {
  if (!redisClient) {
    logger.error('[SystemHealthService] Redis client was not provided.');
    throw new Error('Redis client is required for health check.');
  }

  try {
    const startDbTime = Date.now();
    await mongoose.connection.db.admin().ping();
    const dbLatency = Date.now() - startDbTime;

    const startRedisTime = Date.now();
    await redisClient.ping();
    const redisLatency = Date.now() - startRedisTime;
    const redisInfo = await redisClient.info('memory');
    const usedMemory = redisInfo.split('\r\n').find(line => line.startsWith('used_memory_human:')).split(':')[1];
    
    const queues = Object.entries(allQueues).map(([name, queue]) => ({ name, queue }));

    const queueDetails = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
        return { name, ...counts };
      })
    );

    return {
      database: { status: 'connected', latencyMs: dbLatency },
      redis: { status: 'connected', latencyMs: redisLatency, memoryUsed: usedMemory },
      jobQueues: {
        status: queueDetails.some(q => q.failed > 0) ? 'degraded' : 'healthy',
        queues: queueDetails,
      },
    };
  } catch (error) {
    logger.error('Error fetching system health in service:', error);
    return { 
      database: { status: 'disconnected', error: error.message },
      redis: { status: 'disconnected', error: error.message },
      jobQueues: { status: 'unknown', error: error.message },
    };
  }
};

module.exports = { getHealth };