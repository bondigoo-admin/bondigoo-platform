require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const { processPendingPayouts } = require('./services/payoutProcessor');
const { logger } = require('./utils/logger');

const run = async () => {
  console.log('[Manual Trigger] Connecting to database...');
  try {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI must be set in your .env file.');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Manual Trigger] Database connected. Starting payout job...');
    
    await processPendingPayouts();
    
    console.log('[Manual Trigger] Payout job finished.');
  } catch (error) {
    logger.error('[Manual Trigger] An error occurred:', { error: error.message, stack: error.stack });
  } finally {
    await mongoose.disconnect();
    console.log('[Manual Trigger] Database disconnected.');
    process.exit(0);
  }
};

run();