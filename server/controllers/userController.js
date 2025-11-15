const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Coach = require('../models/Coach');
const Review = require('../models/Review');
const Client = require('../models/Client');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Program = require('../models/Program'); 
const EmailChangeRequest = require('../models/EmailChangeRequest');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const PriceConfiguration = require('../models/PriceConfiguration');
const Invoice = require('../models/Invoice');
const { transformIdToUnderscoreId } = require('../utils/idTransformer');
const cloudinary = require('../utils/cloudinaryConfig');
const { auth } = require('../middleware/auth');
const Connection = require('../models/Connection');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const path = require('path');
const FsBackend = require('i18next-fs-backend');
const { validationResult } = require('express-validator');
const { accountCleanupQueue, userDataDeletionQueue } = require('../services/jobQueueService');
const assetCleanupService = require('../services/assetCleanupService');
const unifiedNotificationService = require('../services/unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const { i18next } = require('../config/i18n');

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const payload = {
      user: {
        id: user._id,
        role: user.role,
        version: user.tokenVersion
      }
    };

    jwt.sign(
      payload,
      config.jwt.secret,
      { expiresIn: config.jwt.expire },
      (err, token) => {
        if (err) throw err;
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 24 * 60 * 60 * 1000
        }).json({
          msg: 'Logged in successfully',
          token,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role
          }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUser = req.user;

    const currentUserInfo = await User.findById(currentUser._id).select('blockedUsers').lean();
    const blockedUserIds = currentUserInfo.blockedUsers.map(b => b.user);

    let searchCriteria = {
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      _id: { $ne: currentUser._id, $nin: blockedUserIds },
      'blockedUsers.user': { $ne: currentUser._id }
    };

    if (currentUser.role !== 'admin') {
      searchCriteria.profileVisibility = { $in: ['public', 'connections_only'] };
    }

    const users = await User.find(searchCriteria).select('firstName lastName email role profileVisibility');

    const filteredUsers = await Promise.all(users.map(async (user) => {
      if (user.profileVisibility === 'connections_only') {
        const connection = await Connection.findOne({
          $or: [
            { coach: currentuser._id, client: user._id },
            { coach: user._id, client: currentuser._id }
          ],
          status: 'accepted'
        });
        return connection ? user : null;
      }
      return user;
    }));

    res.json(filteredUsers.filter(user => user !== null));
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Error searching users', error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const user = new User({ name, email, password, role });
    await user.save();
    res.status(201).json({ message: 'User created successfully', userId: user._id });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.registerUser = async (req, res) => {
  console.log(`[userController.js] >>>>> ENTERED: registerUser function at ${new Date().toISOString()}`);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('[userController.js] Validation errors found:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    console.log('[userController.js] Registration request body:', req.body);
    const { firstName, lastName, email, password, role, dateOfBirth } = req.body; 

    if (!dateOfBirth) {
        return res.status(400).json({ msg: 'Date of birth is required.' });
    }
    const birthDate = new Date(dateOfBirth);
    let age = new Date().getFullYear() - birthDate.getFullYear();
    const monthDiff = new Date().getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && new Date().getDate() < birthDate.getDate())) {
        age--;
    }

    if (age < 18) {
        return res.status(400).json({ msg: 'You must be at least 18 years old to register.' });
    }
    
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userLang = req.headers['accept-language']?.split(',')[0] || 'en';
    await i18next.loadLanguages(userLang);
    const t = i18next.getFixedT(userLang);
    const termsVersion = t('version', { lng: userLang });
    const privacyVersion = "2024-05-21";

    user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      dateOfBirth,
      role: role || 'client',
      termsAcceptance: {
        version: termsVersion,
        acceptedAt: new Date(),
        ipAddress: req.ip
      },
      privacyPolicyAcceptance: {
        version: privacyVersion,
        acceptedAt: new Date(),
        ipAddress: req.ip
      },
      emailVerificationToken: crypto.createHash('sha256').update(crypto.randomBytes(32).toString('hex')).digest('hex'),
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });
    
    const rawToken = user.emailVerificationToken; // Temporarily hold for email link
    user.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    await user.save();
    console.log(`[userController.js] User ${user._id} saved successfully.`);

    // --- FIRE AND FORGET NOTIFICATIONS (NON-BLOCKING) ---
    (async () => {
      try {
        console.log(`[userController.js] Starting background notification task for user ${user._id}`);
        const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${rawToken}`;
        
        console.log(`[userController.js] Triggering EMAIL_VERIFICATION for user ${user._id}`);
        await unifiedNotificationService.sendNotification({
          type: NotificationTypes.EMAIL_VERIFICATION,
          recipient: user._id,
          channels: ['email'],
          metadata: { firstName: user.firstName, verification_link: verificationLink }
        });
        console.log(`[userController.js] EMAIL_VERIFICATION task sent for user ${user._id}`);

        console.log(`[userController.js] Triggering WELCOME notification for user ${user._id}`);
        await unifiedNotificationService.sendNotification({
          type: NotificationTypes.WELCOME,
          recipient: user._id,
          channels: ['email'],
          metadata: { firstName: user.firstName, button_url: `${process.env.FRONTEND_URL}/dashboard` }
        });
        console.log(`[userController.js] WELCOME notification task sent for user ${user._id}`);
        console.log(`[userController.js] Background notification task finished successfully for user ${user._id}`);
      } catch (notificationError) {
        logger.error(`[userController.js] CRITICAL: Background notification task failed for user ${user._id}`, { error: notificationError.message, stack: notificationError.stack });
      }
    })();
    // --- END OF NOTIFICATIONS ---

    console.log(`[userController.js] Notifications dispatched. Proceeding to generate JWT for user ${user._id}.`);

    const payload = {
      user: {
        id: user._id,
        role: user.role,
        version: user.tokenVersion
      }
    };

    jwt.sign(
      payload,
      config.jwt.secret,
      { expiresIn: config.jwt.expire },
      (err, token) => {
        if (err) {
            logger.error(`[userController.js] JWT signing error for user ${user._id}`, { error: err.message });
            // Even if JWT fails, we must not let the request hang.
            return res.status(500).send('Server error during authentication.');
        }
        console.log(`[userController.js] JWT signed successfully. Sending final response for user ${user._id}.`);
        res.status(201).json({ 
          token,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
          }
        });
      }
    );
  } catch (err) {
    logger.error(`[userController.js] CRITICAL ERROR in registerUser: ${err.message}`, { stack: err.stack });
    res.status(500).send('Server error');
  }
};

exports.updateUserOnboarding = async (req, res) => {
  try {
    const userId = req.user._id;
    const { primaryGoal, preferredLearningStyle, experienceLevel, interests, budget, notificationPreferences } = req.body;
    
    const updateData = {
      'onboardingStatus.completed': true,
      'onboardingStatus.lastStep': 'completed',
    };
    
    if (primaryGoal) updateData.primaryGoal = primaryGoal;
    if (preferredLearningStyle) updateData.preferredLearningStyle = preferredLearningStyle;
    if (experienceLevel) updateData.experienceLevel = experienceLevel;
    if (interests) updateData.coachingNeeds = interests;

    const user = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'Onboarding data saved successfully.', user });

  } catch (error) {
    logger.error('Error updating user onboarding data:', { error: error.message, stack: error.stack, userId: req.user?._id });
    res.status(500).json({ message: 'Error saving onboarding data.' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).send('Server error');
  }
};

exports.getUserStatus = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email }).select('status');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({ status: user.status });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.updateUserStatus = async (req, res) => {
  const userId = req.user?._id;
  console.log(`[userController] Updating status for user: ${userId}`);
  try {
    const { status } = req.body;
    if (!status) {
      console.log(`[userController] Invalid status update request for user: ${userId}`);
      return res.status(400).json({ msg: 'Status is required' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { status } },
      { new: true }
    ).select('status');
    
    if (!user) {
      console.log(`[userController] User not found for status update: ${userId}`);
      return res.status(404).json({ msg: 'User not found' });
    }
    
    console.log(`[userController] Status updated for user: ${userId}, New status: ${user.status}`);
    
    if (req.io) {
      req.io.to(userId.toString()).emit('status_update', user.status);
    }
    
    res.json({ status: user.status });
  } catch (err) {
    console.error(`[userController] Error updating user status for ${userId}:`, err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.updateUserStatusSocket = async (userId, status) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { status } },
      { new: true }
    ).select('status');

    if (!user) {
      console.log(`[userController] User not found for status update: ${userId}`);
      return null;
    }

    console.log(`[userController] Status updated for user: ${userId}, New status: ${user.status}`);
    return user.status;
  } catch (err) {
    console.error(`[userController] Error updating user status for ${userId}:`, err);
    return null;
  }
};

exports.bookSession = async (req, res) => {
  try {
    const { coachId, date, duration } = req.body;
    const clientId = req.user._id;

    const coachDoc = await Coach.findById(coachId).select('user').lean();
    if (!coachDoc) {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    const coachUserId = coachDoc.user;

    const [client, coachUser] = await Promise.all([
        User.findById(clientId).select('blockedUsers').lean(),
        User.findById(coachUserId).select('blockedUsers').lean()
    ]);

    if (!client || !coachUser) {
        return res.status(404).json({ message: "User associated with booking not found." });
    }

    const clientBlockedCoach = client.blockedUsers.some(b => b.user.equals(coachUser._id));
    const coachBlockedClient = coachUser.blockedUsers.some(b => b.user.equals(client._id));

    if (clientBlockedCoach || coachBlockedClient) {
        return res.status(403).json({ message: "You are not allowed to interact with this user." });
    }

    const booking = new Booking({
      coach: coachId,
      user: clientId,
      date,
      duration
    });

    await booking.save();

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getUserBookings = async (req, res) => {
  const userId = req.user._id;
  try {
    console.log('[getUserBookings] Fetching bookings for user:', { userId });
    const bookings = await Booking.find({ user: userId })
      .populate({
        path: 'coach',
        populate: {
          path: 'user',
          select: 'firstName lastName profilePicture'
        }
      })
      .populate('sessionType')
      .sort({ start: -1 })
      .lean();
    
    console.log(`[getUserBookings] Found ${bookings.length} raw bookings for user.`, { userId });

    if (bookings.length > 0) {
        const bookingIds = bookings.map(b => b._id);
        console.log('[getUserBookings] Querying payments for booking IDs:', { count: bookingIds.length, bookingIds });

        const paymentsForBookings = await Payment.find({ booking: { $in: bookingIds } }).select('booking status').lean();
        console.log(`[getUserBookings] Found ${paymentsForBookings.length} associated payments.`, { userId });
        
        const paymentMap = new Map(paymentsForBookings.map(p => [p.booking.toString(), p.status]));
        console.log('[getUserBookings] Constructed payment map.', { mapSize: paymentMap.size, mapContent: Object.fromEntries(paymentMap) });

        bookings.forEach(booking => {
            const bookingIdStr = booking._id.toString();
            const price = booking.price?.final?.amount?.amount;
            booking.paymentStatus = paymentMap.get(bookingIdStr) || (price > 0 ? 'payment_required' : 'not_applicable');
        });
        
        console.log('[getUserBookings] First booking object after enrichment:', { firstBooking: bookings[0] });
    }

    res.json(bookings);
  } catch (error) {
    logger.error('Error fetching user bookings:', { userId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error fetching bookings' });
  }
};

exports.addReview = async (req, res) => {
  try {
    const { coachId, rating, comment } = req.body;
    const clientId = req.user._id;

    const coachDoc = await Coach.findById(coachId).select('user').lean();
    if (!coachDoc) {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    const coachUserId = coachDoc.user;

    const [client, coachUser] = await Promise.all([
        User.findById(clientId).select('blockedUsers').lean(),
        User.findById(coachUserId).select('blockedUsers').lean()
    ]);

    if (!client || !coachUser) {
        return res.status(404).json({ message: "User associated with review not found." });
    }

    const clientBlockedCoach = client.blockedUsers.some(b => b.user.equals(coachUser._id));
    const coachBlockedClient = coachUser.blockedUsers.some(b => b.user.equals(client._id));

    if (clientBlockedCoach || coachBlockedClient) {
        return res.status(403).json({ message: "You are not allowed to interact with this user." });
    }

    const review = new Review({
      coach: coachId,
      user: clientId,
      rating,
      comment
    });

    await review.save();

    res.json(review);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getCoachReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ coach: req.params.coachId }).populate('user', 'firstName lastName');
    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const requesterId = req.user._id;

    // Fetch both users to check for blocks and visibility
    const [targetUser, requester] = await Promise.all([
        User.findById(targetUserId).select('-password'),
        User.findById(requesterId).select('blockedUsers')
    ]);

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Security Check 1: Check if requester has blocked the target user.
    if (requester.blockedUsers.some(b => b.user.equals(targetUserId))) {
        return res.status(403).json({ message: 'You cannot view this profile.' });
    }
    
    // Security Check 2: Check if the target user has blocked the requester.
    if (targetUser.blockedUsers.some(b => b.user.equals(requesterId))) {
        return res.status(403).json({ message: 'This user is not available.' });
    }

    // Privacy Check: Handle 'connections_only' visibility
    if (targetUser.profileVisibility === 'connections_only') {
      const connection = await Connection.findOne({
        status: 'accepted',
        $or: [
          { $and: [{ 'users.user': requesterId }, { 'users.user': targetUserId }] }
        ]
      });
      if (!connection) {
        return res.status(403).json({ message: 'This profile is private.' });
      }
    } else if (targetUser.profileVisibility === 'private') {
        return res.status(403).json({ message: 'This profile is private.' });
    }
    
    // If all checks pass, return the target user's profile
    res.json(targetUser);

  } catch (error) {
    logger.error('Error fetching user profile:', { error: error.message, stack: error.stack, targetUserId: req.params.id });
    if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Error fetching user profile' });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id, 
      { $set: req.body }, 
      { new: true, runValidators: true }
    ).select('-password');
      
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Error updating user profile' });
  }
};

exports.searchCoaches = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUser = req.user;

    if (currentUser.role !== 'client') {
      return res.status(403).json({ message: 'Only clients can search for coaches' });
    }

    const currentUserInfo = await User.findById(currentUser._id).select('blockedUsers').lean();
    const blockedUserIds = currentUserInfo.blockedUsers.map(b => b.user);

    let searchCriteria = {
      role: 'coach',
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      _id: { $nin: blockedUserIds },
      'blockedUsers.user': { $ne: currentUser._id }
    };

    const coaches = await User.find(searchCriteria).select('firstName lastName email profileVisibility');

    const filteredCoaches = coaches.filter(coach => coach.profileVisibility !== 'private');

    res.json(filteredCoaches);
  } catch (error) {
    console.error('Error searching coaches:', error);
    res.status(500).json({ message: 'Error searching coaches', error: error.message });
  }
};

exports.logout = async (req, res) => {
  const userId = req.user._id;
  console.log(`[userController] Logout attempt for user: ${userId}`);
  try {
    await User.findByIdAndUpdate(userId, { $set: { status: 'offline' } });
    
    if (req.io) {
      req.io.to(userId.toString()).emit('status_update', 'offline');
    }

    if (req.activeConnections) {
      const userSocket = req.activeConnections.get(userId.toString());
      if (userSocket) {
        userSocket.leave(userId.toString());
        req.activeConnections.delete(userId.toString());
      }
    }

    res.clearCookie('token');
    console.log(`[userController] Logout successful for user: ${userId}`);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error(`[userController] Logout error for user ${userId}:`, error);
    res.clearCookie('token');
    res.status(500).json({ message: 'Error during logout, but cookie cleared' });
  }
};

exports.updateUserProfilePicture = async (req, res) => {
  try {
    const { url, publicId } = req.body;

    const existingUser = await User.findById(req.user._id).select('profilePicture').lean();
    const oldPublicId = existingUser?.profilePicture?.publicId;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        $set: { 
          profilePicture: { url, publicId }
        }
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (oldPublicId && oldPublicId !== publicId) {
      assetCleanupService.queueAssetDeletion(oldPublicId, 'image');
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating user profile picture:', error);
    res.status(500).json({ message: 'Error updating user profile picture' });
  }
};

exports.getUserSettings = async (req, res) => {
  try {
    console.log(`[userController] Fetching settings for user ID: ${req.user._id}`);
    const user = await User.findById(req.user._id).select('settings');
    if (!user) {
      console.log(`[userController] User not found for ID: ${req.user._id}`);
      return res.status(404).json({ message: 'User not found' });
    }
    console.log(`[userController] Settings fetched successfully for user ID: ${req.user._id}`);
    res.json({ settings: user.settings });
  } catch (error) {
    
    console.error('[userController] Error fetching user settings:', error);
    res.status(500).json({ message: 'Error fetching user settings', error: error.message });
  }
};

exports.updateUserSettings = async (req, res) => {
  try {
    console.log(`[userController] Updating settings for user ID: ${req.user._id}`);
    console.log('[userController] New settings:', req.body);
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { settings: req.body } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      console.log(`[userController] User not found for ID: ${req.user._id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`[userController] Settings updated successfully for user ID: ${req.user._id}`);
    res.json(user);
  } catch (error) {
    console.error('[userController] Error updating user settings:', error);
    res.status(500).json({ message: 'Error updating user settings', error: error.message });
  }
};

exports.getProfilePictureSignature = (req, res) => {
  try {
    const timestamp = Math.round((new Date()).getTime()/1000);
    const signature = cloudinary.utils.api_sign_request({
      timestamp: timestamp,
      upload_preset: 'user_profile_pictures',
    }, process.env.CLOUDINARY_API_SECRET);

    res.json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY
    });
  } catch (error) {
    console.error('Error generating signature:', error);
    res.status(500).json({ message: 'Error generating signature', error: error.message });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('[uploadProfilePicture] Request body:', req.body);
    console.log('[uploadProfilePicture] User ID:', req.user._id);

    const { publicId, url } = req.body;
    
    if (!publicId || !url) {
      console.log('[uploadProfilePicture] Invalid profile picture data');
      return res.status(400).json({ msg: 'Invalid profile picture data' });
    }

    const existingUser = await User.findById(req.user._id).select('profilePicture').lean();
    const oldPublicId = existingUser?.profilePicture?.publicId;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        profilePicture: { 
          publicId, 
          url
        } 
      },
      { new: true }
    ).select('-password');

    if (!user) {
      console.log('[uploadProfilePicture] User not found for ID:', req.user._id);
      return res.status(404).json({ msg: 'User not found' });
    }

    if (oldPublicId && oldPublicId !== publicId) {
      cloudinary.uploader.destroy(oldPublicId).catch(err => 
        logger.error('[uploadProfilePicture] Failed to delete old Cloudinary asset.', { publicId: oldPublicId, error: err.message })
      );
    }

    console.log('[uploadProfilePicture] Profile picture updated successfully');
    res.json(transformIdToUnderscoreId(user.toObject()));
  } catch (err) {
    console.error('[uploadProfilePicture] Error:', err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.removeProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.profilePicture && user.profilePicture.publicId) {
      assetCleanupService.queueAssetDeletion(user.profilePicture.publicId, 'image');
    }

    user.profilePicture = null;
    await user.save();

    res.json(user);
  } catch (error) {
    console.error('Error in removeProfilePicture:', error);
    res.status(500).json({ message: 'Error removing profile picture', error: error.message });
  }
};

exports.searchUsersForMessaging = async (req, res) => {
  try {
    const { query = '', role } = req.query;
    const currentUser = req.user;

    console.log('[UserController] searchUsersForMessaging request', {
      userId: currentUser._id,
      query: query || 'INITIAL_LIST',
      role,
      timestamp: new Date().toISOString(),
    });

    const currentUserInfo = await User.findById(currentUser._id).select('blockedUsers').lean();
    const blockedUserIds = currentUserInfo.blockedUsers.map(b => b.user);

    let searchCriteria = {
      _id: { $ne: currentUser._id, $nin: blockedUserIds },
      'blockedUsers.user': { $ne: currentUser._id }
    };

    if (query.trim().length > 0) {
      searchCriteria.$or = [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
      ];
    }

    if (role && ['coach', 'client', 'admin'].includes(role)) {
      searchCriteria.role = role;
    }

    const potentialUsers = await User.find(searchCriteria)
      .select('firstName lastName role profilePicture')
      .limit(15)
      .lean();

    logger.debug('[UserController] Potential users found', {
      userId: currentUser._id,
      query: query || 'INITIAL_LIST',
      count: potentialUsers.length,
      userIds: potentialUsers.map(u => u._id.toString()),
      timestamp: new Date().toISOString(),
    });

    const userConnections = await Connection.find({
      $or: [{ coach: currentUser._id }, { client: currentUser._id }],
      status: 'accepted',
    })
      .select('coach client')
      .lean();

    const connectedUserIds = new Set(
      userConnections.map(conn =>
        conn.coach.toString() === currentUser._id.toString()
          ? conn.client.toString()
          : conn.coach.toString()
      )
    );

    logger.debug('[UserController] Connections checked', {
      userId: currentUser._id,
      connectionCount: userConnections.length,
      connectedUserIds: Array.from(connectedUserIds),
      timestamp: new Date().toISOString(),
    });

    const eligibleUsers = potentialUsers.filter(user =>
      connectedUserIds.has(user._id.toString())
    );

    const coachUserIds = eligibleUsers
      .filter(user => user.role === 'coach')
      .map(user => user._id);
    let coachProfilesMap = new Map();
    if (coachUserIds.length > 0) {
      const coachProfiles = await Coach.find({ user: { $in: coachUserIds } })
        .select('user profilePicture')
        .lean();
      coachProfilesMap = new Map(
        coachProfiles.map(cp => [cp.user.toString(), cp.profilePicture])
      );
      logger.debug('[UserController] Coach profiles fetched', {
        userId: currentUser._id,
        coachCount: coachProfiles.length,
        coachUserIds: coachUserIds.map(id => id.toString()),
        timestamp: new Date().toISOString(),
      });
    }

    const formattedUsers = eligibleUsers.map(user => {
      const coachProfilePicture = user.role === 'coach'
        ? coachProfilesMap.get(user._id.toString()) || null
        : null;
      return {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profilePicture: user.profilePicture || null,
        coachProfilePicture,
      };
    });

    console.log('[UserController] searchUsersForMessaging results', {
      userId: currentUser._id,
      query: query || 'INITIAL_LIST',
      count: formattedUsers.length,
      results: formattedUsers.map(u => ({
        _id: u._id,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        hasProfilePicture: !!u.profilePicture?.url,
        hasCoachProfilePicture: !!u.coachProfilePicture?.url,
      })),
      timestamp: new Date().toISOString(),
    });

    res.json(formattedUsers);
  } catch (error) {
    logger.error('[UserController] Error searching users for messaging', {
      userId: req.user?._id,
      query: req.query.query || 'INITIAL_LIST',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({ message: 'Error searching users', error: error.message });
  }
};

exports.getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        logger.error('[userController] Error fetching user details:', { userId: req.user.id, error: error.message });
        res.status(500).json({ message: 'Error fetching user details' });
    }
};

exports.updateUserDetails = async (req, res) => {
    try {
        const updateData = {};
        const allowedFields = [
            'salutation',
            'firstName',
            'lastName',
            'occupation',
            'location',
            'phone',
            'billingDetails',
            'profileVisibility',
            'settings',
            'preferredLanguage'
        ];

        allowedFields.forEach(field => {
            if (req.body.hasOwnProperty(field)) {
                updateData[field] = req.body[field];
            }
        });

        if (Object.keys(updateData).length === 0) {
            const currentUser = await User.findById(req.user.id).select('-password');
            return res.json(currentUser);
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        logger.error('[userController] Error updating user details:', { userId: req.user.id, error: error.message });
        res.status(500).json({ message: 'Error updating user details' });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'All password fields are required.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if current password is correct
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        await user.save();

        res.json({ message: 'Password updated successfully.' });

    } catch (error) {
        logger.error('[userController] Error changing password:', { userId: req.user.id, error: error.message });
        res.status(500).json({ message: 'Server error while changing password.' });
    }
};

exports.requestEmailChange = async (req, res) => {
    const { currentPassword, newEmail } = req.body;
    const userId = req.user.id;
    console.log(`[requestEmailChange] Received request for user ${userId} to change email to ${newEmail}`);

    try {
        if (!currentPassword || !newEmail) {
            logger.warn(`[requestEmailChange] Bad request for user ${userId}: Missing password or new email.`);
            return res.status(400).json({ message: 'Password and new email are required.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            logger.warn(`[requestEmailChange] User not found: ${userId}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            logger.warn(`[requestEmailChange] Incorrect password for user ${userId}.`);
            return res.status(400).json({ message: 'Incorrect password.' });
        }
        logger.debug(`[requestEmailChange] Password verified for user ${userId}.`);

        const existingUser = await User.findOne({ email: newEmail });
        if (existingUser) {
            logger.warn(`[requestEmailChange] New email ${newEmail} is already in use by user ${existingUser._id}.`);
            return res.status(400).json({ message: 'Email is already in use.' });
        }
        logger.debug(`[requestEmailChange] New email ${newEmail} is available.`);

        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        const changeRequest = await EmailChangeRequest.create({
            userId: user._id,
            newEmail,
            oldEmail: user.email,
            verificationToken
        });
        console.log(`[requestEmailChange] Created EmailChangeRequest ${changeRequest._id} for user ${userId}.`);
        
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email-change/${verificationToken}`;
        console.log(`[requestEmailChange] Verification URL for ${newEmail}: ${verificationUrl}`);
        
        res.json({ message: `Verification instructions sent to ${newEmail}. Please check your console for the verification link.` });
        
    } catch (error) {
        logger.error('[requestEmailChange] Error requesting email change:', { userId: req.user.id, error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server error while requesting email change.' });
    }
};

exports.verifyEmailChange = async (req, res) => {
    const { token } = req.body;
    console.log(`[verifyEmailChange] Received verification request with token: ${token ? token.substring(0, 10) + '...' : 'null'}`);
    
    try {
        if (!token) {
            logger.warn('[verifyEmailChange] Bad request: No token provided.');
            return res.status(400).json({ message: 'Verification token is required.' });
        }

        const changeRequest = await EmailChangeRequest.findOne({ verificationToken: token });

        if (!changeRequest) {
            logger.warn(`[verifyEmailChange] Invalid or expired token provided.`);
            return res.status(400).json({ message: 'Invalid or expired verification token.' });
        }
        console.log(`[verifyEmailChange] Found valid change request ${changeRequest._id} for user ${changeRequest.userId}.`);


        const user = await User.findById(changeRequest.userId);
        if (!user) {
            logger.error(`[verifyEmailChange] Associated user ${changeRequest.userId} not found for request ${changeRequest._id}.`);
            await EmailChangeRequest.deleteOne({ _id: changeRequest._id });
            return res.status(404).json({ message: 'Associated user not found.' });
        }
        console.log(`[verifyEmailChange] Found user ${user._id} to update.`);

        const oldEmailForLog = user.email;
        user.email = changeRequest.newEmail;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        
        await user.save();
        console.log(`[verifyEmailChange] User ${user._id} email updated to ${user.email}. Token version incremented to ${user.tokenVersion}.`);

        await EmailChangeRequest.deleteOne({ _id: changeRequest._id });
        console.log(`[verifyEmailChange] Deleted change request ${changeRequest._id}.`);
        
        console.log(`[verifyEmailChange] Email successfully changed for user ${user._id}. Old email was ${oldEmailForLog}.`);

        res.json({ message: 'Email address successfully updated. Please log in again.' });

    } catch (error) {
        logger.error('[verifyEmailChange] Error verifying email change:', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Server error while verifying email change.' });
    }
};

exports.getPaymentMethods = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('paymentMethods');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // This currently returns methods saved in your DB.
        // You would integrate with `stripeService.getPaymentMethods(user.stripe.customerId)` here.
        res.json({ paymentMethods: user.paymentMethods || [] });
    } catch (error) {
        logger.error('[userController] Error fetching payment methods:', { userId: req.user.id, error: error.message });
        res.status(500).json({ message: 'Error fetching payment methods' });
    }
};

exports.setDefaultPaymentMethod = async (req, res) => {
    try {
        const { methodId } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        let foundMethod = false;
        user.paymentMethods.forEach(method => {
            if (method.stripePaymentMethodId === methodId) {
                method.isDefault = true;
                foundMethod = true;
            } else {
                method.isDefault = false;
            }
        });

        if (!foundMethod) {
            return res.status(404).json({ message: 'Payment method not found for this user.' });
        }
        
        // Also update the top-level stripe field for quick access
        user.stripe.defaultPaymentMethod = methodId;

        await user.save();
        res.json({ message: 'Default payment method updated.' });

    } catch (error) {
        logger.error('[userController] Error setting default payment method:', { userId: req.user.id, error: error.message });
        res.status(500).json({ message: 'Error setting default payment method' });
    }
};

exports.deletePaymentMethod = async (req, res) => {
    try {
        const { methodId } = req.params;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const initialCount = user.paymentMethods.length;
        user.paymentMethods = user.paymentMethods.filter(
            method => method.stripePaymentMethodId !== methodId
        );

        if (initialCount === user.paymentMethods.length) {
            return res.status(404).json({ message: 'Payment method not found.' });
        }

        // If the deleted method was the default, pick a new default if possible
        if (user.stripe.defaultPaymentMethod === methodId) {
            if (user.paymentMethods.length > 0) {
                user.paymentMethods[0].isDefault = true;
                user.stripe.defaultPaymentMethod = user.paymentMethods[0].stripePaymentMethodId;
            } else {
                user.stripe.defaultPaymentMethod = null;
            }
        }

        await user.save();
        res.json({ message: 'Payment method deleted successfully.' });

    } catch (error) {
        logger.error('[userController] Error deleting payment method:', { userId: req.user.id, error: error.message });
        res.status(500).json({ message: 'Error deleting payment method' });
    }
};

exports.requestPasswordReset = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });

        if (user) {
            await PasswordResetRequest.deleteMany({ userId: user._id });

            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

            await new PasswordResetRequest({
                userId: user._id,
                resetToken: hashedToken,
            }).save();
            
            const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
            console.log(`[DEV] Password Reset Link for ${email}: ${resetUrl}`);
        }
        
        res.json({ message: 'If an account with that email exists, we have sent password reset instructions.' });

    } catch (error) {
        logger.error('[userController] Error requesting password reset:', { email, error: error.message });
        res.status(500).json({ message: 'An error occurred. Please try again later.' });
    }
};

exports.verifyPasswordResetToken = async (req, res) => {
    try {
        const { token } = req.params;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const resetRequest = await PasswordResetRequest.findOne({
            resetToken: hashedToken,
        });
        
        if (!resetRequest) {
            return res.status(400).json({ message: 'Invalid or expired password reset token.' });
        }

        res.json({ message: 'Token is valid.' });
    } catch (error) {
        logger.error('[userController] Error verifying password reset token:', { error: error.message });
        res.status(500).json({ message: 'Server error while verifying token.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required.' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const resetRequest = await PasswordResetRequest.findOne({ resetToken: hashedToken });

        if (!resetRequest) {
            return res.status(400).json({ message: 'Invalid or expired password reset token.' });
        }

        const user = await User.findById(resetRequest.userId);
        if (!user) {
            await PasswordResetRequest.deleteOne({ _id: resetRequest._id });
            return res.status(404).json({ message: 'User not found.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.tokenVersion = (user.tokenVersion || 0) + 1;

        await user.save();
        await PasswordResetRequest.deleteOne({ _id: resetRequest._id });
        
        res.json({ message: 'Password has been successfully reset.' });

    } catch (error) {
        logger.error('[userController] Error resetting password:', { error: error.message });
        res.status(500).json({ message: 'Server error while resetting password.' });
    }
};

exports.blockUser = async (req, res) => {
    try {
      const userToBlockId = req.params.userId;
      const currentUserId = req.user._id;

      if (userToBlockId === currentUserId.toString()) {
        return res.status(400).json({ message: "You cannot block yourself." });
      }

      const currentUser = await User.findById(currentUserId);
      const userToBlock = await User.findById(userToBlockId);

      if (!userToBlock) {
        return res.status(404).json({ message: "User to block not found." });
      }

      if (currentUser.blockedUsers.some(b => b.user.equals(userToBlockId))) {
        const populatedBlockedUsers = await User.findById(currentUserId).populate('blockedUsers.user', 'firstName lastName profilePicture role');
        return res.status(400).json({ message: "User is already blocked.", blockedUsers: populatedBlockedUsers.blockedUsers });
      }

      currentUser.blockedUsers.push({ user: userToBlockId });
      await currentUser.save();

      const io = req.app.get('io');
      if (io) {
        io.to(currentUserId.toString()).emit('user_blocked', { blockedUserId: userToBlockId });
        io.to(userToBlockId.toString()).emit('was_blocked_by', { blockingUserId: currentUserId.toString() });
      }

      const updatedUser = await User.findById(currentUserId).populate('blockedUsers.user', 'firstName lastName profilePicture role');
      res.status(200).json({ message: `Successfully blocked ${userToBlock.firstName}.`, blockedUsers: updatedUser.blockedUsers });

    } catch (error) {
      logger.error('Error in blockUser controller:', { error: error.message, stack: error.stack });
      res.status(500).json({ message: "Server error while blocking user." });
    }
  };

  exports.unblockUser = async (req, res) => {
    try {
      const userToUnblockId = req.params.userId;
      const currentUserId = req.user._id;

      await User.updateOne(
        { _id: currentUserId },
        { $pull: { blockedUsers: { user: userToUnblockId } } }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(currentUserId.toString()).emit('user_unblocked', { unblockedUserId: userToUnblockId });
      }

      const updatedUser = await User.findById(currentUserId).populate('blockedUsers.user', 'firstName lastName profilePicture role');
      res.status(200).json({ message: "Successfully unblocked user.", blockedUsers: updatedUser.blockedUsers });

    } catch (error) {
      logger.error('Error in unblockUser controller:', { error: error.message, stack: error.stack });
      res.status(500).json({ message: "Server error while unblocking user." });
    }
  };

exports.getBlockedUsers = async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .populate({
          path: 'blockedUsers.user',
          select: 'firstName lastName profilePicture role'
        })
        .lean();

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      // FIX: Default to an empty array if user.blockedUsers is undefined
      const blockedUsers = user.blockedUsers || [];

      const coachUserIds = blockedUsers // Use the safe 'blockedUsers' variable
        .filter(b => b.user && b.user.role === 'coach')
        .map(b => b.user._id);

      if (coachUserIds.length > 0) {
        const coachProfiles = await Coach.find({ user: { $in: coachUserIds } }).select('user profilePicture').lean();
        const coachProfileMap = new Map(coachProfiles.map(p => [p.user.toString(), p.profilePicture]));

        blockedUsers.forEach(blockedInfo => { // Use the safe 'blockedUsers' variable here too
          if (blockedInfo.user && blockedInfo.user.role === 'coach') {
            const coachPic = coachProfileMap.get(blockedInfo.user._id.toString());
            if (coachPic) {
              blockedInfo.user.coachProfilePicture = coachPic;
            }
          }
        });
      }

      // Return the safe variable which is guaranteed to be an array
      res.json(blockedUsers);
    } catch (error) {
      logger.error('Error in getBlockedUsers controller:', { error: error.message, stack: error.stack });
      res.status(500).json({ message: "Server error while fetching blocked users." });
    }
  };

exports.getUserDashboardOverview = async (req, res) => {
   const userId = new mongoose.Types.ObjectId(req.user._id);
    const loggerPrefix = `[userController.getDashboardOverview] UserID: ${userId} -`;
    console.log(`${loggerPrefix} V7 FINAL ATTEMPT - Starting unified dashboard data fetch.`);

    try {
        const [rawSessions, connections, enrollments, actionCenterData] = await Promise.all([
            Booking.find({ user: userId, status: { $nin: ['cancelled_by_client', 'cancelled_by_coach', 'declined'] } })
                .populate({
                    path: 'coach',
                    model: 'User',
                    select: 'firstName lastName profilePicture'
                })
                .populate('sessionType')
                .populate('payment.paymentRecord', 'status')
                .sort({ start: 'desc' }),

            Connection.find({ client: userId, status: 'accepted' })
                .populate({ path: 'coach', select: '_id' })
                .sort({ updatedAt: -1 })
                .lean(),
            
            Enrollment.find({ user: userId })
                .populate({
                    path: 'program',
                    select: 'title coverImage coach totalLessons programImages modules skillLevel language contentDuration estimatedCompletionTime averageRating reviewCount',
                    populate: { path: 'coach', select: '_id firstName lastName profilePicture' }
                })
                .lean(),
            
            Notification.find({
                recipient: userId,
                status: 'active',
                'metadata.additionalData.requiresAction': true,
                'validActions': { $ne: 'end_session' }
            })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('sender', 'firstName lastName profilePicture')
            .populate({
                path: 'metadata.bookingId',
                populate: [
                    { path: 'sessionType', model: 'SessionType', select: 'name duration price' },
                    { path: 'coach', model: 'User', select: 'firstName lastName email' },
                    { path: 'user', model: 'User', select: 'firstName lastName email' }
                ]
            })
            .lean()
        ]);
       console.log(`${loggerPrefix} Step 1 Complete: Fetched raw documents.`);
        
        const paymentIds = rawSessions.map(s => s.payment?.paymentRecord).filter(Boolean);
        console.log(`${loggerPrefix} Found ${paymentIds.length} payment IDs from sessions:`, paymentIds.map(id => id.toString()));

        const invoices = paymentIds.length > 0 ? await Invoice.find({
            payment: { $in: paymentIds },
            invoiceParty: 'platform_to_client',
            type: 'invoice'
        }).select('payment pdfUrl stripeHostedUrl').lean() : [];
        console.log(`${loggerPrefix} Found ${invoices.length} relevant B2C invoices.`);
        if (invoices.length > 0) {
            console.log(`${loggerPrefix} Sample invoice found:`, invoices[0]);
        }

        const invoiceMap = new Map(invoices.map(inv => [inv.payment.toString(), inv]));

        // --- START: CORRECT COACH PICTURE ENRICHMENT ---
        const coachUserIdsFromSessions = rawSessions.map(s => s.coach?._id?.toString()).filter(Boolean);
        const coachUserIdsFromConnections = connections.map(c => c.coach._id.toString());
        const allCoachUserIds = [...new Set([...coachUserIdsFromConnections, ...coachUserIdsFromSessions])];

        const coachProfiles = await Coach.find({ user: { $in: allCoachUserIds } }).select('user profilePicture').lean();
        const coachProfilePictureMap = new Map(
            coachProfiles.map(cp => [cp.user.toString(), cp.profilePicture])
        );
        console.log(`${loggerPrefix} Step 2: Built coachProfilePicture map for ${coachProfilePictureMap.size} coaches.`);

        let sessions = rawSessions.map(s => s.toObject()); // Convert to plain objects now

        sessions.forEach(session => {
            if (session.coach && session.coach._id) {
                const coachPic = coachProfilePictureMap.get(session.coach._id.toString());
                if (coachPic) {
                    session.coach.coachProfilePicture = coachPic;
                }
            }
            if (session.payment && session.payment.paymentRecord) {
                const invoice = invoiceMap.get(session.payment.paymentRecord._id.toString());
                if (invoice) {
                    session.payment.invoiceUrl = invoice.pdfUrl || invoice.stripeHostedUrl;
                    console.log(`${loggerPrefix} Attached invoiceUrl for payment ${session.payment.paymentRecord._id.toString()} to session ${session._id.toString()}`);
                }
            }
        });
        console.log(`${loggerPrefix} Step 3: Successfully enriched session coach objects.`);

        enrollments.forEach(e => {
            if (e.program) {
                const totalLessons = e.program.totalLessons || 0;
                const completedLessons = e.progress?.completedLessons?.length || 0;
                e.progress = e.progress || {};
                e.progress.completionPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
            } else {
                e.progress = e.progress || {};
                e.progress.completionPercentage = 0;
            }
        });

        sessions.forEach(session => {
            const price = session.price?.final?.amount?.amount;
            session.paymentStatus = session.payment?.paymentRecord?.status || (price > 0 ? 'payment_required' : 'not_applicable');
        });

        const coachProfilesForConnections = await Coach.find({ user: { $in: coachUserIdsFromConnections } })
            .populate('user', 'firstName lastName profilePicture status')
            .populate('specialties')
            .lean();

        const enrichedCoachProfiles = await Promise.all(coachProfilesForConnections.map(async (coach) => {
            const [reviews, priceConfig] = await Promise.all([
                Review.find({ $or: [{ rateeId: coach.user._id }, { ratee: coach.user._id, rateeModel: 'User' }] }).lean(),
                PriceConfiguration.findOne({ user: coach.user._id }).lean()
            ]);
            const reviewCount = reviews.length;
            const rating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;
            let minimumHourlyRate = null;
            if (priceConfig?.baseRate?.amount) {
                const rates = [priceConfig.baseRate.amount, ...(priceConfig.sessionTypeRates || []).map(r => r.rate?.amount).filter(Boolean)].filter(r => r > 0);
                if (rates.length > 0) minimumHourlyRate = { amount: Math.min(...rates), currency: priceConfig.baseRate.currency || 'CHF' };
            }
            return { ...coach, rating, reviewCount, minimumHourlyRate, liveSessionRate: priceConfig?.liveSessionRate || null };
        }));

        const upcomingSessions = sessions
            .filter(s => new Date(s.start) >= new Date() && s.coach)
            .sort((a, b) => new Date(a.start) - new Date(b.start));

        const nextSession = upcomingSessions.length > 0 ? upcomingSessions[0] : null;
        const primaryCoach = enrichedCoachProfiles.length > 0 ? enrichedCoachProfiles[0] : null;

        const responsePayload = {
            nextSession,
             primaryCoach,
            sessions: { sessions },
            connections: { connections: enrichedCoachProfiles },
            enrollments: { enrollments },
            actionCenter: actionCenterData
        };

        console.log(`${loggerPrefix} Successfully assembled data.`);
        if (responsePayload.sessions?.sessions?.length > 0) {
            console.log(`${loggerPrefix} Sample session data being sent:`, JSON.stringify(responsePayload.sessions.sessions[0], null, 2));
        }
        res.json({ success: true, data: responsePayload });

    } catch (error) {
        console.error(`${loggerPrefix} CRITICAL ERROR:`, { errorMessage: error.message, stack: error.stack });
        logger.error('Error in getDashboardOverview', { error: error.message, stack: error.stack, userId });
        res.status(500).json({ success: false, message: 'Server error while fetching dashboard data.' });
    }
};

exports.updateDashboardPreferences = async (req, res) => {
  const { preferences } = req.body;
  const userId = req.user.id;

  if (preferences === null || (Array.isArray(preferences) && preferences.length === 0)) {
     try {
        await User.updateOne({ _id: userId }, { $unset: { dashboardPreferences: "" } });
        return res.json({ success: true, message: 'Dashboard preferences reset successfully.' });
     } catch (error) {
        logger.error('[userController.updateDashboardPreferences] Error resetting preferences', { error: error.message, userId });
        return res.status(500).json({ success: false, message: 'Server error while resetting preferences.' });
     }
  }

  if (!preferences || !Array.isArray(preferences)) {
    return res.status(400).json({ success: false, message: 'Invalid preference format. "preferences" must be an array.' });
  }

  try {
    const user = await User.findById(userId);

   if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    
    user.dashboardPreferences = preferences;
    await user.save();

    res.json({
      success: true,
      message: 'Dashboard preferences updated successfully.',
      data: user.dashboardPreferences,
    });
  } catch (error) {
    logger.error('[userController.updateDashboardPreferences] Error updating preferences', {
      error: error.message,
      userId,
    });
    res.status(500).json({ success: false, message: 'Server error while updating preferences.' });
  }
};

exports.requestAccountDeletion = async (req, res) => {
    const userId = req.user._id;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const deletionToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(deletionToken).digest('hex');

        user.deletionRequest = {
            token: hashedToken,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour expiry
        };
        await user.save();

        const deletionUrl = `${process.env.FRONTEND_URL}/delete-account/confirm/${deletionToken}`;
        // In production, you would use an email service here.
        console.log(`[DEV] Account Deletion Link for ${user.email}: ${deletionUrl}`);
        
        res.json({ message: `A confirmation link has been sent to ${user.email}. Please check your console for the link to permanently delete your account.` });

    } catch (error) {
        logger.error('Error requesting account deletion:', { userId, error: error.message });
        res.status(500).json({ message: 'Server error while requesting account deletion.' });
    }
};

exports.confirmAccountDeletion = async (req, res) => {
    const { token } = req.body;
    try {
        if (!token) {
            return res.status(400).json({ message: 'Deletion token is required.' });
        }
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            'deletionRequest.token': hashedToken,
            'deletionRequest.expires': { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired deletion token.' });
        }
        
        const userId = user._id.toString();

        await accountCleanupQueue.add('delete-user-attachments', { userId });
        await userDataDeletionQueue.add('delete-user-data', { userId });

        res.json({ message: 'Your account deletion has been scheduled. You will be logged out.' });

    } catch (error) {
        logger.error('Error confirming account deletion:', { error: error.message });
        res.status(500).json({ message: 'Server error while deleting account.' });
    }
};

exports.reportUser = async (req, res) => {
  const { userId } = req.params;
  const { reason, details } = req.body;
  const reporterId = req.user._id;

  if (userId === reporterId.toString()) {
    return res.status(400).json({ message: 'You cannot report yourself.' });
  }

  try {
    const userToReport = await User.findById(userId);
    if (!userToReport) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const alreadyFlagged = userToReport.flags.some(flag => flag.flaggedBy.equals(reporterId));
    if (alreadyFlagged) {
      return res.status(409).json({ message: 'You have already reported this user.' });
    }

    const newFlag = {
      flaggedBy: reporterId,
      reason,
      details: details || '',
      status: 'pending',
      createdAt: new Date(),
    };

    userToReport.flags.push(newFlag);

    await userToReport.save();
    res.status(201).json({ message: 'User reported successfully.' });

  } catch (error) {
    logger.error('Error reporting user:', { userIdToReport: userId, reporterId, error: error.message });
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Invalid report data provided. Check the reason.', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error while reporting user.' });
  }
};

exports.flagEntity = async (req, res) => {
    const { entityId, entityType, reason, details } = req.body;
    const flaggerId = req.user.id;

    if (!entityId || !entityType || !reason) {
        return res.status(400).json({ message: 'Entity ID, type, and reason are required.' });
    }

    try {
        let Model;
        switch (entityType) {
            case 'user': Model = User; break;
            case 'review': Model = Review; break;
            case 'program': Model = Program; break;
            default: return res.status(400).json({ message: 'Invalid entity type for flagging.' });
        }

        const entity = await Model.findById(entityId);
        if (!entity) {
            return res.status(404).json({ message: `${entityType} not found.` });
        }
        
        // Prevent self-reporting or duplicate reporting
        if (entity.flags.some(flag => flag.flaggedBy.equals(flaggerId) && flag.status === 'pending')) {
            return res.status(409).json({ message: 'You have already reported this.' });
        }

        const newFlag = {
            flaggedBy: flaggerId,
            reason,
            details: details || '',
        };

        entity.flags.push(newFlag);
        await entity.save();

        res.status(200).json({ success: true, message: 'Report submitted successfully.' });

    } catch (error) {
        logger.error(`Error flagging entity:`, { error: error.message, entityType, entityId });
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateOnboardingStep = async (req, res) => {
  const userId = req.user._id;
  const { role, lastStep } = req.body;
  console.log(`[updateOnboardingStep] Received request for User: ${userId}, Role: ${role}, Last Step Completed: ${lastStep}`);

  try {
    const userUpdatePromise = User.findByIdAndUpdate(userId, {
      $set: { 'onboardingStatus.lastStep': lastStep }
    });

    const coachUpdatePromise = role === 'coach'
      ? Coach.updateOne({ user: userId }, { $set: { 'onboardingStatus.lastStep': lastStep } })
      : Promise.resolve();
      
    await Promise.all([userUpdatePromise, coachUpdatePromise]);
    console.log(`[updateOnboardingStep] Successfully updated step progress for User: ${userId}`);

    res.status(200).json({ success: true, message: 'Step progress saved.' });
  } catch (error) {
    console.error(`[updateOnboardingStep] ERROR for User ${userId}:`, error);
    res.status(500).json({ message: 'Error saving step progress.' });
  }
};

exports.verifyInitialEmail = async (req, res) => {
    const { token } = req.body;
    try {
        if (!token) {
            return res.status(400).json({ message: 'Verification token is required.' });
        }
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification token.' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        res.json({ message: 'Email successfully verified. You can now log in.' });

    } catch (error) {
        logger.error('[userController] Error verifying initial email:', { error: error.message });
        res.status(500).json({ message: 'Server error while verifying email.' });
    }
};


module.exports = exports;