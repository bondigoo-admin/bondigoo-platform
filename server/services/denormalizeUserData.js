// server/scripts/denormalizeUserData.js

const cron = require('node-cron');
const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Enrollment = require('../models/Enrollment');
const Review = require('../models/Review');
const { logger } = require('../utils/logger');

const calculateDenormalizedData = async () => {
  logger.info('[DenormalizeUserData] Starting data aggregation script...');
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const [
      ltvData,
      sessionData,
      enrollmentData,
      ratingData,
      disputeData,
      blockedByData,
    ] = await Promise.all([
      // 1. Lifetime Value (LTV)
      Payment.aggregate([
        { $match: { status: { $in: ['succeeded', 'completed'] } } },
        {
          $group: {
            _id: '$payer',
            ltvAmount: { $sum: '$amount.total' },
            currency: { $first: '$amount.currency' },
          },
        },
      ]).session(session),

      // 2. Total Sessions for Coaches
      Booking.aggregate([
        { $match: { isAvailability: false, status: { $in: ['completed', 'confirmed', 'scheduled'] } } },
        { $group: { _id: '$coach', totalSessions: { $sum: 1 } } },
      ]).session(session),

      // 3. Total Enrollments for Coaches
      Enrollment.aggregate([
        { $lookup: { from: 'programs', localField: 'program', foreignField: '_id', as: 'programDoc' } },
        { $unwind: '$programDoc' },
        { $group: { _id: '$programDoc.coach', totalEnrollments: { $sum: 1 } } },
      ]).session(session),
      
      // 4. Average Rating for Coaches
      Review.aggregate([
        { $match: { rateeModel: 'User' } },
        { $group: { _id: '$ratee', averageRating: { $avg: '$rating' } } },
      ]).session(session),
      
      // 5. Active Payment Disputes
      Payment.aggregate([
        { $match: { status: 'disputed' } },
        { $group: { _id: '$payer' } },
      ]).session(session),
      
      // 6. Blocked By Count
      User.aggregate([
        { $unwind: '$blockedUsers' },
        { $group: { _id: '$blockedUsers', blockedByCount: { $sum: 1 } } },
      ]).session(session),
    ]);

    const dataMap = new Map();

    // Helper to merge data into the map
    const mergeData = (source, key, value) => {
      for (const item of source) {
        if (item._id) {
          const userId = item._id.toString();
          if (!dataMap.has(userId)) dataMap.set(userId, {});
          dataMap.get(userId)[key] = value(item);
        }
      }
    };

    mergeData(ltvData, 'ltv', item => ({ amount: item.ltvAmount, currency: item.currency || 'CHF' }));
    mergeData(sessionData, 'totalSessions', item => item.totalSessions);
    mergeData(enrollmentData, 'totalEnrollments', item => item.totalEnrollments);
    mergeData(ratingData, 'averageRating', item => item.averageRating);
    mergeData(blockedByData, 'blockedByCount', item => item.blockedByCount);
    
    const disputedUserIds = new Set(disputeData.map(item => item._id.toString()));

    const bulkOps = [];
    
    // Reset fields for all users first to clear old data
    bulkOps.push({
        updateMany: {
            filter: {},
            update: {
                $set: {
                    'ltv.amount': 0,
                    totalSessions: 0,
                    totalEnrollments: 0,
                    averageRating: 0,
                    hasActiveDispute: false,
                    blockedByCount: 0
                }
            }
        }
    });

    for (const [userId, updates] of dataMap.entries()) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        if (disputedUserIds.has(userId)) {
          updates.hasActiveDispute = true;
        }
        bulkOps.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(userId) },
            update: { $set: updates },
          },
        });
      }
    }

    if (bulkOps.length > 1) { // Check if there's more than just the reset operation
      logger.info(`[DenormalizeUserData] Preparing to execute ${bulkOps.length - 1} user updates via bulkWrite.`);
      const result = await User.bulkWrite(bulkOps, { session });
      logger.info('[DenormalizeUserData] Bulk write completed successfully.', {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
    } else {
        logger.info('[DenormalizeUserData] No new data to update.');
    }

    await session.commitTransaction();
    logger.info('[DenormalizeUserData] Data aggregation and update script finished successfully.');

  } catch (error) {
    await session.abortTransaction();
    logger.error('[DenormalizeUserData] An error occurred during the script.', {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    session.endSession();
  }
};

// Schedule to run daily at 3:00 AM server time.
const scheduledJob = cron.schedule('0 3 * * *', calculateDenormalizedData, {
  scheduled: true,
  timezone: "Etc/UTC" // Or your server's timezone
});

logger.info('[DenormalizeUserData] Cron job scheduled to run daily at 3:00 AM UTC.');

module.exports = {
  calculateDenormalizedData,
  scheduledJob,
};

// To run this script manually for testing, you can add this to your main server file (e.g., app.js or server.js):
// const denormalizeScript = require('./scripts/denormalizeUserData');
// setTimeout(() => denormalizeScript.calculateDenormalizedData(), 5000); // Runs 5 seconds after server start