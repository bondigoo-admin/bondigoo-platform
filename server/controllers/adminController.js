const mongoose = require('mongoose');
const cloudinary = require('../utils/cloudinaryConfig');
const User = require('../models/User');
const Coach = require('../models/Coach');
const Client = require('../models/Client');
const Specialty = require('../models/Specialty');
const Language = require('../models/Language');
const EducationLevel = require('../models/EducationLevel');
const CoachingStyle = require('../models/CoachingStyle');
const SessionType = require('../models/SessionType');
const Package = require('../models/Package');
const Resource = require('../models/Resource');
const Achievement = require('../models/Achievement');
const Notification = require('../models/Notification');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Translation = require('../models/Translation');
const Invoice = require('../models/Invoice');
const paymentService = require('../services/paymentService'); 
const UnifiedNotificationService = require('../services/unifiedNotificationService'); 
const { NotificationTypes, NotificationCategories, NotificationPriorities, NotificationChannels } = require('../utils/notificationHelpers'); 
const { logger } = require('../utils/logger'); 
const PolicyEngine = require('../utils/policyEngine');
const Program = require('../models/Program');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const WebhookLog = require('../models/WebhookLog');
const jwt = require('jsonwebtoken'); 
const config = require('../config');
const Discount = require('../models/Discount');
const DiscountUsage = require('../models/DiscountUsage');
const Enrollment = require('../models/Enrollment');
const SupportTicket = require('../models/SupportTicket');
const Lead = require('../models/Lead');
const AdminFinancialService = require('../services/adminFinancialService');
const refundRequestService = require('../services/refundRequestService');
const settlementAdviceService = require('../services/settlementAdviceService');
const {
  liveSessionQueue,
  statusResetQueue,
  accountCleanupQueue,
  userDataDeletionQueue,
  moderationActionsQueue,
} = require('../services/jobQueueService');
const paymentController = require('./paymentController');
const cacheService = require('../services/cacheService');
const systemHealthService = require('../services/systemHealthService');
const { getSocketService } = require('../services/socketService');

const listTypes = [
  'specialties',
  'languages',
  'educationLevels',
  'coachingStyles',
  'sessionTypes',
];

const getModelForListType = (listType) => {
  switch (listType) {
    case 'specialties': return Specialty;
    case 'languages': return Language;
    case 'educationLevels': return EducationLevel;
    case 'coachingStyles': return CoachingStyle;
    case 'sessionTypes': return SessionType;
    default: throw new Error(`Invalid list type: ${listType}`);
  }
};

exports.getListTypes = async (req, res) => {
  res.json(listTypes);
};

exports.getUserRoles = (req, res) => {
    try {
        const roles = User.schema.path('role').enumValues;
        res.json(roles);
    } catch (error) {
        logger.error('Error fetching user roles:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};


exports.getListItems = async (req, res) => {
  try {
    const { listType } = req.params;
    const { page = 1, limit = 10, searchTerm = '', sortField = 'name', sortOrder = 'asc', includeUsageStats = 'false' } = req.query;

    const Model = getModelForListType(listType);

    const filter = searchTerm ? { name: { $regex: searchTerm, $options: 'i' } } : {};
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

    const items = await Model.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
      .exec();

    const count = await Model.countDocuments(filter);
    
    if (includeUsageStats === 'true' && items.length > 0) {
        const usagePromises = items.map(async (item) => {
            let usageCount = 0;
            const itemId = item._id;
            try {
                switch (listType) {
                    case 'specialties':
                        usageCount = await Coach.countDocuments({ specialties: itemId });
                        break;
                    case 'languages':
                        usageCount = await Coach.countDocuments({ 'languages.language': itemId });
                        break;
                    case 'educationLevels':
                        usageCount = await Coach.countDocuments({ educationLevels: itemId });
                        break;
                    case 'coachingStyles':
                        usageCount = await Coach.countDocuments({ coachingStyles: itemId });
                        break;
                    case 'achievements':
                        usageCount = await Coach.countDocuments({ achievements: itemId });
                        break;
                    case 'sessionTypes':
                        usageCount = await Booking.countDocuments({ sessionType: itemId });
                        break;
                    case 'programCategories':
                        usageCount = await Program.countDocuments({ category: itemId });
                        break;
                }
            } catch (e) {
                logger.error(`Failed to get usage count for ${listType} item ${itemId}`, e);
            }
            item.usageCount = usageCount;
            return item;
        });
        await Promise.all(usagePromises);
    }

    res.json({
      items,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalItems: count,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.bulkDeleteListItems = async (req, res) => {
  try {
    const { listType } = req.params;
    const { itemIds } = req.body;
    const Model = getModelForListType(listType);
    console.log(`Attempting to delete ${itemIds.length} items from ${listType}`);
    const result = await Model.deleteMany({ _id: { $in: itemIds } });
    console.log(`Deleted ${result.deletedCount} items from ${listType}`);
    if (result.deletedCount !== itemIds.length) {
      console.warn(`Mismatch in delete count. Requested: ${itemIds.length}, Deleted: ${result.deletedCount}`);
    }
    res.json({ message: `${result.deletedCount} items deleted successfully` });
  } catch (error) {
    console.error('Error in bulkDeleteListItems:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.addListItem = async (req, res) => {
  try {
    const { listType } = req.params;
    console.log(`Adding item to ${listType}. Request body:`, req.body);

    const Model = getModelForListType(listType);
    const newItem = new Model(req.body);

    console.log(`New ${listType} item created:`, newItem);

    await newItem.save();
    console.log(`${listType} item saved successfully:`, newItem);

    res.status(201).json(newItem);
  } catch (error) {
    console.error(`Error adding ${req.params.listType} item:`, error);
    res.status(400).json({ message: error.message });
  }
};

exports.updateListItem = async (req, res) => {
  try {
    const { listType, id } = req.params;
    const Model = getModelForListType(listType);
    console.log(`Attempting to update item ${id} in ${listType}`);
    const updatedItem = await Model.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedItem) {
      console.log(`Item ${id} not found in ${listType}`);
      return res.status(404).json({ message: 'Item not found' });
    }
    console.log(`Successfully updated item ${id} in ${listType}`);
    res.json(updatedItem);
  } catch (error) {
    console.error('Error in updateListItem:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteListItem = async (req, res) => {
  try {
    const { listType, id } = req.params;
    const Model = getModelForListType(listType);
    console.log(`Attempting to delete item ${id} from ${listType}`);
    const deletedItem = await Model.findByIdAndDelete(id);
    if (!deletedItem) {
      console.log(`Item ${id} not found in ${listType}`);
      return res.status(404).json({ message: 'Item not found' });
    }
    console.log(`Successfully deleted item ${id} from ${listType}`);
    res.json({ message: 'Item deleted successfully', deletedItem });
  } catch (error) {
    console.error('Error in deleteListItem:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    console.log('[adminController.getUsers] Received request with filters:', req.query);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';
    const countryCode = req.query.countryCode || '';
    const sortField = req.query.sortField || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const userIds = req.query.userIds;

    const preferredLanguage = req.query.preferredLanguage || '';
    const isEmailVerified = req.query.isEmailVerified || '';
    const minTrust = req.query.minTrust;
    const maxTrust = req.query.maxTrust;
    const minBlockedByCount = req.query.minBlockedByCount;
    const stripeStatus = req.query.stripeStatus || '';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const lastLoginStartDate = req.query.lastLoginStartDate;
    const lastLoginEndDate = req.query.lastLoginEndDate;
    const minProfileCompleteness = req.query.minProfileCompleteness;
    const maxProfileCompleteness = req.query.maxProfileCompleteness;
    const minSessions = req.query.minSessions;
    const maxSessions = req.query.maxSessions;
    const minEnrollments = req.query.minEnrollments;
    const maxEnrollments = req.query.maxEnrollments;
    const hasDispute = req.query.hasDispute || '';

    let query = {};
    const sort = { [sortField]: sortOrder };

    const andConditions = [];

    if (userIds) {
        const userIdArray = Array.isArray(userIds) ? userIds : [userIds];
        if (userIdArray.length > 0) {
            andConditions.push({ 
                _id: { 
                    $in: userIdArray
                        .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null)
                        .filter(id => id) 
                } 
            });
        }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      andConditions.push({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
        ]
      });
    }

    if (role) {
      andConditions.push({ role: role });
    }

    if (countryCode) {
      andConditions.push({ 'billingDetails.address.country': countryCode });
    }

      if (preferredLanguage) {
      andConditions.push({ preferredLanguage });
    }

     if (isEmailVerified) {
      andConditions.push({ isEmailVerified: isEmailVerified === 'true' });
    }

    if (hasDispute) {
      andConditions.push({ hasActiveDispute: hasDispute === 'true' });
    }

     if (minTrust !== undefined && maxTrust !== undefined) {
      const parsedMinTrust = parseInt(minTrust, 10);
      const parsedMaxTrust = parseInt(maxTrust, 10);
      if (parsedMinTrust > 0 || parsedMaxTrust < 100) {
        andConditions.push({ trustScore: { $gte: parsedMinTrust, $lte: parsedMaxTrust } });
      }
    }

     if (minBlockedByCount) {
      andConditions.push({ blockedByCount: { $gte: parseInt(minBlockedByCount, 10) } });
    }

       if (startDate && endDate) {
      andConditions.push({ createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } });
    }

    if (lastLoginStartDate && lastLoginEndDate) {
      andConditions.push({ lastLogin: { $gte: new Date(lastLoginStartDate), $lte: new Date(lastLoginEndDate) } });
    }

    if (minProfileCompleteness !== undefined && maxProfileCompleteness !== undefined) {
      const parsedMinComp = parseInt(minProfileCompleteness, 10);
      const parsedMaxComp = parseInt(maxProfileCompleteness, 10);
      if (parsedMinComp > 0 || parsedMaxComp < 100) {
          andConditions.push({ profileCompleteness: { $gte: parsedMinComp, $lte: parsedMaxComp } });
      }
    }
    
    if (stripeStatus) {
        const coachesWithStripe = await Coach.find({ 'settings.paymentAndBilling.stripe.accountStatus.status': stripeStatus === 'connected' ? 'active' : { $ne: 'active' } }).select('user').lean();
        const coachUserIds = coachesWithStripe.map(c => c.user);
        andConditions.push({ _id: { $in: coachUserIds } });
    }

    if (status) {
      if (status === 'suspended') {
        const inactiveCoaches = await Coach.find({ status: 'inactive' }).select('user').lean();
        const inactiveCoachUserIds = inactiveCoaches.map(c => c.user);
        andConditions.push({
          $or: [
            { isActive: false },
            { _id: { $in: inactiveCoachUserIds } }
          ]
        });
      } else if (status === 'active') {
        const nonActiveCoaches = await Coach.find({ status: { $ne: 'active' } }).select('user').lean();
        const nonActiveCoachUserIds = nonActiveCoaches.map(c => c.user);
        andConditions.push({ isActive: true });
        andConditions.push({ _id: { $nin: nonActiveCoachUserIds } });
      } else if (status === 'pending') {
        const pendingCoaches = await Coach.find({ status: 'pending' }).select('user').lean();
        const pendingCoachUserIds = pendingCoaches.map(c => c.user);
        andConditions.push({ role: 'coach' });
        andConditions.push({ _id: { $in: pendingCoachUserIds } });
      }
    }

    if (andConditions.length > 0) {
      query = { $and: andConditions };
    }
    
    console.log('[adminController.getUsers] Constructed MongoDB query:', JSON.stringify(query, null, 2));

    const postAggAndConditions = [];
if (minSessions || maxSessions) {
    const sessionConditions = {};
    if (minSessions) sessionConditions.$gte = parseInt(minSessions, 10);
    if (maxSessions) sessionConditions.$lte = parseInt(maxSessions, 10);
    postAggAndConditions.push({ totalSessions: sessionConditions });
}
if (minEnrollments || maxEnrollments) {
    const enrollmentConditions = {};
    if (minEnrollments) enrollmentConditions.$gte = parseInt(minEnrollments, 10);
    if (maxEnrollments) enrollmentConditions.$lte = parseInt(maxEnrollments, 10);
    postAggAndConditions.push({ totalEnrollments: enrollmentConditions });
}

let pipeline = [];

 if (role === 'coach' || stripeStatus || true) { // Changed to true to always join for stripe status column
    pipeline.push({
        $lookup: {
            from: 'coaches',
            localField: '_id',
            foreignField: 'user',
            as: 'coachProfile'
        }
    });
    pipeline.push({ $unwind: { path: '$coachProfile', preserveNullAndEmptyArrays: true } });

    if (stripeStatus === 'connected') {
        pipeline.push({ $match: { 'coachProfile.settings.paymentAndBilling.stripe.accountStatus.status': 'active' } });
    } else if (stripeStatus === 'not_connected') {
        pipeline.push({ $match: { $or: [ { 'coachProfile.settings.paymentAndBilling.stripe.accountStatus.status': { $ne: 'active' } }, { 'coachProfile.settings.paymentAndBilling.stripe.accountStatus.status': { $exists: false } } ] } });
    }
}

    const countPipeline = [...pipeline, ...(postAggAndConditions.length > 0 ? [{ $match: { $and: postAggAndConditions } }] : []), { $count: 'totalUsers' }];
const count = (await User.aggregate(countPipeline))[0]?.totalUsers || 0;
    
    
    pipeline.push({ $match: query });

    pipeline.push({
        $lookup: {
            from: 'payments',
            let: { userId: '$_id' },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $and: [
                                { $in: ['$status', ['completed', 'succeeded']] },
                                {
                                    $or: [
                                        { $eq: ['$payer', '$$userId'] },
                                        { $eq: ['$recipient', '$$userId'] }
                                    ]
                                }
                            ]
                        }
                    }
                },
                { $project: { amount: '$amount.total', currency: '$amount.currency', payer: '$payer', recipient: '$recipient' } }
            ],
            as: 'paymentData'
        }
    });

    pipeline.push({
        $lookup: {
            from: 'reviews',
            let: { userId: '$_id' },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $or: [
                                { $eq: ['$rateeId', '$$userId'] },
                                { $and: [ { $eq: ['$ratee', '$$userId'] }, { $eq: ['$rateeModel', 'User'] } ] }
                            ]
                        }
                    }
                },
                { $project: { rating: 1 } }
            ],
            as: 'reviewData'
        }
    });

    pipeline.push({
        $lookup: {
            from: 'bookings',
            let: { userId: '$_id' },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $and: [
                                { $eq: ['$coach', '$$userId'] },
                                { $eq: ['$isAvailability', false] },
                                { $in: ['$status', ['completed', 'confirmed', 'scheduled']] }
                            ]
                        }
                    }
                }
            ],
            as: 'sessionData'
        }
    });
    
    pipeline.push({
        $lookup: {
            from: 'programs',
            let: { userId: '$_id' },
            pipeline: [
                { $match: { $expr: { $eq: ['$coach', '$$userId'] } } },
                { $project: { _id: 1 } }
            ],
            as: 'coachPrograms'
        }
    });

    pipeline.push({
        $lookup: {
            from: 'enrollments',
            let: { programIds: '$coachPrograms._id' },
            pipeline: [
                { $match: { $expr: { $in: ['$program', '$$programIds'] } } }
            ],
            as: 'enrollmentData'
        }
    });
    
    pipeline.push({
        $addFields: {
            ltv: {
                $let: {
                    vars: {
                        clientPayments: { $filter: { input: '$paymentData', as: 'payment', cond: { $eq: ['$$payment.payer', '$_id'] } } },
                        coachEarnings: { $filter: { input: '$paymentData', as: 'payment', cond: { $eq: ['$$payment.recipient', '$_id'] } } }
                    },
                    in: {
                        $cond: {
                            if: { $eq: ['$role', 'coach'] },
                            then: {
                                amount: { $ifNull: [{ $sum: '$$coachEarnings.amount' }, 0] },
                                currency: { $ifNull: [ { $first: '$$coachEarnings.currency' }, 'CHF' ] }
                            },
                            else: {
                                amount: { $ifNull: [{ $sum: '$$clientPayments.amount' }, 0] },
                                currency: { $ifNull: [ { $first: '$$clientPayments.currency' }, 'CHF' ] }
                            }
                        }
                    }
                }
            },
            averageRating: {
                $cond: {
                    if: { $eq: ['$role', 'coach'] },
                    then: { $ifNull: [{ $avg: '$reviewData.rating' }, 0] },
                    else: null
                }
            },
            totalSessions: {
                $cond: {
                    if: { $eq: ['$role', 'coach'] },
                    then: { $ifNull: [{ $size: '$sessionData' }, 0] },
                    else: null
                }
            },
            totalEnrollments: {
                $cond: {
                    if: { $eq: ['$role', 'coach'] },
                    then: { $ifNull: [{ $size: '$enrollmentData' }, 0] },
                    else: null
                }
            }
        }
    });

    if (postAggAndConditions.length > 0) {
    pipeline.push({ $match: { $and: postAggAndConditions } });
    console.log('[adminController.getUsers] Constructed MongoDB post-aggregation query:', JSON.stringify({ $and: postAggAndConditions }, null, 2));
}
    
    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

pipeline.push({
    $project: {
        firstName: 1, lastName: 1, email: 1, role: 1, isActive: 1,
        isEmailVerified: 1, profilePicture: 1, ltv: 1, trustScore: 1,
        lastLogin: 1, createdAt: 1, averageRating: 1, profileCompleteness: 1,
        totalSessions: 1, totalEnrollments: 1, hasActiveDispute: 1, blockedByCount: 1,
        billingDetails: 1,
        usersTheyHaveBlocked: 1,
        flaggedReviewsAuthored: 1,
        warningCount: '$moderation.warningsCount',
        stripeStatus: {
            $cond: {
                if: { $eq: ['$coachProfile.settings.paymentAndBilling.stripe.accountStatus.status', 'active'] },
                then: 'connected',
                else: 'not_connected'
            }
        },
        isTopCoach: '$coachProfile.isTopCoach'
    }
});
    
    const users = await User.aggregate(pipeline);
    
    console.log(`[adminController.getUsers] Found ${count} total users. Returning page ${page} with ${users.length} users.`);
    if (users.length > 0) {
        console.log('[adminController.getUsers] Sample user record being returned:', {
            _id: users[0]._id,
            firstName: users[0].firstName,
            email: users[0].email,
            role: users[0].role,
            isActive: users[0].isActive,
            lastLogin: users[0].lastLogin,
            ltv: users[0].ltv,
            averageRating: users[0].averageRating,
            totalSessions: users[0].totalSessions,
        });
    }

    res.json({
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalUsers: count,
    });
  } catch (err) {
    logger.error('[adminController.getUsers] Critical error fetching users', { 
        error: err.message, 
        stack: err.stack,
        query: req.query
    });
    res.status(500).send('Server Error');
  }
};

exports.updateCoachByAdmin = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isTopCoach } = req.body;
        const adminUserId = req.user.id;
        
        const coach = await Coach.findOne({ user: userId });
        if (!coach) {
            return res.status(404).json({ message: 'Coach profile not found for this user.' });
        }

        const updateData = {};
        if (typeof isTopCoach !== 'undefined' && coach.isTopCoach !== isTopCoach) {
            updateData.isTopCoach = isTopCoach;
        }

        if (Object.keys(updateData).length > 0) {
            const updatedCoach = await Coach.findOneAndUpdate({ user: userId }, { $set: updateData }, { new: true });
            
            await AuditLog.create({
                adminUserId,
                targetUserId: userId,
                action: isTopCoach ? 'feature_coach' : 'unfeature_coach'
            });

            res.json(updatedCoach);
        } else {
            res.json(coach);
        }
    } catch (error) {
        logger.error('Error updating coach by admin:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getUniqueUserCountries = async (req, res) => {
    try {
        const countries = await User.distinct('billingDetails.address.country');
        const validCountries = countries.filter(country => country);
        res.json(validCountries.sort());
    } catch (error) {
        logger.error('Error fetching unique user countries:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({ msg: 'User removed successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getAllCoaches = async (req, res) => {
  try {
    const coaches = await Coach.find().populate('user', ['firstName', 'lastName', 'email']);
    res.json(coaches);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getCoachById = async (req, res) => {
  try {
    const coach = await Coach.findById(req.params.id).populate('user', '-password');
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    res.json(coach);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    res.status(500).send('Server Error');
  }
};

exports.updateCoachStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const coach = await Coach.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    
    res.json(coach);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getSystemStats = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const coachCount = await Coach.countDocuments();
    // Add other stats as needed
    res.json({
      userCount,
      coachCount,
      // Include other stats here
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getRecentActivity = async (req, res) => {
  try {
    // Implement recent activity logic here
    res.json({ message: 'Recent activity functionality to be implemented' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.reorderListItems = async (req, res) => {
  try {
    const { listType } = req.params;
    const { itemId, newIndex } = req.body;
    const Model = getModelForListType(listType);

    const items = await Model.find().sort({ order: 1 });
    const item = items.find(i => i._id.toString() === itemId);
    const oldIndex = items.indexOf(item);

    items.splice(oldIndex, 1);
    items.splice(newIndex, 0, item);

    for (let i = 0; i < items.length; i++) {
      items[i].order = i;
      await items[i].save();
    }

    res.json({ message: 'Items reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.importListItems = async (req, res) => {
  try {
    const { listType } = req.params;
    const { items } = req.body;
    const Model = getModelForListType(listType);

    const importedItems = await Model.insertMany(items);
    res.json({ message: 'Items imported successfully', importedItems });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTranslations = async (req, res) => {
  try {
    const { listType } = req.params;
    const { language } = req.query;

    console.log(`Fetching translations for ${listType} in ${language}`);

    let Model;
    switch (listType) {
      case 'specialties':
        Model = Specialty;
        break;
      case 'languages':
        Model = Language;
        break;
      case 'sessionTypes':
        Model = SessionType;
        break;
      // ... add cases for other list types
      default:
        return res.status(400).json({ message: 'Invalid list type' });
    }
    const items = await Model.find();
    console.log(`Found ${items.length} items for ${listType}`);

    const translationKeys = items.map(item => `${listType}_${item._id}`);
    const translations = await Translation.find({ key: { $in: translationKeys } });
    console.log('Translation keys being searched:', translationKeys);
    console.log('Found translations:', translations);

    console.log(`Found ${translations.length} translations for ${items.length} items`);

    const formattedTranslations = {};
    items.forEach(item => {
      const key = `${listType}_${item._id}`;
      const translation = translations.find(t => t.key === key);
      formattedTranslations[key] = {
        original: item.name,
        translation: translation ? translation.translations.get(language) || '' : ''
      };
    });

    console.log('Formatted translations:', formattedTranslations);

    res.json({ translations: formattedTranslations });
  } catch (err) {
    console.error('Error in getTranslations:', err);
    res.status(500).json({ message: 'Server error', translations: {} });
  }
};

exports.addTranslation = async (req, res) => {
  try {
    const { key, language, translation } = req.body;
    let translationDoc = await Translation.findOne({ key });
    if (!translationDoc) {
      translationDoc = new Translation({ key, translations: new Map() });
    }
    translationDoc.translations.set(language, translation);
    await translationDoc.save();
    res.json(translationDoc);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.updateTranslation = async (req, res) => {
  try {
    const { listType, key } = req.params;
    const { language, translation } = req.body;

    console.log(`Updating translation for listType: ${listType}, key: ${key}, language: ${language}`);

    let translationDoc = await Translation.findOne({ key: `${listType}_${key}` });
    if (!translationDoc) {
      translationDoc = new Translation({ key: `${listType}_${key}`, listType, translations: new Map() });
    }

    translationDoc.translations.set(language, translation.trim());
    await translationDoc.save();

    console.log(`Translation updated successfully for key: ${key}`);
    res.json(translationDoc);
  } catch (err) {
    console.error('Error in updateTranslation:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getTranslationOverview = async (req, res) => {
  try {
    console.log('Starting getTranslationOverview');
    const languages = ['en', 'de', 'fr', 'es'];
    const overview = {};

    for (const listType of listTypes) {
      console.log(`Processing listType: ${listType}`);
      let Model;
      try {
        Model = getModelForListType(listType);
      } catch (error) {
        console.error(`Skipping invalid list type: ${listType}`);
        continue;
      }

      const totalItems = await Model.countDocuments();
      const translations = await Translation.find({ listType });

      const languageStatus = {};
      for (const lang of languages) {
        if (lang === 'en') {
          // English is always considered fully translated
          languageStatus[lang] = {
            total: totalItems,
            translated: totalItems,
            percentage: 100
          };
        } else {
          const translatedCount = translations.filter(t => 
            t.translations && 
            t.translations.has(lang) && 
            t.translations.get(lang).trim() !== ''
          ).length;
          languageStatus[lang] = {
            total: totalItems,
            translated: translatedCount,
            percentage: totalItems > 0 ? (translatedCount / totalItems) * 100 : 0
          };
        }
      }

      overview[listType] = languageStatus;
    }

    console.log('Translation overview generated:', overview);
    res.json(overview);
  } catch (err) {
    console.error('Error in getTranslationOverview:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.overrideBookingCancellation = async (req, res) => {
  const { bookingId } = req.params;
  const adminUserId = req.user._id.toString(); // Assuming admin user is authenticated
  const {
    actionType, // "Issue Refund Only", "Cancel Booking & Issue Refund", "Change Booking Status Only"
    refundAmount: adminSpecifiedRefundAmount, // Decimal amount
    newBookingStatus, // e.g., "cancelled_by_admin"
    reasonForOverride, // Internal reason
    messageToClient,
    messageToCoach,
    notifyClient,
    notifyCoach
  } = req.body;

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    console.log('[adminController.overrideBookingCancellation] Admin override initiated', { bookingId, adminUserId, actionType });

    const booking = await Booking.findById(bookingId)
      .populate({ path: 'coach', populate: { path: 'user', select: '_id settings firstName lastName email' } })
      .populate('user', 'firstName lastName email')
      .populate('sessionType')
      .populate('payment.paymentRecord')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[adminController.overrideBookingCancellation] Booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    // Audit Log (simple version, expand as needed)
    const auditLogEntry = {
      adminUserId,
      bookingId,
      timestamp: new Date(),
      actionType,
      originalBookingStatus: booking.status,
      newBookingStatus: actionType.includes("Cancel") || actionType.includes("Status") ? newBookingStatus : booking.status,
      refundAmountIssued: (actionType.includes("Refund") && adminSpecifiedRefundAmount > 0) ? adminSpecifiedRefundAmount : 0,
      adminReason: reasonForOverride,
      clientMessageProvided: !!messageToClient,
      coachMessageProvided: !!messageToCoach,
    };
    console.log('[adminController.overrideBookingCancellation] Audit Log Entry Prepared:', auditLogEntry);
    // In a real system, save this to an AuditLogs collection: await AuditLog.create([auditLogEntry], { session: mongoSession });


    let refundResult = null;
    if ((actionType === "Issue Refund Only" || actionType === "Cancel Booking & Issue Refund") && adminSpecifiedRefundAmount > 0) {
      const paymentRecord = booking.payment?.paymentRecord;
      if (!paymentRecord || !paymentRecord.stripe?.paymentIntentId) {
        logger.warn('[adminController.overrideBookingCancellation] No valid payment record or paymentIntentId for refund', { bookingId, paymentRecordId: paymentRecord?._id });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'Booking has no processable payment for refund.' });
      }
      if (adminSpecifiedRefundAmount > paymentRecord.amount.total) {
        logger.warn('[adminController.overrideBookingCancellation] Admin specified refund amount exceeds original payment.', { bookingId, adminSpecifiedRefundAmount, paymentTotal: paymentRecord.amount.total });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'Refund amount cannot exceed the original payment amount.' });
      }

      try {
        // Use the refundPayment function from paymentController which now uses paymentService
        // This call needs to be adapted if paymentController.refundPayment is not directly callable or expects req/res
        // For now, let's assume a direct call to paymentService.processRefund:
         refundResult = await paymentService.processRefund({
            paymentIntentId: paymentRecord.stripe.paymentIntentId,
            amount: adminSpecifiedRefundAmount,
            currency: paymentRecord.amount.currency,
            reason: `Admin override: ${reasonForOverride || 'Administrative adjustment'}`
        });
        console.log('[adminController.overrideBookingCancellation] Admin refund processed via paymentService', { refundId: refundResult?.id, status: refundResult?.status });

        if (refundResult && refundResult.status === 'succeeded') {
            paymentRecord.status = (Math.abs(paymentRecord.amount.total - adminSpecifiedRefundAmount) < 0.01 && adminSpecifiedRefundAmount > 0) ? 'refunded' : 'partially_refunded';
            paymentRecord.refunds = paymentRecord.refunds || [];
            paymentRecord.refunds.push({
                amount: refundResult.amount / 100, // Stripe is in cents
                currency: refundResult.currency.toUpperCase(),
                reason: `Admin override: ${reasonForOverride || 'Administrative adjustment'}`,
                status: 'succeeded',
                stripeRefundId: refundResult.id,
                processedAt: new Date(),
                processedBy: adminUserId
            });
            await paymentRecord.save({ session: mongoSession });
            console.log('[adminController.overrideBookingCancellation] Payment record updated after admin refund', { paymentId: paymentRecord._id });
        } else {
            throw new Error(`Stripe refund attempt did not succeed. Status: ${refundResult?.status}`);
        }
      } catch (error) {
        logger.error('[adminController.overrideBookingCancellation] Error processing admin refund', { bookingId, error: error.message });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(500).json({ message: `Failed to process refund: ${error.message}` });
      }
    }

    if (actionType === "Cancel Booking & Issue Refund" || actionType === "Change Booking Status Only") {
      if (!newBookingStatus) {
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'New booking status is required for this action.' });
      }
      booking.status = newBookingStatus;
      if (newBookingStatus.startsWith("cancelled_")) {
          booking.cancellationReason = `Admin Override: ${reasonForOverride}`;
          // Update availability if it's a 1-on-1 session cancellation
          const sessionTypeIdString = typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id?.toString() || '');
          const coachUserForSettings = booking.coach; // coach is populated with user object

          if (sessionTypeIdString !== WEBINAR_TYPE_ID_STRING && sessionTypeIdString !== GROUP_TYPE_ID_STRING && sessionTypeIdString !== WORKSHOP_TYPE_ID_STRING) {
              if (booking.metadata?.originalAvailability || !booking.isAvailability) {
                  const newAvailabilitySlot = new Booking({
                      coach: booking.coach._id, // Use the User ID of the coach
                      sessionType: booking.sessionType._id,
                      start: booking.start,
                      end: booking.end,
                      timezone: booking.timezone,
                      title: 'Verfügbarkeit (Admin Aktion)',
                      isAvailability: true,
                      status: 'confirmed',
                      availableForInstantBooking: booking.metadata?.availabilitySettings?.availableForInstantBooking ?? coachUserForSettings?.settings?.availabilityManagement?.defaultInstantBooking ?? false,
                      firmBookingThreshold: booking.metadata?.availabilitySettings?.firmBookingThreshold ?? coachUserForSettings?.settings?.availabilityManagement?.defaultFirmThreshold ?? 24,
                      price: null,
                      metadata: { restoredFromAdminCancellation: booking._id, restoredAt: new Date() }
                  });
                  await newAvailabilitySlot.save({ session: mongoSession });
                  console.log('[adminController.overrideBookingCancellation] Availability restored for 1-on-1 booking.', { newSlotId: newAvailabilitySlot._id });
              }
          }
      }
    }
    booking.updatedAt = new Date();
    await booking.save({ session: mongoSession });

    const sessionDoc = await Session.findOneAndUpdate(
        { bookingId: booking._id },
        { $set: { state: booking.status, lastUpdated: new Date() } }, // Align session state with new booking status
        { new: true, session: mongoSession }
    );
     if (sessionDoc) {
        console.log('[adminController.overrideBookingCancellation] Session document updated', { sessionId: sessionDoc._id, newState: sessionDoc.state });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    // Notifications (N9)
    const baseNotifMetadata = {
        bookingId: booking._id.toString(),
        sessionTitle: booking.title,
        adminReason: reasonForOverride,
        actionDetails: `Action: ${actionType}. New Status: ${booking.status}. Refund: ${adminSpecifiedRefundAmount > 0 ? adminSpecifiedRefundAmount + ' ' + (booking.payment?.paymentRecord?.amount?.currency || 'N/A') : 'N/A'}`
    };

    if (notifyClient && booking.user) {
        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.ADMIN_BOOKING_OVERRIDE_PROCESSED,
            recipient: booking.user._id.toString(),
            recipientType: 'client',
            category: NotificationCategories.BOOKING,
            priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, /*NotificationChannels.EMAIL*/],
            contentOverride: messageToClient, // Use if provided
            metadata: {...baseNotifMetadata, customMessage: messageToClient}
        }, booking);
    }
    if (notifyCoach && booking.coach) {
         await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.ADMIN_BOOKING_OVERRIDE_PROCESSED,
            recipient: booking.coach._id.toString(), // Coach's User ID
            recipientType: 'coach',
            category: NotificationCategories.BOOKING,
            priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, /*NotificationChannels.EMAIL*/],
            contentOverride: messageToCoach, // Use if provided
            metadata: {...baseNotifMetadata, customMessage: messageToCoach}
        }, booking);
    }
    
    const socketService = getSocketService();
    if (socketService) {
        const recipients = [];
        if (booking.user?._id) recipients.push(booking.user._id.toString());
        if (booking.coach?._id) recipients.push(booking.coach._id.toString());
        if (recipients.length > 0) {
            socketService.emitBookingUpdate(booking._id.toString(), booking.toObject(), recipients);
        }
    }

    res.status(200).json({
        success: true,
        message: 'Admin override action processed successfully.',
        booking: booking.toObject(),
        refundResult: refundResult ? { id: refundResult.id, status: refundResult.status, amount: refundResult.amount } : null
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[adminController.overrideBookingCancellation] Critical error during admin override', { bookingId, adminUserId, error: error.message, stack: error.stack });
    res.status(500).json({ message: `Admin override failed: ${error.message}` });
  }
};

exports.getDashboardOverviewStats = async (req, res) => {
  try {
    const { timeframe, startDate: customStartDate, endDate: customEndDate } = req.query;
    let startDate;
    let endDate;
    let dateFilter = {};
    let bookingDateFilter = {};

    if (customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        endDate = new Date(customEndDate);
        dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };
        bookingDateFilter = { start: { $gte: startDate, $lte: endDate } };
    } else if (timeframe !== 'all') {
        startDate = new Date();
        endDate = new Date();
        if (timeframe === 'today') {
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        } else if (timeframe === '7d') {
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
        } else if (timeframe === '90d') {
            startDate.setDate(startDate.getDate() - 89);
            startDate.setHours(0, 0, 0, 0);
        } else { 
            startDate.setDate(startDate.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
        }
        dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };
        bookingDateFilter = { start: { $gte: startDate, $lte: endDate } };
    }
    
    const logStartDateString = dateFilter.createdAt ? dateFilter.createdAt.$gte.toISOString() : 'all time';
    const logEndDateString = dateFilter.createdAt ? dateFilter.createdAt.$lte.toISOString() : 'all time';
    console.log(`[ADMIN DASHBOARD KPI LOG] Start calculation for period: [${logStartDateString}, ${logEndDateString}]`);

    const revenueMatchQuery = {
      ...dateFilter,
      status: { $in: ['completed', 'succeeded'] },
      type: { $in: ['charge', 'program_purchase', 'live_session_charge', 'overtime_charge'] },
      "priceSnapshot": { $exists: true, $ne: null }
    };

    const financialTrendDataPromise = (async () => {
        const revenueTrend = await Payment.aggregate([
            { $match: revenueMatchQuery },
            {
              $lookup: {
                from: 'transactions',
                let: { paymentId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$payment', '$$paymentId'] },
                          { $eq: ['$type', 'fee'] },
                          { $eq: ['$status', 'completed'] }
                        ]
                      }
                    }
                  }
                ],
                as: 'feeTransaction'
              }
            },
            {
                $addFields: {
                    processingFee: { $ifNull: [{ $sum: '$feeTransaction.amount.value' }, 0] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    gtv: { $sum: "$amount.total" },
                    grossPlatformRevenue: { $sum: "$amount.platformFee" },
                    paymentProcessingFees: { $sum: '$processingFee' },
                    accruedCoachEarnings: { $sum: { $subtract: ["$amount.total", "$amount.platformFee"] } }
                }
            }
        ]);

        const trendMap = new Map();

        revenueTrend.forEach(day => {
            trendMap.set(day._id, {
                date: day._id,
                gtv: day.gtv || 0,
                grossPlatformRevenue: day.grossPlatformRevenue || 0,
                accruedCoachEarnings: day.accruedCoachEarnings || 0,
                paymentProcessingFees: day.paymentProcessingFees || 0
            });
        });
        
        const finalTrendData = Array.from(trendMap.values()).map(dayData => ({
            ...dayData,
            netPlatformRevenue: dayData.grossPlatformRevenue - dayData.paymentProcessingFees
        }));

        finalTrendData.sort((a, b) => new Date(a.date) - new Date(b.date));
        return finalTrendData;
    })();

    const [
        userStats,
        coachStats,
        marketplaceStats,
        disputeCount,
        reviewStats,
        adminUser,
        bookingStats,
        enrollmentCount,
        payoutStats,
        refundStats,
        openSupportTickets,
        financialTrend,
        newLeadsPromise
    ] = await Promise.all([
        User.countDocuments(dateFilter),
        Coach.aggregate([ { $match: dateFilter }, { $group: { _id: "$status", count: { $sum: 1 } } } ]),
         Payment.aggregate([
            { $match: revenueMatchQuery },
            {
              $lookup: {
                from: 'transactions',
                let: { paymentId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$payment', '$$paymentId'] },
                          { $eq: ['$type', 'fee'] },
                          { $eq: ['$status', 'completed'] }
                        ]
                      }
                    }
                  }
                ],
                as: 'feeTransaction'
              }
            },
            {
              $addFields: {
                processingFee: { $ifNull: [{ $sum: '$feeTransaction.amount.value' }, 0] }
              }
            },
            {
              $group: {
                _id: null,
                grossMerchandiseVolume: { $sum: "$amount.total" },
                grossPlatformRevenue: { $sum: "$amount.platformFee" },
                platformVatLiability: { $sum: "$amount.vat.amount" },
                paymentProcessingFees: { $sum: "$processingFee" },
                successfulTransactions: { $sum: 1 }
              }
            }
        ]),
        Payment.countDocuments({ status: 'disputed', ...dateFilter }),
        Review.countDocuments({ 'flags.0': { $exists: true }, ...dateFilter }),
        User.findById(req.user._id).select('dashboardPreferences adminDashboardKpiConfig').lean(),
        Booking.aggregate([ { $match: { ...bookingDateFilter, isAvailability: false } }, { $group: { _id: null, totalSessionsBooked: { $sum: 1 }, completedSessions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } }} ]),
        Enrollment.countDocuments(dateFilter),
        Transaction.aggregate([ { $match: { ...dateFilter, type: 'payout', status: { $in: ['completed', 'succeeded'] } } }, { $group: { _id: null, totalCoachPayouts: { $sum: "$amount.value" } } } ]),
        Transaction.aggregate([ { $match: { ...dateFilter, type: 'refund', status: { $in: ['completed', 'succeeded'] } } }, { $group: { _id: null, totalCustomerRefunds: { $sum: "$amount.value" } } } ]),
        SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
        financialTrendDataPromise,
        Lead.countDocuments(dateFilter)
    ]);
    
    console.log('[ADMIN DASHBOARD KPI LOG] Raw aggregation results:', {
        marketplaceStats,
        payoutStats,
        refundStats,
        bookingStats,
        userStats,
        coachStats,
        disputeCount,
        reviewStats,
        enrollmentCount,
        openSupportTickets,
        newLeadsCount: newLeadsPromise
    });

    const coachStatusCounts = coachStats.reduce((acc, curr) => ({...acc, [curr._id]: curr.count }), {});
    const mStats = marketplaceStats[0] || { grossMerchandiseVolume: 0, grossPlatformRevenue: 0, platformVatLiability: 0, successfulTransactions: 0, paymentProcessingFees: 0 };
    const pStats = payoutStats[0] || { totalCoachPayouts: 0 };
    const rStats = refundStats[0] || { totalCustomerRefunds: 0 };
    const bStats = bookingStats[0] || {};
    
    const netPlatformRevenue = mStats.grossPlatformRevenue - mStats.paymentProcessingFees;
    const accruedCoachEarnings = mStats.grossMerchandiseVolume - mStats.grossPlatformRevenue;

    console.log('[ADMIN DASHBOARD KPI LOG] Intermediate calculated values:', {
      grossMerchandiseVolume: mStats.grossMerchandiseVolume,
      grossPlatformRevenue: mStats.grossPlatformRevenue,
      platformVatLiability: mStats.platformVatLiability,
      paymentProcessingFees: mStats.paymentProcessingFees,
      netPlatformRevenue,
      accruedCoachEarnings,
      averageTransactionValue: mStats.successfulTransactions > 0 ? (mStats.grossMerchandiseVolume / mStats.successfulTransactions) : 0,
    });

    const preferences = adminUser?.dashboardPreferences;
    const kpiConfig = adminUser?.adminDashboardKpiConfig;
    let mergedPreferences = preferences;
    if (mergedPreferences && Array.isArray(mergedPreferences) && kpiConfig && kpiConfig.length > 0) {
        const kpiGridWidgetIndex = mergedPreferences.findIndex(p => p.key === 'adminKpiGrid');
        if (kpiGridWidgetIndex > -1) {
            mergedPreferences[kpiGridWidgetIndex].settings = { kpis: kpiConfig };
        }
    }

    const response = {
        kpis: {
            // Marketplace Activity
            grossMerchandiseVolume: mStats.grossMerchandiseVolume,
            successfulTransactions: mStats.successfulTransactions,
            averageTransactionValue: mStats.successfulTransactions > 0 ? (mStats.grossMerchandiseVolume / mStats.successfulTransactions) : 0,
            
            // Platform Profitability
            netPlatformRevenue: netPlatformRevenue,
            grossPlatformRevenue: mStats.grossPlatformRevenue,
            paymentProcessingFees: mStats.paymentProcessingFees,
            platformVatLiability: mStats.platformVatLiability,

            // Platform & Cash Flow
            accruedCoachEarnings: accruedCoachEarnings,
            totalCoachPayouts: pStats.totalCoachPayouts,
            totalCustomerRefunds: rStats.totalCustomerRefunds,
            
            // Platform Health
            newUserSignups: userStats || 0,
            newLeads: newLeadsPromise || 0, 
            pendingCoachApplications: coachStatusCounts.pending || 0,
            totalSessionsBooked: bStats.totalSessionsBooked || 0,
            completedSessions: bStats.completedSessions || 0,
            totalEnrollments: enrollmentCount || 0,
            openPaymentDisputes: disputeCount,
            flaggedReviews: reviewStats,
            openSupportTickets: openSupportTickets
        },
        financialTrend: financialTrend,
        actionCenterItems: [
            { type: "coach_application", title: `Pending Applications: ${coachStatusCounts.pending || 0}`, link: "/admin/users" },
            { type: "dispute", title: `Open Disputes: ${disputeCount}`, link: "/admin/financials/disputes" },
            { type: "moderation", title: `Flagged Reviews: ${reviewStats}`, link: "/admin/moderation" },
        ],
        systemHealth: {
            api: "online",
            database: "connected",
            cache: "connected",
            jobQueue: "healthy"
        },
        dashboardPreferences: mergedPreferences
    };
    
    console.log('[ADMIN DASHBOARD KPI LOG] Final KPI object sent to client:', response.kpis);
    res.json({ success: true, data: response });
  } catch (error) {
    logger.error('Error fetching dashboard overview stats:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getUserDetail = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).select('-password').lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const userResponse = {
            ...user,
            warningCount: user.moderation?.warningsCount || 0
        };

        res.json(userResponse);
    } catch (error) {
        logger.error('Error fetching user detail:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateUserByAdmin = async (req, res) => {
    try {
        const { userId } = req.params;
        // This makes the handler robust, accepting data directly or nested under `updateData` key.
        const updatePayload = req.body.updateData || req.body;
        const { isActive, role, suspensionReason } = updatePayload;
        const adminUserId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updateData = {};
        const auditActions = [];

        if (typeof isActive !== 'undefined' && user.isActive !== isActive) {
            updateData.isActive = isActive;
            if (!isActive) {
                updateData.suspensionReason = suspensionReason || 'No reason provided.';
                auditActions.push({ action: 'suspend_user', reason: suspensionReason });
            } else {
                updateData.suspensionReason = null; // Clear reason on reactivation
                auditActions.push({ action: 'reactivate_user' });
            }
        }
        if (role && user.role !== role) {
            updateData.role = role;
            auditActions.push({ action: 'change_role', metadata: { newRole: role } });
        }

        if (Object.keys(updateData).length > 0) {
            const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).select('-password').lean();
            
            const auditLogPromises = auditActions.map(act => 
                AuditLog.create({
                    adminUserId,
                    targetUserId: userId,
                    action: act.action,
                    reason: act.reason,
                    metadata: act.metadata,
                })
            );
            await Promise.all(auditLogPromises);

            res.json(updatedUser);
        } else {
            res.json(user.toObject()); // Return a plain object if no changes
        }
    } catch (error) {
        logger.error('Error updating user by admin:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.impersonateUser = async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body; // Reason is now required from frontend
    const adminUserId = req.user._id;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'Reason for impersonation is required.' });
    }

    try {
        const userToImpersonate = await User.findById(userId);
        if (!userToImpersonate) {
            return res.status(404).json({ message: 'User to impersonate not found.' });
        }

        // Generate a special JWT for impersonation
        const impersonationToken = jwt.sign(
            {
                user: {
                    id: userToImpersonate._id,
                    role: userToImpersonate.role,
                    version: userToImpersonate.tokenVersion,
                    impersonatorId: adminUserId, // Add impersonator's ID to the token
                    impersonating: true // Flag to indicate impersonation
                },
            },
            config.jwt.secret,
            { expiresIn: '1h' } // Short-lived token
        );

        await AuditLog.create({
            adminUserId: adminUserId,
            targetUserId: userId,
            action: 'impersonate_start',
            reason: reason,
            metadata: { impersonatedRole: userToImpersonate.role }
        });

        res.json({
            success: true,
            message: `Successfully started impersonating user ${userToImpersonate.email}.`,
            token: impersonationToken,
            impersonatedUser: {
                id: userToImpersonate._id,
                email: userToImpersonate.email,
                firstName: userToImpersonate.firstName,
                lastName: userToImpersonate.lastName,
                role: userToImpersonate.role
            }
        });

    } catch (error) {
        logger.error('Error in impersonateUser:', { userId, adminUserId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error during impersonation.', error: error.message });
    }
};


exports.getPaymentsLedger = async (req, res) => {
  const logContext = { query: req.query, userId: req.user?._id, function: 'getPaymentsLedger' };
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { search = '', status = '', startDate, endDate } = req.query;
    
    const matchStage = {};

    if (status) {
      matchStage.status = status;
    }

    if (startDate && endDate) {
      matchStage.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const users = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
        ]
      }).select('_id').lean();
      
      const userObjectIds = users.map(u => u._id);

      const orConditions = [
        { 'stripe.paymentIntentId': searchRegex },
        { payer: { $in: userObjectIds } },
        { recipient: { $in: userObjectIds } },
      ];

      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ booking: new mongoose.Types.ObjectId(search) });
        orConditions.push({ program: new mongoose.Types.ObjectId(search) });
      }
      matchStage.$or = orConditions;
    }
    
    const pipeline = [
      { $match: matchStage },
    ];
    
    const countPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await Payment.aggregate(countPipeline);
    const count = totalResult[0]?.total || 0;

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    pipeline.push({
      $lookup: {
        from: 'transactions',
        let: { paymentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$payment', '$$paymentId'] },
                  { $eq: ['$type', 'fee'] }
                ]
              }
            }
          },
          { $project: { _id: 0, feeAmount: '$amount.value' } }
        ],
        as: 'feeTransaction'
      }
    });
    
    pipeline.push({ $lookup: { from: 'users', localField: 'payer', foreignField: '_id', as: 'payerDoc' } });
    pipeline.push({ $unwind: { path: '$payerDoc', preserveNullAndEmptyArrays: true } });
    pipeline.push({ $lookup: { from: 'users', localField: 'recipient', foreignField: '_id', as: 'recipientDoc' } });
    pipeline.push({ $unwind: { path: '$recipientDoc', preserveNullAndEmptyArrays: true } });
    
    pipeline.push({
        $lookup: {
            from: 'bookings',
            let: { bookingId: '$booking' },
            pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$bookingId'] } } },
            ],
            as: 'bookingDoc'
        }
    });
    pipeline.push({ $unwind: { path: '$bookingDoc', preserveNullAndEmptyArrays: true } });

    pipeline.push({
        $lookup: {
            from: 'programs',
            let: { programId: '$program' },
            pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$programId'] } } },
            ],
            as: 'programDoc'
        }
    });
    pipeline.push({ $unwind: { path: '$programDoc', preserveNullAndEmptyArrays: true } });


pipeline.push({
    $lookup: {
        from: 'invoices',
        let: { paymentId: '$_id' },
        pipeline: [
            {
                $match: {
                    $expr: {
                        $and: [
                            { $eq: ['$payment', '$$paymentId'] },
                            { $eq: ['$invoiceParty', 'coach_to_platform'] }
                        ]
                    }
                }
            }
        ],
        as: 'b2bDocument'
    }
});

pipeline.push({
    $lookup: {
        from: 'invoices',
        let: { paymentId: '$_id' },
        pipeline: [
            {
                $match: {
                    $expr: {
                        $and: [
                            { $eq: ['$payment', '$$paymentId'] },
                            { $eq: ['$type', 'credit_note'] },
                            { $eq: ['$invoiceParty', 'platform_to_client'] }
                        ]
                    }
                }
            }
        ],
        as: 'b2cCreditNote'
    }
});

pipeline.push({
    $addFields: {
        b2bDocument: { $first: '$b2bDocument' },
        b2cCreditNote: { $first: '$b2cCreditNote' }
    }
});

pipeline.push({
    $lookup: {
        from: 'payments',
        let: { originalPaymentIdStr: '$metadata.originalPaymentId' },
        pipeline: [
            { $match: { $expr: { $and: [ { $ne: ['$$originalPaymentIdStr', null] }, { $eq: ['$_id', { $toObjectId: '$$originalPaymentIdStr' }] } ] } } },
            { $project: { _id: 1, 'stripe.paymentIntentId': 1, 'booking': 1, 'program': 1 } }
        ],
        as: 'originalPayment'
    }
});
pipeline.push({ $unwind: { path: '$originalPayment', preserveNullAndEmptyArrays: true } });

pipeline.push({
  $project: {
    _id: 1,
    createdAt: 1,
    status: 1,
    type: 1,
    b2cCreditNote: 1,
    originalPayment: 1,
    stripe: 1,
    b2bDocument: 1,
    payer: {
        _id: '$payerDoc._id',
        firstName: '$payerDoc.firstName',
        lastName: '$payerDoc.lastName',
    },
    recipient: {
        _id: '$recipientDoc._id',
        firstName: '$recipientDoc.firstName',
        lastName: '$recipientDoc.lastName',
    },
    booking: {
        _id: '$bookingDoc._id',
        title: '$bookingDoc.title',
    },
    program: {
        _id: '$programDoc._id',
        title: '$programDoc.title',
    },
    amount: {
      total: '$amount.total',
      currency: '$amount.currency',
      platformFee: '$amount.platformFee',
      vat: '$amount.vat',
      refunded: { $ifNull: ['$amount.refunded', 0] },
      processingFee: { $ifNull: [{ $first: '$feeTransaction.feeAmount' }, 0] },
      coachB2bVat: { $ifNull: ['$b2bDocument.vatAmount', 0] },
      netPayout: {
         $let: {
             vars: {
                 netEarning: {
                     $max: [
                         0,
                         // START: CORRECTED CODE BLOCK
                         {
                             $subtract: [
                                 {
                                     $subtract: [
                                         { $subtract: ['$amount.total', { $ifNull: ['$amount.refunded', 0] }] },
                                         '$amount.platformFee'
                                     ]
                                 },
                                 {
                                     $add: [
                                         { $ifNull: ['$amount.vat.amount', 0] },
                                         { $ifNull: [{ $first: '$feeTransaction.feeAmount' }, 0] }
                                     ]
                                 }
                             ]
                         }
                         // END: CORRECTED CODE BLOCK
                     ]
                 },
                 coachVat: { $ifNull: ['$b2bDocument.vatAmount', 0] }
             },
             in: { $add: ['$$netEarning', '$$coachVat'] }
         }
      }
    }
  }
});

    const payments = await Payment.aggregate(pipeline);
    
    res.json({
      payments,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalPayments: count
    });
  } catch (err) {
    logger.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: err.message, stack: err.stack });
    res.status(500).send('Server Error');
  }
};

exports.getPayouts = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '', startDate, endDate, sortField = 'createdAt', sortOrder = 'desc' } = req.query;

       const pipeline = [];
        const matchStage = {
            payoutStatus: { $in: ['pending', 'processing', 'submitted', 'paid_out', 'failed', 'on_hold', 'not_applicable'] }
        };

        if (status) {
            matchStage.payoutStatus = status;
        }
        if (startDate && endDate) {
            matchStage.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        
        pipeline.push({ $match: matchStage });

        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'recipient',
                foreignField: '_id',
                as: 'coachInfo'
            }
        });
        pipeline.push({ $unwind: { path: '$coachInfo', preserveNullAndEmptyArrays: true } });

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { 'coachInfo.firstName': searchRegex },
                        { 'coachInfo.lastName': searchRegex },
                        { stripeTransferId: searchRegex }
                    ]
                }
            });
        }
        
        const countPipeline = [...pipeline, { $count: 'totalDocs' }];
        const countResult = await Payment.aggregate(countPipeline);
        const count = countResult[0]?.totalDocs || 0;

        const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };
        pipeline.push({ $sort: sort });
        
        pipeline.push({ $skip: (page - 1) * limit });
        pipeline.push({ $limit: parseInt(limit) });

        pipeline.push({
            $lookup: {
                from: 'transactions',
                let: { paymentId: '$_id' },
                pipeline: [
                    { $match: { $expr: { $and: [ { $eq: ['$payment', '$$paymentId'] }, { $eq: ['$type', 'fee'] } ] } } }
                ],
                as: 'feeTransaction'
            }
        });
        
          pipeline.push({
              $lookup: {
                  from: 'invoices',
                  let: { paymentId: '$_id' },
                  pipeline: [
                      {
                          $match: {
                              $expr: {
                                  $and: [
                                      { $eq: ['$payment', '$$paymentId'] },
                                      { $eq: ['$invoiceParty', 'coach_to_platform'] }
                                  ]
                              }
                          }
                      }
                  ],
                  as: 'b2bDocument'
              }
          });

          pipeline.push({
              $addFields: {
                  b2bDocument: { $first: '$b2bDocument' }
              }
          });

        pipeline.push({
            $project: {
                _id: 1,
                createdAt: 1,
                payoutStatus: 1,
                stripeTransferId: 1,
                currency: '$amount.currency',
                coach: {
                    _id: '$coachInfo._id',
                    firstName: '$coachInfo.firstName',
                    lastName: '$coachInfo.lastName'
                },
                grossAmount: '$amount.total',
                refundedAmount: { $ifNull: ['$amount.refunded', 0] },
                platformFee: '$amount.platformFee',
                vatAmount: { $ifNull: ['$amount.vat.amount', 0] },
                processingFee: { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] },
                coachB2bVat: { $ifNull: ['$b2bDocument.vatAmount', 0] },
                netPayout: {
                   $let: {
                       vars: {
                           netEarning: {
                               $max: [
                                   0,
                                   {
                                     $subtract: [
                                         {
                                             $subtract: [
                                                 { $subtract: ['$amount.total', { $ifNull: ['$amount.refunded', 0] }] },
                                                 '$amount.platformFee'
                                             ]
                                         },
                                         {
                                             $add: [
                                                 { $ifNull: ['$amount.vat.amount', 0] },
                                                 { $ifNull: [{ $first: '$feeTransaction.amount.value' }, 0] }
                                             ]
                                         }
                                     ]
                                   }
                               ]
                           },
                           coachVat: { $ifNull: ['$b2bDocument.vatAmount', 0] }
                       },
                       in: { $add: ['$$netEarning', '$$coachVat'] }
                   }
                }
            }
        });
        
        const payouts = await Payment.aggregate(pipeline);

        res.json({
            payouts,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalPayouts: count
        });
    } catch (err) {
        logger.error('[adminController.getPayouts] Error fetching payouts', { error: err.message, stack: err.stack });
        res.status(500).send('Server Error');
    }
};

exports.getDisputes = async (req, res) => {
    const logContext = { query: req.query, userId: req.user?._id, function: 'getDisputes' };
    console.log(`[adminController] START: ${logContext.function}`, logContext);
    try {
        const { page = 1, limit = 20 } = req.query;
        const query = { status: 'disputed' };

        const disputes = await Payment.find(query)
            .populate('payer', 'firstName lastName email')
            .populate('recipient', 'firstName lastName email')
            // Add populate for dispute details when schema is updated
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await Payment.countDocuments(query);
        
        console.log(`[adminController] SUCCESS: ${logContext.function}`, { ...logContext, results: disputes.length, total: count });
        res.json({
            disputes,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalDisputes: count
        });
    } catch (error) {
        console.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: error.message, stack: err.stack });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getDiscounts = async (req, res) => {
    const logContext = { query: req.query, userId: req.user?._id, function: 'getDiscounts' };
    console.log(`[adminController] START: ${logContext.function}`, logContext);
    try {
        const { page = 1, limit = 10, search = '', status = '', sortField = 'createdAt', sortOrder = 'desc' } = req.query;
        let query = {};
        
        if (status) {
            query.isActive = status === 'active';
        }
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            const coaches = await User.find({ role: 'coach', $or: [{ firstName: searchRegex }, { lastName: searchRegex }]}).select('_id');
            const coachIds = coaches.map(c => c._id);
            query.$or = [
                { code: searchRegex },
                { coach: { $in: coachIds } }
            ];
        }

        const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

        const discounts = await Discount.find(query)
            .populate('coach', 'firstName lastName email')
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        const count = await Discount.countDocuments(query);
        console.log(`[adminController] SUCCESS: ${logContext.function}`, { ...logContext, results: discounts.length, total: count });

        res.json({
            discounts,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalDiscounts: count
        });
    } catch (err) {
        console.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: err.message, stack: err.stack });
        res.status(500).send('Server Error');
    }
};

exports.createDiscountByAdmin = async (req, res) => {
    const logContext = { body: req.body, userId: req.user?._id, function: 'createDiscountByAdmin' };
    console.log(`[adminController] START: ${logContext.function}`, logContext);
    try {
        const discountData = req.body;
        if (!discountData.coach) {
            console.warn(`[adminController] WARN: ${logContext.function} - Coach ID is required.`);
            return res.status(400).json({ message: 'Coach ID is required to create a discount.' });
        }
        const newDiscount = new Discount(discountData);
        await newDiscount.save();
        console.log(`[adminController] SUCCESS: ${logContext.function}`, { ...logContext, discountId: newDiscount._id });
        res.status(201).json(newDiscount);
    } catch (error) {
        console.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: error.message });
        res.status(500).json({ message: 'Server error while creating discount.' });
    }
};

exports.updateDiscountByAdmin = async (req, res) => {
    const logContext = { params: req.params, body: req.body, userId: req.user?._id, function: 'updateDiscountByAdmin' };
    console.log(`[adminController] START: ${logContext.function}`, logContext);
    try {
        const { discountId } = req.params;
        const updates = req.body;
        const updatedDiscount = await Discount.findByIdAndUpdate(discountId, updates, { new: true });
        if (!updatedDiscount) {
            console.warn(`[adminController] WARN: ${logContext.function} - Discount not found.`);
            return res.status(404).json({ message: 'Discount not found.' });
        }
        console.log(`[adminController] SUCCESS: ${logContext.function}`, { ...logContext, discountId: updatedDiscount._id });
        res.json(updatedDiscount);
    } catch (error) {
        console.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: error.message });
        res.status(500).json({ message: 'Server error while updating discount.' });
    }
};

exports.deleteDiscountByAdmin = async (req, res) => {
    const logContext = { params: req.params, userId: req.user?._id, function: 'deleteDiscountByAdmin' };
    console.log(`[adminController] START: ${logContext.function}`, logContext);
    try {
        const { discountId } = req.params;
        const deletedDiscount = await Discount.findByIdAndDelete(discountId);
        if (!deletedDiscount) {
            console.warn(`[adminController] WARN: ${logContext.function} - Discount not found.`);
            return res.status(404).json({ message: 'Discount not found.' });
        }
        await DiscountUsage.deleteMany({ discount: discountId });
        console.log(`[adminController] SUCCESS: ${logContext.function}`, logContext);
        res.json({ message: 'Discount deleted successfully.' });
    } catch (error) {
        console.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: error.message });
        res.status(500).json({ message: 'Server error while deleting discount.' });
    }
};

exports.getFormData = async (req, res) => {
    const logContext = { userId: req.user?._id, function: 'getFormData' };
    console.log(`[adminController] START: ${logContext.function}`, logContext);
    try {
        const [coaches, programs, sessionTypes] = await Promise.all([
            User.find({ role: 'coach' }).select('id firstName lastName').lean(),
            Program.find({ status: 'published' }).select('id title').lean(),
            SessionType.find({}).select('id name').lean()
        ]);
        console.log(`[adminController] SUCCESS: ${logContext.function}`, { coachCount: coaches.length, programCount: programs.length, sessionTypeCount: sessionTypes.length });
        res.json({ coaches, programs, sessionTypes });
    } catch (error) {
        console.error(`[adminController] ERROR: ${logContext.function}`, { ...logContext, error: error.message, stack: err.stack });
        res.status(500).json({ message: 'Error fetching form data.' });
    }
};

exports.getPrograms = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '', category = '', sortField = 'createdAt', sortOrder = 'desc' } = req.query;

        const pipeline = [];
        const matchStage = {};

        if (status) matchStage.status = status;
        if (category) matchStage.category = new mongoose.Types.ObjectId(category);

        pipeline.push({ $match: matchStage });

        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'coach',
                foreignField: '_id',
                as: 'coachInfo'
            }
        });

        pipeline.push({ $unwind: { path: '$coachInfo', preserveNullAndEmptyArrays: true } });

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { title: searchRegex },
                        { 'coachInfo.firstName': searchRegex },
                        { 'coachInfo.lastName': searchRegex }
                    ]
                }
            });
        }
        
        pipeline.push({
            $lookup: { from: 'enrollments', localField: '_id', foreignField: 'program', as: 'enrollments' }
        });
        
        pipeline.push({
            $lookup: { from: 'reviews', localField: '_id', foreignField: 'program', as: 'reviews' }
        });

        pipeline.push({
            $lookup: {
                from: 'payments',
                let: { programId: '$_id' },
                pipeline: [
                    { $match: { $expr: { $and: [ { $eq: ['$program', '$$programId'] }, { $in: ['$status', ['completed', 'succeeded']] } ] } } },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } }
                ],
                as: 'revenue'
            }
        });

         console.log(`[adminController.getPrograms] Pipeline constructed before problematic $addFields stage for search: "${search}"`);

        pipeline.push({
            $addFields: {
                totalEnrollments: { $size: '$enrollments' },
                averageRating: { $avg: '$reviews.rating' },
                grossRevenue: { $ifNull: [{ $first: '$revenue.total' }, 0] },
                coachName: { $concat: ['$coachInfo.firstName', ' ', '$coachInfo.lastName'] }
            }
        });
        
        const countPipeline = [...pipeline, { $count: 'total' }];
        const totalResult = await Program.aggregate(countPipeline);
        const totalPrograms = totalResult[0]?.total || 0;

        const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };
        pipeline.push({ $sort: sort });
        pipeline.push({ $skip: (page - 1) * parseInt(limit) });
        pipeline.push({ $limit: parseInt(limit) });

        pipeline.push({
            $project: {
                title: 1,
                status: 1,
                isFeatured: 1,
                category: 1,
                totalEnrollments: 1,
                averageRating: 1,
                grossRevenue: 1,
                coachName: 1,
                coachId: '$coachInfo._id',
                createdAt: 1
            }
        });

        const programs = await Program.aggregate(pipeline);

        res.json({
            programs,
            totalPages: Math.ceil(totalPrograms / limit),
            currentPage: parseInt(page),
            totalPrograms
        });

    } catch (error) {
        logger.error('[adminController.getPrograms] Error fetching programs', { error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

exports.updateProgramByAdmin = async (req, res) => {
    try {
        const { programId } = req.params;
        const { isFeatured, status } = req.body;
        const adminUserId = req.user.id;
        
        const program = await Program.findById(programId);
        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        const updateData = {};
        const auditActions = [];

        if (typeof isFeatured !== 'undefined' && program.isFeatured !== isFeatured) {
            updateData.isFeatured = isFeatured;
            auditActions.push({ action: isFeatured ? 'feature_program' : 'unfeature_program' });
        }
        
        if (typeof status !== 'undefined' && program.status !== status) {
            updateData.status = status;
            auditActions.push({ action: 'change_program_status', metadata: { newStatus: status } });
        }

        if (Object.keys(updateData).length > 0) {
            const updatedProgram = await Program.findByIdAndUpdate(programId, { $set: updateData }, { new: true });

            // Create audit logs for a complete trail of admin actions
            const auditLogPromises = auditActions.map(act => 
                AuditLog.create({
                    adminUserId,
                    targetProgramId: programId, // Assuming you might add this to your AuditLog model
                    action: act.action,
                    metadata: act.metadata,
                })
            );
            await Promise.all(auditLogPromises);

            res.json(updatedProgram);
        } else {
            res.json(program); // No changes were made
        }
    } catch (error) {
        logger.error('Error updating program by admin:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getModerationQueue = async (req, res) => {
   console.log(`[MOD_QUEUE_DEBUG] 1. --- Function getModerationQueue started. ---`);
    try {
        const { page = 1, limit = 10, sortOrder = 'desc', status = 'pending' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        console.log(`[MOD_QUEUE_DEBUG] 2. Parameters received: page=${page}, limit=${limit}, skip=${skip}, sortOrder=${sortOrder}, status=${status}`);

        const reviewQuery = {};
        const userQuery = {};
        const programQuery = {};
        
        const resolvedStatuses = [
            'resolved_hidden', 'resolved_dismissed',
            'resolved_warning', 'resolved_suspension',
            'resolved_archived'
        ];

        if (status === 'resolved') {
            reviewQuery['flags.status'] = { $in: resolvedStatuses };
            userQuery['flags.status'] = { $in: resolvedStatuses };
            programQuery['flags.status'] = { $in: resolvedStatuses };
        } else if (status && status !== 'all') {
             reviewQuery['flags.status'] = status;
            userQuery['flags.status'] = status;
            programQuery['flags.status'] = status;
        } else {
            reviewQuery['flags.0'] = { $exists: true };
            userQuery['flags.0'] = { $exists: true };
            programQuery['flags.0'] = { $exists: true };
        }

        console.log(`[MOD_QUEUE_DEBUG] 3. Querying 'Review' collection with: ${JSON.stringify(reviewQuery)}`);
        const flaggedReviewsPromise = Review.find(reviewQuery)
            .populate('raterId', 'firstName lastName email trustScore profilePicture role')
            .populate('flags.flaggedBy', 'firstName lastName email trustScore profilePicture role')
            .lean();

        console.log(`[MOD_QUEUE_DEBUG] 4. Querying 'User' collection with: ${JSON.stringify(userQuery)}`);
        const flaggedUsersPromise = User.find(userQuery)
            .populate('flags.flaggedBy', 'firstName lastName email trustScore profilePicture role')
            .select('firstName lastName email trustScore flags profilePicture role')
            .lean();
            
        console.log(`[MOD_QUEUE_DEBUG] 4a. Querying 'Program' collection with: ${JSON.stringify(programQuery)}`);
        const flaggedProgramsPromise = Program.find(programQuery)
            .populate('coach', 'firstName lastName email trustScore profilePicture role')
            .populate('flags.flaggedBy', 'firstName lastName email trustScore profilePicture role')
            .select('title coach flags')
            .lean();
            
        const [flaggedReviews, flaggedUsers, flaggedPrograms] = await Promise.all([flaggedReviewsPromise, flaggedUsersPromise, flaggedProgramsPromise]);
        console.log(`[MOD_QUEUE_DEBUG] 5. Database queries complete.`);
        console.log(`[MOD_QUEUE_DEBUG] 5a. Found ${flaggedReviews.length} flagged reviews.`);
        if (flaggedReviews.length > 0) {
             console.log(`[MOD_QUEUE_DEBUG] 5b. Sample flagged review: ${JSON.stringify(flaggedReviews[0], null, 2)}`);
        }
        console.log(`[MOD_QUEUE_DEBUG] 5c. Found ${flaggedUsers.length} flagged users.`);
        if (flaggedUsers.length > 0) {
             console.log(`[MOD_QUEUE_DEBUG] 5d. Sample flagged user: ${JSON.stringify(flaggedUsers[0], null, 2)}`);
        }

        console.log(`[MOD_QUEUE_DEBUG] 5e. Found ${flaggedPrograms.length} flagged programs.`);
        if (flaggedPrograms.length > 0) {
             console.log(`[MOD_QUEUE_DEBUG] 5f. Sample flagged program: ${JSON.stringify(flaggedPrograms[0], null, 2)}`);
        }

        const allFlaggedItems = [];
        console.log(`[MOD_QUEUE_DEBUG] 6. Starting to merge results into a single list.`);

        const shouldIncludeFlag = (flagStatus) => {
            if (status === 'all') return true;
            if (status === 'resolved') return resolvedStatuses.includes(flagStatus);
            return flagStatus === status;
        };

        const allUserIds = new Set();
        const addUser = (user) => {
            if (user && user._id) {
                allUserIds.add(user._id.toString());
            }
        };

        flaggedReviews.forEach(review => {
            addUser(review.raterId);
            review.flags.forEach(flag => addUser(flag.flaggedBy));
        });

        flaggedUsers.forEach(user => {
            addUser(user);
            user.flags.forEach(flag => addUser(flag.flaggedBy));
        });

        flaggedPrograms.forEach(program => {
            addUser(program.coach);
            program.flags.forEach(flag => addUser(flag.flaggedBy));
        });

        const coachProfiles = await Coach.find({ user: { $in: Array.from(allUserIds) } }).select('user profilePicture').lean();
        const coachProfileMap = new Map(coachProfiles.map(p => [p.user.toString(), p.profilePicture]));

        const enrichUser = (user) => {
            if (!user) return null;
            if (user.role === 'coach') {
                user.coachProfilePicture = coachProfileMap.get(user._id.toString()) || null;
            }
            return user;
        };

        flaggedReviews.forEach(review => {
            review.flags.forEach(flag => {
                if (shouldIncludeFlag(flag.status)) {
                    allFlaggedItems.push({
                        type: 'review',
                        content: {
                            ...review,
                            raterId: enrichUser(review.raterId),
                        },
                        flag: {
                            ...flag,
                            flaggedBy: enrichUser(flag.flaggedBy),
                        },
                        createdAt: flag.createdAt
                    });
                }
            });
        });

        flaggedUsers.forEach(user => {
            user.flags.forEach(flag => {
                if (shouldIncludeFlag(flag.status)) {
                    allFlaggedItems.push({
                        type: 'user',
                        content: enrichUser(JSON.parse(JSON.stringify(user))),
                        flag: {
                            ...flag,
                            flaggedBy: enrichUser(flag.flaggedBy),
                        },
                        createdAt: flag.createdAt
                    });
                }
            });
        });
        
       flaggedPrograms.forEach(program => {
            program.flags.forEach(flag => {
                if (shouldIncludeFlag(flag.status)) {
                    allFlaggedItems.push({
                        type: 'program',
                        content: {
                            ...program,
                            coach: enrichUser(program.coach),
                        },
                        flag: {
                            ...flag,
                            flaggedBy: enrichUser(flag.flaggedBy),
                        },
                        createdAt: flag.createdAt
                    });
                }
            });
        });
        
        console.log(`[MOD_QUEUE_DEBUG] 7. Merging complete. Total items found: ${allFlaggedItems.length}`);

        allFlaggedItems.sort((a, b) => {
            const dateA = new Date(a.createdAt);
            const dateB = new Date(b.createdAt);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
        console.log(`[MOD_QUEUE_DEBUG] 8. Sorting complete. Total items remain: ${allFlaggedItems.length}`);

        const paginatedItems = allFlaggedItems.slice(skip, skip + parseInt(limit));
        console.log(`[MOD_QUEUE_DEBUG] 9. Pagination applied. Slicing from index ${skip} for ${limit} items. Items on this page: ${paginatedItems.length}`);
        
        const totalItems = allFlaggedItems.length;
        const responsePayload = {
            items: paginatedItems,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: parseInt(page),
            totalItems
        };

        console.log(`[MOD_QUEUE_DEBUG] 10. --- Final response payload prepared. Sending to client. ---`);
        console.log(`[MOD_QUEUE_DEBUG] 10a. totalItems: ${totalItems}, currentPage: ${page}, totalPages: ${Math.ceil(totalItems / limit)}`);
        
        res.json(responsePayload);

    } catch (error) {
        console.log(`[MOD_QUEUE_DEBUG] --- CRITICAL ERROR ---`);
        logger.error('Error fetching moderation queue:', { error: error.message, stack: error.stack });
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.resolveUserFlag = async (req, res) => {
    const { userId, flagId } = req.params;
    const { action, reason } = req.body;
    const adminUserId = req.user._id;

    if (!action || !reason || reason.trim() === '') {
        return res.status(400).json({ message: 'Action and a non-empty reason are required.' });
    }

    try {
        await moderationActionsQueue.add('resolve-flag', {
            entityType: 'user',
            entityId: userId,
            flagId: flagId,
            adminId: adminUserId.toString(),
            action: action,
            reason: reason,
        });

        res.status(200).json({ success: true, message: 'Moderation action has been queued.' });

    } catch (error) {
        logger.error('Error queuing user flag resolution:', { userId, flagId, adminUserId, error: error.message });
        res.status(500).json({ message: 'Server Error: Could not queue action.' });
    }
};

exports.resolveReviewFlag = async (req, res) => {
    const { reviewId, flagId } = req.params;
    const { action, reason } = req.body;
    const adminUserId = req.user._id;

    if (!action || !reason || reason.trim() === '') {
        return res.status(400).json({ message: 'Action and a non-empty reason are required.' });
    }

    try {
        await moderationActionsQueue.add('resolve-flag', {
            entityType: 'review',
            entityId: reviewId,
            flagId: flagId,
            adminId: adminUserId.toString(),
            action: action,
            reason: reason,
        });

        res.status(200).json({ success: true, message: 'Moderation action has been queued.' });

    } catch (error) {
        logger.error('Error queuing review flag resolution:', { reviewId, flagId, adminUserId, error: error.message });
        res.status(500).json({ message: 'Server Error: Could not queue action.' });
    }
};

exports.resolveProgramFlag = async (req, res) => {
    const { programId, flagId } = req.params;
    const { action, reason } = req.body;
    const adminUserId = req.user._id;

    if (!action || !reason || reason.trim() === '') {
        return res.status(400).json({ message: 'Action and a non-empty reason are required.' });
    }

    try {
        await moderationActionsQueue.add('resolve-flag', {
            entityType: 'program',
            entityId: programId,
            flagId: flagId,
            adminId: adminUserId.toString(),
            action: action,
            reason: reason,
        });

        res.status(200).json({ success: true, message: 'Moderation action has been queued.' });

    } catch (error) {
        logger.error('Error queuing program flag resolution:', { programId, flagId, adminUserId, error: error.message });
        res.status(500).json({ message: 'Server Error: Could not queue action.' });
    }
};

exports.getSafetyProfiles = async (req, res) => {
    try {
        const users = await User.find({
            $or: [
                { 'flags.0': { $exists: true } },
                { blockedByCount: { $gt: 5 } },
                { trustScore: { $lt: 30 } }
            ]
        }).select('firstName lastName email trustScore blockedByCount flags');
        res.json(users);
    } catch (error) {
        logger.error('Error fetching safety profiles:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.forceUnblockUser = async (req, res) => {
    const { blockerId, blockedId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user._id;

    if (!reason) {
        return res.status(400).json({ message: 'A mandatory audit reason must be provided.' });
    }

    try {
        const blocker = await User.findById(blockerId);
        if (!blocker) {
            return res.status(404).json({ message: 'Blocking user not found.' });
        }

        const initialBlockCount = blocker.blockedUsers.length;
        blocker.blockedUsers = blocker.blockedUsers.filter(block => !block.user.equals(blockedId));

        if (blocker.blockedUsers.length === initialBlockCount) {
            return res.status(404).json({ message: 'Block relationship not found.' });
        }

        await blocker.save();

        await User.findByIdAndUpdate(blockedId, { $inc: { blockedByCount: -1 } });

        await AuditLog.create({
            adminUserId,
            action: 'force_unblock',
            reason: reason,
            metadata: {
                blockerId,
                blockedId,
                unblockedUserFrom: blocker.email
            }
        });

        res.json({ success: true, message: 'User pair has been force-unblocked.' });
    } catch (error) {
        logger.error('Error during force unblock user:', { error: error.message, adminUserId });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getSystemHealth = async (req, res) => {
  try {
    const redisClient = req.app.get('redis');
    const healthStatus = await systemHealthService.getHealth(redisClient);

    if (healthStatus.database.status === 'disconnected' || healthStatus.redis.status === 'disconnected') {
      return res.status(503).json(healthStatus);
    }
    
    res.json(healthStatus);
  } catch (error) {
    logger.error('Error in getSystemHealth controller:', error);
    res.status(500).json({ message: 'Failed to retrieve system health.' });
  }
};

exports.getWebhookLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 15,
            status,
            eventType,
            search,
            sortField = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const query = {};

        if (status) query.status = status;
        if (eventType) query.eventType = eventType;
        if (search) {
            // Escape special regex characters in the search string
            const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            query.payload = { $regex: escapedSearch, $options: 'i' };
        }

        const skip = (page - 1) * limit;
        const totalLogs = await WebhookLog.countDocuments(query);
        const logs = await WebhookLog.find(query)
            .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        res.json({
            logs,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalLogs / limit),
            totalLogs,
        });
    } catch (error) {
        logger.error('Error fetching webhook logs:', error);
        res.status(500).json({ message: 'Failed to fetch webhook logs', error: error.message });
    }
};

exports.replayWebhook = async (req, res) => {
    const { logId } = req.params;
    const adminUserId = req.user.id;
  
    try {
        const log = await WebhookLog.findById(logId);
        if (!log) {
            return res.status(404).json({ message: 'Webhook log not found.' });
        }

        const mockReq = {
            body: Buffer.from(log.payload),
            headers: log.headers,
            originalUrl: '/api/payments/webhook',
        };

        let handlerResponse = {};
        const mockRes = {
            status: (statusCode) => {
                handlerResponse.statusCode = statusCode;
                return {
                    send: (body) => { handlerResponse.body = body; },
                    json: (body) => { handlerResponse.body = body; },
                };
            },
            send: (body) => { handlerResponse.body = body; },
            json: (body) => { handlerResponse.body = body; },
        };
        
        await paymentController.webhookHandler(mockReq, mockRes);
        
        await new AuditLog({
            adminUserId,
            action: 'replay_webhook',
            reason: req.body.reason || 'Manual replay from admin dashboard.',
            metadata: {
                webhookLogId: logId,
                source: log.source,
                eventType: log.eventType,
                handlerStatusCode: handlerResponse.statusCode || 200,
            }
        }).save();

        res.json({ success: true, message: `Webhook ${log.eventType} replayed successfully.`, result: handlerResponse });
    } catch (error) {
        logger.error(`Error replaying webhook ${logId}:`, error);
        res.status(500).json({ message: 'Failed to replay webhook', error: error.message });
    }
};

exports.replayWebhooksBulk = async (req, res) => {
    const { logIds, reason } = req.body;
    const adminUserId = req.user.id;

    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
        return res.status(400).json({ message: 'logIds must be a non-empty array.' });
    }

    const results = { successes: 0, failures: 0, details: [] };

    for (const logId of logIds) {
        try {
            const log = await WebhookLog.findById(logId);
            if (!log) {
                results.failures++;
                results.details.push({ logId, status: 'error', message: 'Log not found.' });
                continue;
            }
            if (log.status !== 'failed') {
                 // You might want to skip replaying successful ones
                 results.details.push({ logId, status: 'skipped', message: `Log status is '${log.status}', not 'failed'.` });
                 continue;
            }

            const mockReq = {
                body: Buffer.from(log.payload),
                headers: log.headers,
                app: req.app, // Pass the app instance to access 'io'
            };

            // Mock response to capture outcome without sending a real HTTP response
            const mockRes = {
                statusCode: 200, // Default
                body: null,
                status: function(code) { this.statusCode = code; return this; },
                json: function(data) { this.body = data; },
                send: function(data) { this.body = data; },
            };

            await paymentController.webhookHandler(mockReq, mockRes);
            
            results.successes++;
            results.details.push({ logId, status: 'success', eventType: log.eventType });

        } catch (error) {
            results.failures++;
            results.details.push({ logId, status: 'error', message: error.message });
            logger.error(`Error in bulk replay for webhook ${logId}:`, error);
        }
    }

    await new AuditLog({
        adminUserId,
        action: 'bulk_replay_webhooks',
        reason: reason || 'Bulk replay from admin dashboard.',
        metadata: {
            totalAttempted: logIds.length,
            successes: results.successes,
            failures: results.failures,
            logIds,
        }
    }).save();

    res.json({
        success: results.failures === 0,
        message: `Bulk replay complete. Successes: ${results.successes}, Failures: ${results.failures}.`,
        results: results.details,
    });
};

exports.requestPasswordResetByAdmin = async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user._id;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'Reason for password reset is required.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // This is where you would typically call your email service to send a password reset link.
        // For now, it's a placeholder, but the audit log is crucial.
        console.log(`Admin ${adminUserId} initiated password reset for user ${user.email} (ID: ${userId}) for reason: ${reason}`);

        await AuditLog.create({
            adminUserId: adminUserId,
            targetUserId: userId,
            action: 'password_reset_initiated_by_admin',
            reason: reason,
            metadata: { userEmail: user.email }
        });

        // In a real scenario, integrate with your password reset service here.
        // e.g., await emailService.sendPasswordResetEmail(user.email, resetToken);

        res.json({ success: true, message: `Password reset initiated for ${user.email}. An email with reset instructions has been sent.` });

    } catch (error) {
        logger.error('Error in requestPasswordResetByAdmin:', { userId, adminUserId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error initiating password reset.', error: error.message });
    }
};

exports.verifyUserEmailByAdmin = async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user._id;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'Reason for email verification is required.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Assuming you have an 'isEmailVerified' field on the User model.
        // If not, you'd update whatever field indicates email verification status.
        // For this example, I'll add a placeholder if it doesn't exist.
        if (user.isEmailVerified === undefined) {
          user.isEmailVerified = true; // Add it dynamically for this example
        } else {
          user.isEmailVerified = true;
        }
        await user.save();

        await AuditLog.create({
            adminUserId: adminUserId,
            targetUserId: userId,
            action: 'email_verified_by_admin',
            reason: reason,
            metadata: { userEmail: user.email }
        });

        res.json({ success: true, message: `Email for ${user.email} successfully verified.` });

    } catch (error) {
        logger.error('Error in verifyUserEmailByAdmin:', { userId, adminUserId, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error verifying user email.', error: error.message });
    }
};

exports.updateDashboardPreferences = async (req, res) => {
    const { preferences } = req.body;
    const userId = req.user.id;

    if (preferences === null || (Array.isArray(preferences) && preferences.length === 0)) {
        try {
            await User.updateOne({ _id: userId }, { $unset: { dashboardPreferences: "", adminDashboardKpiConfig: "" } });
            return res.json({ success: true, message: 'Dashboard preferences reset successfully.' });
        } catch (error) {
            logger.error('[adminController.updateDashboardPreferences] Error resetting preferences', { error: error.message, userId });
            return res.status(500).json({ success: false, message: 'Server error while resetting preferences.' });
        }
    }

    if (!preferences || !Array.isArray(preferences)) {
        return res.status(400).json({ success: false, message: 'Invalid preference format. "preferences" must be an array.' });
    }

    try {
        const adminUser = await User.findById(userId);

        if (!adminUser) {
            return res.status(404).json({ success: false, message: 'Admin user not found.' });
        }

        const preferencesCopy = JSON.parse(JSON.stringify(preferences));

        const kpiGridWidget = preferencesCopy.find(p => p.key === 'adminKpiGrid');
        if (kpiGridWidget && kpiGridWidget.settings && kpiGridWidget.settings.kpis) {
            adminUser.adminDashboardKpiConfig = kpiGridWidget.settings.kpis;
            delete kpiGridWidget.settings.kpis;
        }

        adminUser.dashboardPreferences = preferencesCopy;
        await adminUser.save();

        res.json({
            success: true,
            message: 'Dashboard preferences updated successfully.',
            data: adminUser.dashboardPreferences,
        });
    } catch (error) {
        logger.error('[adminController.updateDashboardPreferences] Error updating preferences', {
            error: error.message,
            userId,
        });
        res.status(500).json({ success: false, message: 'Server error while updating preferences.' });
    }
};

exports.updatePayoutStatus = async (req, res) => {
  const { paymentId } = req.params;
  const { action, reason } = req.body; // action can be 'hold', 'release', 'retry'
  const adminUserId = req.user._id;

  logger.warn(`[AdminController] Admin ${adminUserId} is attempting to '${action}' payout for payment ${paymentId}.`);

  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    const originalStatus = payment.payoutStatus;
    let successMessage = '';

    switch (action) {
      case 'hold':
        if (payment.payoutStatus !== 'pending') {
          return res.status(400).json({ success: false, message: `Cannot hold payout. Status is '${payment.payoutStatus}'.` });
        }
        payment.payoutStatus = 'on_hold';
        successMessage = 'Payout has been placed on hold.';
        break;
      
      case 'release':
        if (payment.payoutStatus !== 'on_hold') {
          return res.status(400).json({ success: false, message: `Cannot release payout. Status is '${payment.payoutStatus}'.` });
        }
        payment.payoutStatus = 'pending';
        payment.nextPayoutAttemptAt = new Date();
        successMessage = 'Payout has been released and is pending processing.';
        break;

      case 'retry':
        if (payment.payoutStatus !== 'failed') {
          return res.status(400).json({ success: false, message: `Cannot retry payout. Status is '${payment.payoutStatus}'.` });
        }
        payment.payoutStatus = 'pending';
        payment.payoutAttempts = 0;
        payment.nextPayoutAttemptAt = new Date();
        successMessage = 'Failed payout has been scheduled for a retry.';
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid action specified.' });
    }

    await payment.save();

    await AuditLog.create({
      adminUserId,
      targetUserId: payment.recipient,
      action: `payout_${action}`,
      reason: reason,
      metadata: {
        paymentId: payment._id,
        originalStatus: originalStatus,
        newStatus: payment.payoutStatus,
      }
    });
    
    // Send notification to coach
    if (action === 'hold' || action === 'release') {
        const netPayoutAmount = payment.amount.total - payment.amount.platformFee;
        try {
            await UnifiedNotificationService.sendNotification({
                type: action === 'hold' ? NotificationTypes.PAYOUT_ON_HOLD : NotificationTypes.PAYOUT_RELEASED,
                recipient: payment.recipient.toString(),
                recipientType: 'coach',
                metadata: {
                    paymentId: payment._id.toString(),
                    payoutAmount: netPayoutAmount.toFixed(2),
                    currency: payment.amount.currency,
                    adminReason: reason,
                }
            }, payment); // Pass the 'payment' object as the context
        } catch (notificationError) {
            logger.error(`[AdminController] Failed to send payout status notification for payment ${paymentId}, but the status was updated successfully.`, {
                error: notificationError.message,
                adminUserId,
                action
            });
        }
         }

    console.log(`[AdminController] Payout status for payment ${paymentId} updated to '${payment.payoutStatus}' by admin ${adminUserId}.`);

    res.json({ success: true, message: successMessage, payment: payment });

  } catch (error) {
    logger.error(`[AdminController] Error during payout status update for payment ${paymentId}.`, {
      error: error.message,
      stack: error.stack,
      adminUserId,
      action
    });
    res.status(500).json({ success: false, message: 'An internal error occurred.' });
  }
};

exports.executeAdminRefund = async (req, res) => {
    const { paymentId } = req.params;
    const { amount, reason, policyType } = req.body;
    const adminUserId = req.user._id;

    try {
        const result = await AdminFinancialService.processRefund({
            paymentId,
            amount: parseFloat(amount),
            reason,
            policyType,
            initiatorId: adminUserId,
        });
        res.status(200).json({ success: true, message: 'Refund processed successfully.', data: result });
    } catch (error) {
        logger.error('[adminController.executeAdminRefund] Failed to execute refund.', { error: error.message, paymentId, adminUserId });
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAdminDisputes = async (req, res) => {
    try {
        const { status, sortKey = 'updatedAt', sortDirection = 'desc' } = req.query;
        let query = {};
        if (status && status !== 'all') {
            query.status = status;
        } else {
             query.status = { $in: ['escalated_to_admin', 'closed', 'resolved', 'resolved_by_coach'] };
        }

        const sort = { [sortKey]: sortDirection === 'asc' ? 1 : -1 };

        const tickets = await SupportTicket.find(query)
            .populate('user', 'firstName lastName email')
            .populate({
                path: 'booking',
                select: 'title coach',
                populate: {
                    path: 'coach',
                    select: 'firstName lastName'
                }
            })
            .sort(sort);
            
        res.json(tickets);
    } catch (error) {
        logger.error('[adminController.getAdminDisputes] Failed to fetch disputes.', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to fetch disputes.' });
    }
};

exports.getDisputeDetail = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticket = await SupportTicket.findById(ticketId)
            .populate('user', 'firstName lastName email profilePicture')
            .populate({
                path: 'booking',
                populate: { path: 'coach', select: 'firstName lastName email profilePicture' }
            })
            .populate({
                path: 'payment',
                select: 'amount status payoutStatus refunds',
                populate: {
                    path: 'refunds.processedBy',
                    model: 'User',
                    select: 'firstName lastName role'
                }
            })
            .lean();

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Dispute ticket not found.' });
        }

        if (ticket.booking && ticket.booking.coach) {
            const coachProfile = await Coach.findOne({ user: ticket.booking.coach._id }).select('profilePicture').lean();
            if (coachProfile) {
                ticket.booking.coach.coachProfilePicture = coachProfile.profilePicture;
            }
        }

        res.json(ticket);
    } catch (error) {
        logger.error('[adminController.getDisputeDetail] Failed to fetch dispute detail.', { error: error.message, ticketId: req.params.ticketId });
        res.status(500).json({ success: false, message: 'Failed to fetch dispute details.' });
    }
};

exports.resolveDispute = async (req, res) => {
    const { ticketId } = req.params;
    const adminUserId = req.user._id;
    console.log(`[adminController.resolveDispute] API HIT | Admin: ${adminUserId}, Ticket: ${ticketId}, Payload:`, req.body);
    const { finalAmount, policy, notes, decision } = req.body;

    try {
        const ticket = await refundRequestService.resolveDisputeByAdmin({
            adminId: adminUserId,
            ticketId,
            finalAmount: parseFloat(finalAmount) || 0,
            policy,
            notes,
            decision
        });
        res.status(200).json({ success: true, message: 'Dispute resolved successfully.', data: ticket });
    } catch (error) {
        logger.error('[adminController.resolveDispute] Failed to resolve dispute.', { error: error.message, ticketId, adminUserId });
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getVatReport = async (req, res) => {
    const { startDate, endDate, search, sortField = 'createdAt', sortOrder = 'desc' } = req.query;
    const logContext = { query: req.query, function: 'getVatReport' };
    console.log(`[VAT REPORT] 1. STARTING: ${logContext.function}`, logContext);

    try {
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required.' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const invoiceFilter = { createdAt: { $gte: start, $lte: end } };
        if (search && mongoose.Types.ObjectId.isValid(search)) {
            invoiceFilter.payment = new mongoose.Types.ObjectId(search);
        }

        const documents = await Invoice.find(invoiceFilter)
            .populate('senderUser', 'firstName lastName')
            .populate('recipientUser', 'firstName lastName')
            .lean();

        console.log(`[VAT REPORT] 2. Found ${documents.length} invoice documents matching filters.`);

        const paymentIds = [...new Set(documents.map(doc => doc.payment?.toString()).filter(Boolean))];

        const [payments, refundedVatTransactions] = await Promise.all([
             Payment.find({ _id: { $in: paymentIds } }).lean(),
             Transaction.find({ payment: { $in: paymentIds }, type: 'refund' }).lean()
        ]);
        
        const paymentsMap = new Map(payments.map(p => [p._id.toString(), p]));
        const refundedVatMap = new Map();
        refundedVatTransactions.forEach(tx => {
            const current = refundedVatMap.get(tx.payment.toString()) || 0;
            refundedVatMap.set(tx.payment.toString(), current + (tx.metadata.vatReclaimed || 0));
        });

        let totalInputVat = 0;
        let totalOutputVat = 0;

        let documentsForFrontend = documents.map(doc => {
            let finalVatAmount = 0;
            let finalNetAmount = 0;
            const payment = paymentsMap.get(doc.payment?.toString());

            if (doc.invoiceParty === 'coach_to_platform') {
                finalVatAmount = doc.vatAmount || 0;
                finalNetAmount = doc.netAmount !== undefined ? doc.netAmount : doc.amountPaid - finalVatAmount;
            } else { // platform_to_client
                const paymentVat = payment?.amount?.vat?.amount || 0;
                if (doc.type === 'invoice') {
                    finalVatAmount = paymentVat;
                } else { // credit_note
                    const refundedVat = refundedVatMap.get(doc.payment?.toString()) || 0;
                    finalVatAmount = -refundedVat;
                }
                finalNetAmount = doc.amountPaid - finalVatAmount;
            }
            
            let partyName = 'N/A';
            if (doc.invoiceParty === 'platform_to_client' && doc.recipientUser) {
                 partyName = `${doc.recipientUser.firstName} ${doc.recipientUser.lastName}`;
            } else if (doc.invoiceParty === 'coach_to_platform' && doc.senderUser) {
                 partyName = `${doc.senderUser.firstName} ${doc.senderUser.lastName}`;
            } else if (doc.recipientUser) { // Fallback
                 partyName = `${doc.recipientUser.firstName} ${doc.recipientUser.lastName}`;
            }
            
            return {
                _id: doc._id,
                date: doc.createdAt,
                partyName,
                paymentId: doc.payment?.toString(),
                documentType: doc.type,
                documentParty: doc.invoiceParty,
                netAmount: finalNetAmount,
                vatAmount: finalVatAmount,
                totalAmount: doc.amountPaid,
                pdfUrl: doc.pdfUrl || doc.stripeHostedUrl,
                type: doc.type,
            };
        });

        documentsForFrontend.forEach(doc => {
            if (doc.documentParty === 'coach_to_platform') {
                totalInputVat += doc.vatAmount;
            } else {
                totalOutputVat += doc.vatAmount;
            }
        });

        const sortKeyMap = { createdAt: 'date', payment: 'paymentId', type: 'documentType', netAmount: 'netAmount', vatAmount: 'vatAmount', amountPaid: 'totalAmount', partyName: 'partyName' };
        const sortByKey = sortKeyMap[sortField] || 'date';
        const sortOrderVal = sortOrder === 'asc' ? 1 : -1;

        documentsForFrontend.sort((a, b) => {
            let valA = a[sortByKey];
            let valB = b[sortByKey];
            if (valA == null) return 1;
            if (valB == null) return -1;
            if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * sortOrderVal;
            if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * sortOrderVal;
            if (new Date(valA) > new Date(valB)) return 1 * sortOrderVal;
            if (new Date(valA) < new Date(valB)) return -1 * sortOrderVal;
            return 0;
        });

        const netTaxOwed = totalOutputVat - totalInputVat;
        const summary = { totalInputVat, totalOutputVat, netTaxOwed };
        
        console.log(`[VAT REPORT] 3. SUCCESS: Final response prepared.`, { summary });
        res.json({ summary, documents: documentsForFrontend });

    } catch (error) {
        console.error(`[VAT REPORT] 4. CRITICAL ERROR:`, { error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

exports.getB2bDocumentForAdmin = async (req, res) => {
    const { invoiceId } = req.params;
    const logContext = { invoiceId, adminId: req.user._id };

    try {
        const document = await Invoice.findById(invoiceId);

        if (!document || document.invoiceParty !== 'coach_to_platform') {
            logger.warn('[adminController] Admin requested B2B document not found.', logContext);
            return res.status(404).json({ message: 'Document not found.' });
        }

        if (!document.pdfUrl) {
            logger.warn('[adminController] B2B document found, but PDF URL is missing.', logContext);
            return res.status(404).json({ message: 'PDF for this document is not available.' });
        }

        res.json({ pdfUrl: document.pdfUrl });

    } catch (error) {
        logger.error('[adminController] Error fetching B2B document for admin.', { ...logContext, error: error.message });
        res.status(500).send('Server Error');
    }
};

exports.downloadSettlementAdviceForCoach = async (req, res) => {
    const { paymentId } = req.params;
    const logContext = { paymentId, adminId: req.user._id };

    try {
        const payment = await Payment.findById(paymentId).populate('recipient');
        if (!payment || !payment.recipient) {
            logger.warn('[adminController] Payment or recipient not found for settlement advice generation.', logContext);
            return res.status(404).json({ message: 'Payment record or associated coach not found.' });
        }
        
        const coach = payment.recipient;
        const lang = req.query.lang || 'en';
        
        const { pdfBuffer, filename } = await settlementAdviceService.generatePdf(payment, lang);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ADMIN_COPY_${filename}"`);
        res.send(pdfBuffer);
        
    } catch (error) {
        logger.error('[adminController] Failed to generate settlement advice for admin.', { ...logContext, error: error.message });
        if (!res.headersSent) {
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: 'Settlement advice data not found.' });
            }
            res.status(500).send('Server Error');
        }
    }
};


exports.getVatThresholdSummary = async (req, res) => {
    const logContext = { function: 'getVatThresholdSummary' };
    try {
        const EU_COUNTRY_CODES = [
            'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
            'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'
        ];
        
        // IMPORTANT: For 100% accuracy, this rate should come from a live API or be updated periodically.
        // For monitoring dashboard purposes, a stable, conservative rate is acceptable.
        const EU_THRESHOLD_EUR = 10000;
        const APPROX_CHF_TO_EUR_RATE = 1.05; // 1 EUR = 1.05 CHF.

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

        const aggregationPipeline = [
            {
                $match: {
                    createdAt: { $gte: startOfYear, $lte: endOfYear },
                    status: { $in: ['completed', 'succeeded'] },
                    type: { $in: ['charge', 'program_purchase', 'live_session_charge', 'overtime_charge'] },
                    // Use the customer's location stored in the price snapshot for accuracy
                    "priceSnapshot.customerLocation.country": { $in: EU_COUNTRY_CODES }
                }
            },
            {
                $group: {
                    _id: null,
                    totalEuSalesCHF: { $sum: "$amount.total" },
                    transactionCount: { $sum: 1 }
                }
            }
        ];

        const result = await Payment.aggregate(aggregationPipeline);
        const summary = result[0] || { totalEuSalesCHF: 0, transactionCount: 0 };
        
        const totalEuSalesEUR = summary.totalEuSalesCHF / APPROX_CHF_TO_EUR_RATE;
        const percentageOfThreshold = (totalEuSalesEUR / EU_THRESHOLD_EUR) * 100;

        const response = {
            thresholdEUR: EU_THRESHOLD_EUR,
            totalEuSalesEUR: parseFloat(totalEuSalesEUR.toFixed(2)),
            percentage: parseFloat(percentageOfThreshold.toFixed(2)),
            transactionCount: summary.transactionCount,
            source: 'internal_aggregation',
            timeframe: {
                start: startOfYear.toISOString(),
                end: endOfYear.toISOString()
            }
        };

        res.json(response);

    } catch (error) {
        logger.error(`[adminController] ERROR in ${logContext.function}`, { ...logContext, error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

exports.deleteUser = async (req, res) => {
  const adminUserId = req.user._id;
  const { userId } = req.params;
  const { confirmationName } = req.body;

  try {
    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const expectedName = `${userToDelete.firstName} ${userToDelete.lastName}`;
    if (confirmationName !== expectedName) {
        return res.status(400).json({ msg: 'Confirmation name does not match.' });
    }

    await accountCleanupQueue.add('delete-user-attachments', { userId });
    await userDataDeletionQueue.add('delete-user-data', { userId });

    await AuditLog.create({
        adminUserId,
        targetUserId: userId,
        action: 'delete_user',
        reason: 'User deleted by admin from Master Action Panel.',
    });

    res.json({ msg: `Deletion process for ${expectedName} has been initiated.` });
  } catch (err) {
    logger.error('Error during admin user deletion:', { adminUserId, targetUserId: userId, error: err.message });
    res.status(500).send('Server Error');
  }
};

exports.getBlockedPairs = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;

        let pipeline = [
            { $match: { 'blockedUsers.0': { $exists: true } } },
            { $unwind: '$blockedUsers' },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'blockerInfo'
                }
            },
            { $unwind: '$blockerInfo' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'blockedUsers.user',
                    foreignField: '_id',
                    as: 'blockedInfo'
                }
            },
            { $unwind: '$blockedInfo' },
        ];

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            pipeline.push({
                $match: {
                    $or: [
                        { 'blockerInfo.firstName': searchRegex },
                        { 'blockerInfo.lastName': searchRegex },
                        { 'blockerInfo.email': searchRegex },
                        { 'blockedInfo.firstName': searchRegex },
                        { 'blockedInfo.lastName': searchRegex },
                        { 'blockedInfo.email': searchRegex },
                    ]
                }
            });
        }
        
        const countPipeline = [...pipeline, { $count: 'total' }];
        const totalResult = await User.aggregate(countPipeline);
        const count = totalResult[0]?.total || 0;

        pipeline.push({ $sort: { 'blockedUsers.createdAt': -1 } });
        pipeline.push({ $skip: (page - 1) * limit });
        pipeline.push({ $limit: parseInt(limit) });
        
        pipeline.push({
            $project: {
                _id: 0,
                blocker: {
                    _id: '$blockerInfo._id',
                    firstName: '$blockerInfo.firstName',
                    lastName: '$blockerInfo.lastName',
                    email: '$blockerInfo.email',
                },
                blocked: {
                    _id: '$blockedInfo._id',
                    firstName: '$blockedInfo.firstName',
                    lastName: '$blockedInfo.lastName',
                    email: '$blockedInfo.email',
                },
                createdAt: '$blockedUsers.createdAt'
            }
        });

        const blockedPairs = await User.aggregate(pipeline);

        res.json({
            blockedPairs,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            total: count
        });

    } catch (error) {
        logger.error('Error fetching blocked pairs:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.replayWebhook = async (req, res) => {
    const { logId } = req.params;
    const adminUserId = req.user.id;
  
    try {
        const log = await WebhookLog.findById(logId);
        if (!log) {
            return res.status(404).json({ message: 'Webhook log not found.' });
        }

        // Simulate a request object for the webhook handler
        const mockReq = {
            body: Buffer.from(log.payload),
            headers: log.headers,
            // The handler might not need the originalUrl, but it's good practice to include it
            originalUrl: '/api/payments/webhook',
        };

        // Simulate a response object to capture the result
        let handlerResponse = {};
        const mockRes = {
            status: (statusCode) => {
                handlerResponse.statusCode = statusCode;
                return {
                    send: (body) => { handlerResponse.body = body; },
                    json: (body) => { handlerResponse.body = body; },
                };
            },
            send: (body) => { handlerResponse.body = body; },
            json: (body) => { handlerResponse.body = body; },
        };
        
        await paymentController.webhookHandler(mockReq, mockRes);
        
        await new AuditLog({
            adminUserId,
            action: 'replay_webhook',
            reason: req.body.reason || 'Manual replay from admin dashboard.',
            metadata: {
                webhookLogId: logId,
                source: log.source,
                eventType: log.eventType,
                handlerStatusCode: handlerResponse.statusCode || 200,
            }
        }).save();

        res.json({ success: true, message: `Webhook ${log.eventType} replayed successfully.`, result: handlerResponse });
    } catch (error) {
        logger.error(`Error replaying webhook ${logId}:`, error);
        res.status(500).json({ message: 'Failed to replay webhook', error: error.message });
    }
};

exports.flushCacheKey = async (req, res) => {
    const { key } = req.body;
    const adminUserId = req.user.id;

    if (!key) {
        return res.status(400).json({ message: 'Cache key is required.' });
    }

    try {
        const wasDeleted = await cacheService.delete(key);

        if (!wasDeleted) {
            return res.status(404).json({ message: `Cache key '${key}' not found or already expired.` });
        }

        await new AuditLog({
            adminUserId,
            action: 'cache_flush_key',
            reason: 'Manual flush from admin dashboard.',
            metadata: { cacheKey: key }
        }).save();

        res.json({ success: true, message: `Cache key '${key}' flushed successfully.` });
    } catch (error) {
        logger.error(`Error flushing cache key '${key}':`, error);
        res.status(500).json({ message: 'Failed to flush cache key', error: error.message });
    }
};

exports.getModerationActionDetails = async (req, res) => {
    const { auditId } = req.params;
    const userId = req.user.id;

    try {
        const auditLog = await AuditLog.findById(auditId).lean();

        if (!auditLog) {
            return res.status(404).json({ message: 'Moderation action not found.' });
        }

        if (auditLog.targetUserId.toString() !== userId) {
            return res.status(403).json({ message: 'You are not authorized to view this record.' });
        }

        let originalContent = null;
        if (auditLog.targetEntity && auditLog.targetEntityId) {
            if (auditLog.targetEntity === 'review') {
                const review = await Review.findById(auditLog.targetEntityId).select('comment').lean();
                originalContent = review ? review.comment : 'Original content could not be retrieved.';
            }
        }
        
        const responseData = {
            action: auditLog.action,
            reason: auditLog.reason,
            createdAt: auditLog.createdAt,
            originalContent: originalContent,
            violatedGuideline: auditLog.metadata?.flagReason || 'general_guideline_violation'
        };

        res.json(responseData);

    } catch (error) {
        logger.error('Error fetching moderation action details:', { error: error.message, auditId, userId });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.removeUserWarning = async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user.id;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'A reason is required to remove a warning.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const currentWarningCount = user.moderation?.warningsCount || 0;
        if (currentWarningCount <= 0) {
            return res.status(400).json({ message: 'User has no active warnings to remove.' });
        }

        const newWarningCount = currentWarningCount - 1;
        user.moderation.warningsCount = newWarningCount;
        await user.save();

        await AuditLog.create({
            adminUserId,
            targetUserId: userId,
            action: 'admin_remove_warning',
            reason: reason,
            metadata: { previousWarningCount: currentWarningCount, newWarningCount: newWarningCount }
        });

        res.json({
            success: true,
            message: 'User warning successfully removed.',
            user: { _id: user._id, warningCount: newWarningCount }
        });

    } catch (error) {
        logger.error('Error removing user warning:', { error: error.message, stack: error.stack, adminUserId, targetUserId: userId });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getVerificationDocument = async (req, res) => {
    const { coachUserId, registryName } = req.params;
    const logContext = { coachUserId, registryName, adminUserId: req.user._id };
    console.log('[getVerificationDocument] Request received.', logContext);

    try {
        const coach = await Coach.findOne({ user: coachUserId }).select('settings.insuranceRecognition').lean();
        if (!coach) {
            logger.warn('[getVerificationDocument] Coach not found.', logContext);
            return res.status(404).json({ message: 'Coach not found.' });
        }
        console.log('[getVerificationDocument] Coach found.', logContext);

        const registry = coach.settings.insuranceRecognition.registries.find(r => r.name === registryName);
        if (!registry || !registry.verificationDocument?.publicId) {
            logger.warn('[getVerificationDocument] Verification document or publicId not found in registry.', logContext);
            return res.status(404).json({ message: 'Verification document not found.' });
        }
        const publicId = registry.verificationDocument.publicId;
        console.log(`[getVerificationDocument] Found publicId: ${publicId}. Generating signed URL.`, logContext);

        const secureUrl = cloudinary.url(publicId, {
            resource_type: 'raw',
            type: 'private',
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600
        });
        
        if (!secureUrl) {
             logger.error('[getVerificationDocument] Failed to generate signed URL from Cloudinary.', { ...logContext, publicId });
             return res.status(500).json({ message: 'Could not retrieve document URL.' });
        }
        
        console.log(`[getVerificationDocument] Successfully generated signed URL. Sending to client.`, { ...logContext, urlStart: secureUrl.substring(0, 80) });
        res.json({ secureUrl });

    } catch (error) {
        logger.error('[getVerificationDocument] CRITICAL ERROR during URL retrieval.', { ...logContext, errorName: error.name, errorMessage: error.message, stack: error.stack });
        res.status(500).json({ message: 'Could not generate secure URL.' });
    }
};

exports.getVerificationQueue = async (req, res) => {
    try {
        const { page = 1, limit = 15 } = req.query;
        const skip = (page - 1) * limit;

        const pipeline = [
            { $match: { 'settings.insuranceRecognition.registries.status': 'pending_review' } },
            { $unwind: '$settings.insuranceRecognition.registries' },
            { $match: { 'settings.insuranceRecognition.registries.status': 'pending_review' } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            { $unwind: '$userData' },
            {
                $project: {
                    _id: 0,
                    coach: {
                        _id: '$user',
                        firstName: '$userData.firstName',
                        lastName: '$userData.lastName',
                        trustScore: '$userData.trustScore'
                    },
                    registry: '$settings.insuranceRecognition.registries'
                }
            }
        ];

        const countPipeline = [...pipeline, { $count: 'total' }];
        const totalResult = await Coach.aggregate(countPipeline);
        const totalItems = totalResult[0]?.total || 0;

        pipeline.push({ $sort: { 'registry.submittedAt': 1 } });
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parseInt(limit) });

        const items = await Coach.aggregate(pipeline);

        res.json({
            items,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: parseInt(page),
            totalItems
        });
    } catch (error) {
        logger.error('[getVerificationQueue] Error fetching verification queue', { error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.resolveVerificationRequest = async (req, res) => {
    const { coachUserId, registryName, action, expiryDate, rejectionReasonKey, adminNotes } = req.body;
    const adminUserId = req.user._id;
    const socketService = getSocketService();

    try {
        const coach = await Coach.findOne({ user: coachUserId });
        if (!coach) return res.status(404).json({ message: 'Coach not found.' });

        const registryIndex = coach.settings.insuranceRecognition.registries.findIndex(r => r.name === registryName);
        if (registryIndex === -1) return res.status(404).json({ message: 'Registry not found.' });

        const registry = coach.settings.insuranceRecognition.registries[registryIndex];
        const publicIdToDelete = registry.verificationDocument?.publicId;

        let auditAction, notificationType, notificationMetadata;

       if (action === 'approve') {
            if (!expiryDate) return res.status(400).json({ message: 'Expiry date is required for approval.' });

            registry.status = 'verified';
            registry.expiryDate = new Date(expiryDate);
            registry.rejectionReasonKey = undefined;
            registry.adminNotes = undefined;
            auditAction = 'approve_coach_verification';
            notificationType = NotificationTypes.COACH_VERIFICATION_APPROVED;
            notificationMetadata = { registryName, expiryDate };

         } else if (action === 'reject') {
            if (!rejectionReasonKey) return res.status(400).json({ message: 'Rejection reason is required.' });

            registry.status = 'rejected';
            registry.expiryDate = undefined;
            registry.rejectionReasonKey = rejectionReasonKey;
            registry.adminNotes = adminNotes;
            auditAction = 'reject_coach_verification';
            notificationType = NotificationTypes.COACH_VERIFICATION_REJECTED;
            notificationMetadata = { registryName, rejection_reason: rejectionReasonKey, adminNotes };
        } else {
            return res.status(400).json({ message: 'Invalid action.' });
        }
        
        registry.lastReviewedAt = new Date();
        coach.markModified('settings.insuranceRecognition.registries');
        await coach.save();

        if (publicIdToDelete) {
             accountCleanupQueue.add('delete-cloudinary-asset', { publicId: publicIdToDelete });
        }

        await AuditLog.create({
            adminUserId,
            targetUserId: coachUserId,
            action: auditAction,
            metadata: { registryName, expiryDate, rejectionReasonKey }
        });

        console.log('[DATA TRACE | adminController] Triggering COACH_VERIFICATION_REJECTED with metadata:', notificationMetadata);

         await UnifiedNotificationService.sendNotification({
            type: notificationType,
            recipient: coachUserId.toString(),
            recipientType: 'coach',
            metadata: notificationMetadata
        }, null, getSocketService());
        
        getSocketService().emitToAdmins('verification_action_complete', { coachUserId, registryName, status: registry.status });

        res.json({ success: true, message: `Verification for ${registryName} has been ${action}d.` });
    } catch (error) {
        logger.error('[resolveVerificationRequest] Error resolving request', { error: error.message });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getLeads = async (req, res) => {
    try {
        const { page = 1, limit = 20, type = '', search = '' } = req.query;
        const query = {};
        if (type) {
            query.type = type;
        }
        if (search) {
            query.email = { $regex: search, $options: 'i' };
        }

        const leads = await Lead.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        const count = await Lead.countDocuments(query);

        res.json({
            leads,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalLeads: count,
        });
    } catch (err) {
        logger.error('[adminController.getLeads] Error fetching leads', { error: err.message, stack: err.stack });
        res.status(500).send('Server Error');
    }
};