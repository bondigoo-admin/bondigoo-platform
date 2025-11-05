const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const User = require('../models/User');
const Review = require('../models/Review');
const Payment = require('../models/Payment');
const Coach = require('../models/Coach');

const calculateTrustScores = async () => {
    if (!process.env.MONGODB_URI) {
        console.error('ERROR: MONGODB_URI is not defined.');
        process.exit(1);
    }

    let mongoConnection;
    try {
        mongoConnection = await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected. Starting trust score calculation...');

        const users = await User.find({}).select('_id email createdAt isEmailVerified blockedByCount');
        const bulkOps = [];

        for (const user of users) {
            let score = 100; // Start with the baseline score

            // --- POSITIVE FACTORS ---
            if (user.isEmailVerified) score += 5;

            const coachProfile = await Coach.findOne({ user: user._id }).select('settings.paymentAndBilling.stripe.accountStatus.status').lean();
            if (coachProfile?.settings?.paymentAndBilling?.stripe?.accountStatus?.status === 'active') {
                score += 10;
            }

            const successfulTransactions = await Payment.countDocuments({
                status: { $in: ['completed', 'succeeded'] },
                $or: [{ payer: user._id }, { recipient: user._id }]
            });
            score += Math.min(successfulTransactions, 20); // Capped at +20

            const positiveReviews = await Review.countDocuments({
                $or: [{ rateeId: user._id }, { ratee: user._id, rateeModel: 'User' }],
                rating: { $in: [4, 5] }
            });
            score += Math.min(positiveReviews * 2, 30); // Capped at +30

            const accountAgeMonths = (new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24 * 30.44);
            score += Math.min(Math.floor(accountAgeMonths / 6) * 5, 20); // Capped at +20

            // --- NEGATIVE FACTORS ---
            const upheldReportsAgainst = await Review.countDocuments({ raterId: user._id, 'flags.status': 'resolved_hidden' });
            score -= upheldReportsAgainst * 15;
            
            const dismissedReportsBy = await Review.countDocuments({ 'flags.flaggedBy': user._id, 'flags.status': 'resolved_dismissed' });
            score -= dismissedReportsBy * 5;

            score -= (user.blockedByCount || 0) * 2;

            const disputes = await Payment.countDocuments({ status: 'disputed', $or: [{ payer: user._id }, { recipient: user._id }] });
            score -= disputes * 25;
            
            const clampedScore = Math.max(0, Math.min(score, 100));

            bulkOps.push({
                updateOne: {
                    filter: { _id: user._id },
                    update: { $set: { trustScore: clampedScore } }
                }
            });
        }

        if (bulkOps.length > 0) {
            console.log(`Updating trust scores for ${bulkOps.length} users...`);
            await User.bulkWrite(bulkOps);
            console.log('Trust scores updated successfully.');
        } else {
            console.log('No users found to update.');
        }
    } catch (err) {
        console.error('An error occurred during trust score calculation:', err);
    } finally {
        if (mongoConnection) {
            await mongoose.disconnect();
            console.log('MongoDB disconnected.');
        }
    }
};

if (require.main === module) {
    calculateTrustScores();
}

module.exports = calculateTrustScores;