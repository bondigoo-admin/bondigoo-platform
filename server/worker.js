
require('dotenv').config({
  path: require('path').resolve(__dirname, `.env.${process.env.NODE_ENV || 'development'}`)
});

const { initializeI18next } = require('./config/i18n');
const connectDB = require('./dbConnect');
const jobQueueService = require('./services/jobQueueService');
const { logger } = require('./utils/logger');

console.log('--- [WORKER_PROCESS] SANITY CHECK ---');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`ENVIRONMENT_NAME: ${process.env.ENVIRONMENT_NAME}`);
console.log(`REDIS_URL provided: ${!!process.env.REDIS_URL}`);
console.log(`MAILJET_API_KEY provided: ${!!process.env.MAILJET_API_KEY}`);
console.log('------------------------------------');

const startWorkerProcess = async () => {
  try {
    console.log('[WORKER_PROCESS] Starting background worker process...');
    
    await initializeI18next();
    console.log('[WORKER_PROCESS] i18next initialized.');

    await connectDB();
    console.log('[WORKER_PROCESS] MongoDB connection established.');

    jobQueueService.startWorkers();
    
    console.log('----------------------------------------------------');
    console.log('✅ All background workers are running and waiting for jobs.');
    console.log('----------------------------------------------------');

  } catch (error) {
    logger.error('💥 FATAL: Failed to start the worker process.', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

startWorkerProcess();