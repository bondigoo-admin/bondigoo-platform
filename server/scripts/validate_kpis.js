const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// --- 1. SETUP: Load Environment & Models ---
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Coach = require('../models/Coach');
const Booking = require('../models/Booking');
const Enrollment = require('../models/Enrollment');
const Review = require('../models/Review');
const SupportTicket = require('../models/SupportTicket');

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined. Please ensure your .env file is configured correctly.');
  process.exit(1);
}

// --- 2. CONFIGURATION: Set the date range for validation ---
const startDateString = "2025-09-17T00:24:10.088Z";
const endDateString = "2025-09-17T23:24:10.088Z";

const validateKPIs = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);
    
    console.log(`\nRUNNING KPI VALIDATION SCRIPT`);
    console.log(`Time Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

    const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };
    const bookingDateFilter = { start: { $gte: startDate, $lte: endDate } };
    
    // --- 3. EXECUTION: Run all database queries in parallel ---

    // --- START ENHANCED FINANCIAL LOGGING ---
    const financialTransactions = await Payment.find({
        ...dateFilter,
        status: { $in: ['completed', 'succeeded'] },
        type: { $in: ['charge', 'program_purchase', 'live_session_charge', 'overtime_charge'] }
    }).select('_id amount.total amount.platformFee type createdAt').lean();

    const paymentStats = financialTransactions.reduce((acc, tx) => {
        acc.grossTransactionVolume += tx.amount.total || 0;
        acc.netPlatformRevenue += tx.amount.platformFee || 0;
        acc.totalTransactions += 1;
        return acc;
    }, { grossTransactionVolume: 0, netPlatformRevenue: 0, totalTransactions: 0 });
    // --- END ENHANCED FINANCIAL LOGGING ---

    const [
      userStats,
      coachStats,
      disputeCount,
      reviewStats,
      bookingStats,
      enrollmentCount,
      payoutStats,
      openSupportTickets
    ] = await Promise.all([
      User.countDocuments(dateFilter),
      Coach.aggregate([ { $match: dateFilter }, { $group: { _id: "$status", count: { $sum: 1 } } } ]),
      Payment.countDocuments({ status: 'disputed', ...dateFilter }),
      Review.countDocuments({ ...dateFilter, 'flags.0': { $exists: true } }),
      Booking.aggregate([ { $match: { ...bookingDateFilter, isAvailability: false } }, { $group: { _id: null, totalSessionsBooked: { $sum: 1 }, completedSessions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } }} ]),
      Enrollment.countDocuments(dateFilter),
      Transaction.aggregate([ { $match: { type: 'payout', status: 'succeeded', ...dateFilter } }, { $group: { _id: null, totalPayouts: { $sum: '$amount' } } } ]),
      SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } })
    ]);
    
    // --- 4. REPORTING: Format and display the results ---
    const bStats = bookingStats[0] || { totalSessionsBooked: 0, completedSessions: 0 };
    const coachStatusCounts = coachStats.reduce((acc, curr) => ({...acc, [curr._id]: curr.count }), {});
    
    const validationOutput = {
      "__INFO__": "Compare these values directly with your dashboard.",
      "Timeframe": { "Start": startDate.toISOString(), "End": endDate.toISOString() },
      "FINANCIAL KPIs": {
        "Gross Transaction Volume (GTV)": paymentStats.grossTransactionVolume.toFixed(2),
        "Net Platform Revenue": paymentStats.netPlatformRevenue.toFixed(2),
        "Average Transaction Value": (paymentStats.totalTransactions > 0 ? (paymentStats.grossTransactionVolume / paymentStats.totalTransactions) : 0).toFixed(2),
        "Total Payouts": (payoutStats[0]?.totalPayouts || 0).toFixed(2),
        "__DETAILS__": {
            "Counted Transactions": paymentStats.totalTransactions,
            "Included Payment Records": financialTransactions.map(tx => ({
                _id: tx._id,
                type: tx.type,
                total: tx.amount.total,
                platformFee: tx.amount.platformFee,
                createdAt: tx.createdAt
            }))
        }
      },
      "USER & ACTIVITY KPIs": {
        "New User Signups": userStats,
        "New Coach Signups": (coachStatusCounts.active || 0) + (coachStatusCounts.pending || 0),
        "Total Sessions Booked": bStats.totalSessionsBooked,
        "Completed Sessions": bStats.completedSessions,
        "Total Enrollments": enrollmentCount,
      },
      "MODERATION & SUPPORT KPIs": {
        "Flagged Reviews": reviewStats,
        "Open Support Tickets (Total)": openSupportTickets,
      },
      "POTENTIALLY MISLEADING KPIs (Validation)": {
        "Pending Coach Applications": {
          "Dashboard Logic (New in timeframe)": coachStatusCounts.pending || 0,
          "Recommended Logic (Total pending)": await Coach.countDocuments({ status: 'pending' }),
        },
        "Open Payment Disputes": {
          "Dashboard Logic (New in timeframe)": disputeCount,
          "Recommended Logic (Total open)": await Payment.countDocuments({ status: 'disputed' }),
        },
      }
    };
    
    console.log(JSON.stringify(validationOutput, null, 2));

  } catch (error) {
    console.error('\n--- SCRIPT FAILED ---');
    console.error('An error occurred during validation:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

validateKPIs();