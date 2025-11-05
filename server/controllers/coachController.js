const Coach = require('../models/Coach');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const Specialty = require('../models/Specialty');
const Language = require('../models/Language');
const EducationLevel = require('../models/EducationLevel');
const Achievement = require('../models/Achievement');
const CoachingStyle = require('../models/CoachingStyle');
const Skill = require('../models/Skill');
const Translation = require('../models/Translation');
const ProgramCategory = require('../models/ProgramCategory');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const Booking = require('../models/Booking');
const { logger } = require('../utils/logger');
const cloudinary = require('../utils/cloudinaryConfig');
const { checkForConflicts } = require('../utils/conflictDetection');
const SessionType = require('../models/SessionType');
const { transformIdToUnderscoreId } = require('../utils/idTransformer');
const Program = require('../models/Program');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const SkillLevel = require('../models/SkillLevel');
const Connection = require('../models/Connection');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const path = require('path');
const i18next = require('i18next');
const FsBackend = require('i18next-fs-backend');
const PriceConfiguration = require('../models/PriceConfiguration');
const assetCleanupService = require('../services/assetCleanupService');
const Comment = require('../models/Comment');
const Lesson = require('../models/Lesson');

const defaultSettings = {
  professionalProfile: {
    specialties: [],
    expertise: [],
    hourlyRate: 0,
    currency: 'USD',
    showTestimonials: true,
    showReviews: true,
  },
  availabilityManagement: {
    workingHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '', end: '' },
      sunday: { start: '', end: '' },
    },
    vacationMode: false,
    vacationStart: '',
    vacationEnd: '',
    bufferTime: 15,
  },
  sessionManagement: {
    sessionTypes: [],
    maxSessionsPerDay: 5,
    maxSessionsPerWeek: 25,
    overtime: {
      allowOvertime: false,
      freeOvertimeDuration: 0,
      paidOvertimeDuration: 0,
      overtimeRate: 0,
    },
    durationRules: {
      minDuration: 30,
      maxDuration: 120,
      defaultDuration: 60,
      durationStep: 15,
      allowCustomDuration: true,
    },
  },
  clientManagement: {
    clientCapacity: 20,
    waitingListEnabled: false,
    waitingListCapacity: 10,
  },
  paymentAndBilling: {
    paymentMethods: [],
    automaticInvoicing: true,
    invoiceDueDate: 7,
    stripe: {},
  },
  marketingAndGrowth: {
    featuredCoach: false,
    referralProgramEnabled: false,
    referralReward: 10,
  },
  analyticsDashboard: {
    displayMetrics: [],
    customReports: [],
  },
  privacySettings: {
    calendarVisibility: 'connectedOnly',
    showFullCalendar: true,
    bookingPrivacy: 'connectedOnly',
    requireApprovalNonConnected: false,
     profilePrivacy: {
      ratings: true,
      pricing: true,
    },
    sessionTypeVisibility: {},
    availabilityNotifications: 'all',
    notificationGroups: [],
    firmBookingThreshold: 24,
  },
  notificationPreferences: {
    email: true,
    sms: false,
    inApp: true,
  },
};

 const deepMerge = (target, source) => {
  const ensureObject = (value, defaultValue) => {
    if (value === undefined || value === null) return { ...defaultValue };
    if (typeof value !== 'object' || Array.isArray(value)) return { ...defaultValue };
    return value;
  };

  for (const key of Object.keys(defaultSettings)) {
    if (!(key in target)) {
      target[key] = { ...defaultSettings[key] };
    }
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(
        ensureObject(target[key], defaultSettings[key]),
        ensureObject(source[key], defaultSettings[key])
      );
    } else {
      target[key] = source[key] !== undefined ? source[key] : target[key];
    }
  }
  return target;
};

const swissInsuranceRegistries = [
  { name: "EMR" },
  { name: "ASCA" },
  { name: "EGK" },
  { name: "Visana" },
  { name: "SNE" }
];

exports.getInsuranceRegistries = (req, res) => {
  res.json(swissInsuranceRegistries);
};

exports.getUploadSignature = (req, res) => {
  const timestamp = Math.round((new Date()).getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request({
    timestamp: timestamp,
    eager: 'w_400,h_400,c_crop,g_face',
    folder: 'coach_profile_pictures'
  }, process.env.CLOUDINARY_API_SECRET);

  res.json({
    signature: signature,
    timestamp: timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY
  });
};

exports.searchListItems = async (req, res) => {
  try {
    const { type, query, language } = req.query;

    if (!type) {
      return res.status(400).json({ message: 'List type is required' });
    }

     const modelMap = {
      specialties: Specialty,
      languages: Language,
      educationLevels: EducationLevel,
      achievements: Achievement,
      coachingStyles: CoachingStyle,
      skills: Skill,
      programCategories: ProgramCategory,
      skillLevels: SkillLevel,
    };

    const Model = modelMap[type];
    if (!Model) {
      return res.status(400).json({ message: 'Invalid list type' });
    }

    let items;
    const isProgramCategory = type === 'programCategories';
    const dbListType = isProgramCategory ? 'program_categories' : type;
    const translationPath = isProgramCategory
      ? `translations.name.${language}`
      : `translations.${language}`;

    if (query) {
      // Find items where the original name matches the query
      const nameMatchPromise = Model.find({ name: { $regex: query, $options: 'i' } }).select('_id').lean();

      // Find items where a translation matches the query
      const translationMatchPromise = Translation.find({
        listType: dbListType,
        [translationPath]: { $regex: query, $options: 'i' }
      }).select('key').lean();

      const [nameMatches, translationMatches] = await Promise.all([nameMatchPromise, translationMatchPromise]);

      const idsFromName = nameMatches.map(item => item._id.toString());
      const idsFromTranslation = translationMatches.map(t => t.key.split('_').pop());

      // Combine and deduplicate all found IDs
      const uniqueIds = [...new Set([...idsFromName, ...idsFromTranslation])];
      
      items = await Model.find({ '_id': { $in: uniqueIds } }).lean();

    } else {
      // If no query, fetch all items for the given type
      items = await Model.find({}).lean();
    }
    
    if (items.length === 0) {
      return res.json([]);
    }

    // --- Translation Enrichment Step ---
    const itemIds = items.map(item => item._id.toString());
    const itemIdsSet = new Set(itemIds);

    const translations = await Translation.find({
      listType: dbListType,
      [translationPath]: { $exists: true, $ne: null }
    }).lean();

    const translationMap = new Map();
    translations.forEach(t => {
      const itemId = t.key.split('_').pop();
      if (itemIdsSet.has(itemId) && t.translations) {
         const translatedName = isProgramCategory
          ? t.translations.name?.[language]
          : t.translations[language];
        
        if (translatedName) {
            translationMap.set(itemId, translatedName);
        }
      }
    });

    const resultsWithTranslations = items.map(item => {
      const itemIdStr = item._id.toString();
      const translatedName = translationMap.get(itemIdStr);
      return {
        ...item,
        translation: translatedName && translatedName.trim() !== '' ? translatedName : null,
      };
    });

    res.json(resultsWithTranslations);

  } catch (error) {
    console.error(`[searchListItems] Error: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({ message: 'Server error while searching list items', error: error.message });
  }
};

exports.updateCoachProfileItems = async (req, res) => {
  try {
    const { type, items } = req.body;
    const userId = req.user._id;

    console.log(`coachController: Updating ${type} for user ${userId}`, JSON.stringify(items, null, 2));

    let updatePayload;
    if (type === 'languages') {
      updatePayload = items
        .filter(item => item && item._id)
        .map(item => ({
          language: new mongoose.Types.ObjectId(item._id),
          strength: item.strength || 'intermediate'
        }));
    } else {
      updatePayload = items
        .filter(item => item && item._id)
        .map(item => new mongoose.Types.ObjectId(item._id));
    }

    const result = await Coach.updateOne(
      { user: userId },
      { $set: { [type]: updatePayload } },
      { runValidators: true }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Coach not found' });
    }

    const updatedCoach = await Coach.findOne({ user: userId })
      .populate('languages.language')
      .populate(type);

    if (!updatedCoach) {
      return res.status(404).json({ message: 'Coach not found after update' });
    }
    
    const formattedItems = type === 'languages'
      ? updatedCoach.languages.map(lang => ({
          _id: lang.language._id.toString(),
          name: lang.language.name,
          code: lang.language.code,
          strength: lang.strength
        }))
      : updatedCoach[type].map(item => ({...item.toObject(), _id: item._id.toString()}));

    console.log(`coachController: Successfully updated ${type} for user ${userId}`);
    res.json({ [type]: formattedItems });
  } catch (error) {
    console.error(`coachController: Error in updateCoachProfileItems: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({ message: 'Server error while updating coach profile items', error: error.message });
  }
};

exports.registerCoach = async (req, res) => {
  console.log("Received coach registration data:", JSON.stringify(req.body, null, 2));
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("Validation errors:", errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, lastName, email, password, preferredLanguage } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      console.log("User already exists:", email);
      return res.status(400).json({ msg: 'User already exists' });
    }

    const userLang = preferredLanguage || 'de';
    await i18next.loadLanguages(userLang);
    const t = i18next.getFixedT(userLang);
    const termsVersion = t('version', { lng: userLang });

    user = new User({
      firstName,
      lastName,
      email,
      password,
      role: 'coach',
      preferredLanguage,
      termsAcceptance: {
        version: termsVersion,
        acceptedAt: new Date(),
        ipAddress: req.ip
      }
    });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();
    console.log("User created:", user._id);

    let coach = new Coach({
      user: user._id,
    });

    await coach.save();
    console.log("Coach created:", coach._id);

    const payload = {
      user: {
        id: user.id,
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
        console.log("JWT generated for user:", user.id);
        res.status(201).json({ 
          msg: 'Coach registered successfully',
          token,
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            preferredLanguage: user.preferredLanguage
          },
          coach: {
            id: coach._id,
            onboarding: true
          }
        });
      }
    );
  } catch (err) {
    console.error("Error in registerCoach:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ msg: 'Validation error', errors: err.errors });
    }
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.getCoachBookings = async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('[bookingController] Fetching bookings for user:', userId);
    
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      console.log('[bookingController] Coach not found for user ID:', userId);
      return res.status(404).json({ message: 'Coach not found' });
    }

    const bookings = await Booking.find({ coach: coach._id }).populate('sessionType');
    console.log('[bookingController] Bookings fetched:', bookings.length);

    res.json(bookings);
  } catch (error) {
    console.error('[bookingController] Error fetching coach bookings:', error);
    res.status(500).json({ message: 'Error fetching coach bookings' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      { $set: { status } },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }
    
    res.json(booking);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.submitReview = async (req, res) => {
  try {
    const { sessionId, coachId, rating, comment } = req.body;
    const userId = req.user._id;

    // Create a new review
    const review = new Review({
      session: sessionId,
      coach: coachId,
      user: userId,
      rating,
      comment
    });

    await review.save();

    // Update the session to mark it as reviewed
    await Session.findByIdAndUpdate(sessionId, { reviewed: true });

    // Update the coach's average rating
    const coach = await Coach.findById(coachId);
    const reviews = await Review.find({ coach: coachId });
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    coach.averageRating = totalRating / reviews.length;
    coach.totalReviews = reviews.length;
    await coach.save();

    res.status(201).json({ message: 'Review submitted successfully' });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Error submitting review' });
  }
};

const getFullCoachProfileById = async (userId, authenticatedUserId = null) => {
  console.log(`[DEBUG-BACKEND] 1. ENTERING getFullCoachProfileById for userId: ${userId}`);
  
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    console.error('[DEBUG-BACKEND] ERROR: Invalid userId received.');
    throw new Error('User ID is required and must be a valid ObjectId');
  }

  let coach = await Coach.findOne({ user: userId });
  if (!coach) {
    coach = await Coach.findById(userId);
  }
  if (!coach) {
    console.warn(`[DEBUG-BACKEND] 2. Coach NOT FOUND for userId: ${userId}`);
    return null;
  }
  console.log(`[DEBUG-BACKEND] 2. Coach found. Coach User ID is: ${coach.user._id}`);
  
  await coach.populate([
    { path: 'user', select: '-password' },
    { path: 'languages.language' },
    { path: 'specialties' },
    { path: 'educationLevels' },
    { path: 'coachingStyles' },
    { path: 'skills' }
  ]);

  const coachUserId = coach.user._id;
  console.log(`[DEBUG-BACKEND] 3. Querying reviews for coachUserId: ${coachUserId}`);
  
  const reviews = await Review.find({
    isPrivate: false,
    isVisible: true,
    $or: [
      { rateeId: coachUserId },
      { ratee: coachUserId, rateeModel: 'User' }
    ]
  }).populate('raterId', 'firstName lastName');
    
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  console.log(`[DEBUG-BACKEND] 4. Review query complete. Found ${reviews.length} reviews. Calculated averageRating: ${averageRating}`);

  const publicReviews = reviews.map(r => ({
    id: r._id.toString(),
    rating: r.rating,
    comment: r.comment,
    coachResponse: r.coachResponse,
    clientInitials: r.raterId ? `${r.raterId.firstName[0]}.${r.raterId.lastName[0]}.` : '',
  }));

  const language = coach.user.preferredLanguage || 'en';
  const listTypes = ['specialties', 'educationLevels', 'coachingStyles', 'skills', 'languages'];
  const keysToFetch = [];
  listTypes.forEach(type => {
    const items = type === 'languages' ? coach.languages.map(l => l.language) : coach[type];
    if (items) {
      items.forEach(item => {
        if (item && item._id) {
          keysToFetch.push(`${type}_${item._id.toString()}`);
        }
      });
    }
  });

  const translationMap = new Map();
  if (keysToFetch.length > 0) {
    const translations = await Translation.find({
      key: { $in: keysToFetch },
      $or: [
        { [`translations.${language}`]: { $exists: true, $ne: null, $ne: '' } },
        { [`translations.name.${language}`]: { $exists: true, $ne: null, $ne: '' } }
      ]
    }).lean();
    translations.forEach(t => {
      if (t.translations) {
        const translationText = t.translations[language] || (t.translations.name && t.translations.name[language]);
        if (translationText) {
          translationMap.set(t.key, translationText);
        }
      }
    });
  }

  const enrichItem = (item, type) => {
    const itemObj = item.toObject();
    const itemId = itemObj._id.toString();
    const translation = translationMap.get(`${type}_${itemId}`);
    return { ...itemObj, _id: itemId, translation: translation || null };
  };

  const requestedProfileOwnerId = coach.user._id.toString();
  const isOwner = authenticatedUserId === requestedProfileOwnerId;

  let responseSettings;
  const showRatings = coach.settings?.privacySettings?.profilePrivacy?.ratings !== false;
  console.log(`[DEBUG-BACKEND] 5. Privacy check for ratings. showRatings is: ${showRatings}`);

  if (isOwner) {
    responseSettings = coach.settings;
  } else {
    responseSettings = {
      professionalProfile: {},
      cancellationPolicy: coach.settings?.cancellationPolicy,
      privacySettings: coach.settings?.privacySettings,
      insuranceRecognition: coach.settings?.insuranceRecognition
    };
    if (coach.settings?.professionalProfile) {
      responseSettings.professionalProfile.hourlyRate = coach.settings.professionalProfile.hourlyRate;
      responseSettings.professionalProfile.currency = coach.settings.professionalProfile.currency;
    }
  }

  const formattedCoach = {
    ...coach.toObject(),
    user: {
      ...coach.user.toObject(),
      _id: coach.user._id.toString(),
    },
    languages: coach.languages
      .filter(lang => lang.language && lang.strength)
      .map(lang => {
        const enrichedLanguage = enrichItem(lang.language, 'languages');
        return {
          ...enrichedLanguage,
          strength: lang.strength,
        };
      }),
    specialties: coach.specialties ? coach.specialties.map(s => enrichItem(s, 'specialties')) : [],
    educationLevels: coach.educationLevels ? coach.educationLevels.map(e => enrichItem(e, 'educationLevels')) : [],
    coachingStyles: coach.coachingStyles ? coach.coachingStyles.map(c => enrichItem(c, 'coachingStyles')) : [],
    skills: coach.skills ? coach.skills.map(s => enrichItem(s, 'skills')) : [],
    rating: showRatings ? averageRating : 0,
    reviews: showRatings ? publicReviews : [],
    settings: responseSettings,
  };

if (formattedCoach.videoIntroduction && formattedCoach.videoIntroduction.publicId) {
    try {
      const videoInfo = formattedCoach.videoIntroduction;
      const expiration = Math.round(Date.now() / 1000) + 3600; // 1 hour expiration

      const signedVideoUrl = cloudinary.url(videoInfo.publicId, {
        resource_type: 'video',
        type: 'private',
        sign_url: true,
        expires_at: expiration,
      });

      const signedThumbnailUrl = cloudinary.url(videoInfo.publicId, {
          resource_type: 'video',
          type: 'private',
          sign_url: true,
          expires_at: expiration,
          transformation: [
              { seek: "1.0" },
              { fetch_format: "jpg" }
          ]
      });

      formattedCoach.videoIntroduction.url = signedVideoUrl;
      formattedCoach.videoIntroduction.thumbnail = signedThumbnailUrl;
    } catch (err) {
      logger.error('Failed to generate signed URLs for video introduction', {
        error: err.message,
        publicId: formattedCoach.videoIntroduction.publicId,
      });
    }
  }

  console.log(`[DEBUG-BACKEND] 6. Final object being returned. rating: ${formattedCoach.rating}, reviews.length: ${formattedCoach.reviews.length}`);
  return formattedCoach;
};

exports.getCoachProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('[CoachController.getCoachProfile] Fetching coach profile', { userId });

    const formattedCoach = await getFullCoachProfileById(userId, req.user?._id?.toString());
    
    if (!formattedCoach) {
      logger.warn('[CoachController.getCoachProfile] Coach not found by either user reference or direct ID', { userId });
      return res.status(404).json({ message: 'Coach not found' });
    }

    console.log('[CoachController.getCoachProfile] Coach profile fetched successfully', { userId });
    res.json(formattedCoach);
  } catch (err) {
    logger.error('[CoachController.getCoachProfile] Error fetching coach profile', {
      error: err.message,
      stack: err.stack,
      userId: req.params.userId,
    });
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.removeProfilePicture = async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.user._id });
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }

    if (coach.profilePicture && coach.profilePicture.publicId) {
      await cloudinary.uploader.destroy(coach.profilePicture.publicId);
    }

    coach.profilePicture = null;
    await coach.save();

    res.json(coach);
  } catch (error) {
    console.error('Error in removeProfilePicture:', error);
    res.status(500).json({ message: 'Error removing profile picture', error: error.message });
  }
};

exports.updateCoachProfile = async (req, res) => {
  const userId = req.user._id;
  const payload = req.body;
  console.log(`[updateCoachProfile] Request for User: ${userId} with payload:`, payload);

  try {
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    const isCompletingOnboarding = payload.status && payload.status === 'active' && coach.status !== 'active';
    if (isCompletingOnboarding) {
        console.log(`[updateCoachProfile] Onboarding completion triggered for User: ${userId}, Coach: ${coach._id}`);
        coach.onboardingStatus.completed = true;
        coach.onboardingStatus.lastStep = 'published';

        const user = await User.findById(userId);
        if (user) {
            user.onboardingStatus.completed = true;
            user.onboardingStatus.lastStep = 'completed';
            await user.save();
            console.log(`[updateCoachProfile] Successfully updated User.onboardingStatus for User: ${userId}`);
        }
    }

    if (payload.user && typeof payload.user === 'object') {
      const userUpdates = {};
      if (payload.user.firstName !== undefined) userUpdates.firstName = payload.user.firstName;
      if (payload.user.lastName !== undefined) userUpdates.lastName = payload.user.lastName;
      
      if (Object.keys(userUpdates).length > 0) {
        await User.findByIdAndUpdate(userId, { $set: userUpdates });
      }
      delete payload.user;
    }

    for (const key in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        coach[key] = payload[key];
      }
    }

    await coach.save();
    console.log(`[updateCoachProfile] Coach profile saved for User: ${userId}`);

    const updatedFullCoachProfile = await getFullCoachProfileById(userId, userId);
    if (!updatedFullCoachProfile) {
        return res.status(404).json({ msg: 'Coach not found after update' });
    }

    res.json(updatedFullCoachProfile);
  } catch (err) {
    console.error(`[updateCoachProfile] ERROR for user ${userId}:`, err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.updateAvailability = async (req, res) => {
  const { userId } = req.params;
  const { availability, settings } = req.body;

  try {
    const coach = await Coach.findOne({ user: userId });

    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    // Check for conflicts
    const conflicts = checkForConflicts(availability);
    if (conflicts.length > 0) {
      return res.status(400).json({ msg: 'Scheduling conflicts detected', conflicts });
    }

    // Update availability
    coach.availability = availability;

    // Update settings if provided
    if (settings) {
      coach.settings = {
        ...coach.settings,
        ...settings
      };
    }

    await coach.save();

    res.json({
      availability: coach.availability,
      settings: coach.settings
    });
  } catch (err) {
    console.error(`[updateAvailability] Error occurred:`, err);
    res.status(500).send('Server Error');
  }
};

exports.getCoachAvailability = async (req, res) => {
  const { userId } = req.params;
  const { excludeBookingId, targetDurationMinutes, forDate } = req.query;
  console.log(`[getCoachAvailability] Request for user ID: ${userId}`, { excludeBookingId, targetDurationMinutes, forDate });

  try {
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      logger.warn(`[getCoachAvailability] Coach not found for user ID: ${userId}`);
      return res.status(404).json({ msg: 'Coach not found' });
    }

    const now = new Date();
    const settings = coach.settings || {};
    const { 
      minNoticeForBooking = 24, 
      maxAdvanceBookingDays = 30 
    } = settings.availabilityManagement || {};
    const { 
      bufferTimeBetweenSessions = 15 
    } = settings.sessionManagement || {};
    const { 
      minDuration = 30, 
      maxDuration = 120 
    } = settings.sessionManagement?.durationRules || {};
    const bufferTimeInMs = bufferTimeBetweenSessions * 60 * 1000;

     const maxBookingDate = new Date(now.getTime() + maxAdvanceBookingDays * 24 * 60 * 60 * 1000);
    let availabilityQuery = {
      coach: userId,
      isAvailability: true,
      status: 'confirmed',
      start: { $lt: maxBookingDate },
    };

    if (forDate) {
      const startOfDay = new Date(forDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(forDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      availabilityQuery.start = { $lt: endOfDay };
      availabilityQuery.end = { $gt: startOfDay };
    }

    const generalAvailabilitySlots = await Booking.find(availabilityQuery).lean();
    console.log(`[getCoachAvailability] Found ${generalAvailabilitySlots.length} general availability slots for coach ${userId}`);

    let confirmedBookingsQuery = {
      coach: userId,
      isAvailability: false,
      status: { $in: ['confirmed', 'pending_payment', 'rescheduled_pending_attendee_actions', 'scheduled', 'firm_booked'] },
    };
    if (excludeBookingId) {
       confirmedBookingsQuery._id = { $ne: new mongoose.Types.ObjectId(excludeBookingId) };
    }
    if (forDate) {
        const startOfDay = new Date(forDate);
        startOfDay.setUTCHours(0,0,0,0);
        const endOfDay = new Date(forDate);
        endOfDay.setUTCHours(23,59,59,999);
        confirmedBookingsQuery.start = { $lt: endOfDay };
        confirmedBookingsQuery.end = { $gt: startOfDay };
    }

      if (targetDurationMinutes) {
      const duration = parseInt(targetDurationMinutes, 10);
      if (duration < minDuration || duration > maxDuration) {
        return res.status(400).json({ msg: `Requested duration is outside the coach's allowed range of ${minDuration}-${maxDuration} minutes.` });
      }
    }


    const existingBookings = await Booking.find(confirmedBookingsQuery).lean();
    console.log(`[getCoachAvailability] Found ${existingBookings.length} existing confirmed bookings for coach ${userId}`);

   let freeSlots = [];
    generalAvailabilitySlots.forEach(availSlot => {
      let currentSlotStart = new Date(availSlot.start);
      const availSlotEnd = new Date(availSlot.end);

      existingBookings
        .filter(b => new Date(b.end) > currentSlotStart && new Date(b.start) < availSlotEnd)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .forEach(booking => {
          const bookingStart = new Date(booking.start);
          const bookingEnd = new Date(booking.end);
          const endWithBuffer = new Date(bookingEnd.getTime() + bufferTimeInMs);

          if (bookingStart > currentSlotStart) {
            const minBookingTime = new Date(now.getTime() + minNoticeForBooking * 60 * 60 * 1000);
            const potentialSlotStart = new Date(Math.max(currentSlotStart.getTime(), minBookingTime.getTime()));
            if (!targetDurationMinutes || (bookingStart.getTime() - potentialSlotStart.getTime()) / (1000 * 60) >= parseInt(targetDurationMinutes)) {
               if (potentialSlotStart < bookingStart) {
                 freeSlots.push({ start: potentialSlotStart, end: new Date(bookingStart), sourceAvailabilityId: availSlot._id });
               }
            }
          }
          currentSlotStart = new Date(Math.max(currentSlotStart.getTime(), endWithBuffer.getTime()));
        });

      if (availSlotEnd > currentSlotStart) {
        const minBookingTime = new Date(now.getTime() + minNoticeForBooking * 60 * 60 * 1000);
        const potentialSlotStart = new Date(Math.max(currentSlotStart.getTime(), minBookingTime.getTime()));
         if (!targetDurationMinutes || (availSlotEnd.getTime() - potentialSlotStart.getTime()) / (1000 * 60) >= parseInt(targetDurationMinutes)) {
            if (potentialSlotStart < availSlotEnd) {
              freeSlots.push({ start: potentialSlotStart, end: new Date(availSlotEnd), sourceAvailabilityId: availSlot._id });
            }
        }
      }
    });
    
    if (targetDurationMinutes) {
        const durationMs = parseInt(targetDurationMinutes) * 60 * 1000;
        freeSlots = freeSlots.filter(slot => (new Date(slot.end).getTime() - new Date(slot.start).getTime()) >= durationMs);
    }


    console.log(`[getCoachAvailability] Processed availability for coach: ${coach._id}. Returning ${freeSlots.length} free slots.`);
    res.json({
      availability: freeSlots, // This now represents actual free slots
      // sessionTypes and settings can remain if your frontend expects them with general availability
      sessionTypes: coach.settings?.sessionManagement?.sessionTypes || [],
      settings: {
        workingHours: coach.settings?.availabilityManagement?.workingHours,
        bufferTimeBetweenSessions: coach.settings?.sessionManagement?.bufferTimeBetweenSessions,
        maxAdvanceBookingDays: coach.settings?.availabilityManagement?.maxAdvanceBookingDays,
        minNoticeForBooking: coach.settings?.availabilityManagement?.minNoticeForBooking,
        timeZone: coach.settings?.timeZone || 'UTC'
      }
    });
  } catch (err) {
    logger.error(`[getCoachAvailability] Error occurred for user ID ${userId}:`, err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.getAvailability = async (req, res) => {
  const { id } = req.params;
  console.log(`[getAvailability] Received request for coach ID: ${id}`);

  try {
    const coach = await Coach.findOne({ user: id });
    
    if (!coach) {
      console.log(`[getAvailability] Coach not found for ID: ${id}`);
      return res.status(404).json({ msg: 'Coach not found' });
    }

    console.log(`[getAvailability] Coach found. Preparing response for coach: ${coach._id}`);
    res.json({
      availability: coach.availability,
      sessionTypes: coach.settings.sessionTypes,
      settings: {
        workingHours: coach.settings.workingHours,
        bufferTimeBetweenSessions: coach.settings.bufferTimeBetweenSessions,
        maxAdvanceBookingDays: coach.settings.maxAdvanceBookingDays,
        minNoticeForBooking: coach.settings.minNoticeForBooking
      }
    });
  } catch (err) {
    console.error(`[getAvailability] Error occurred:`, err);
    res.status(500).send('Server Error');
  }
};

exports.getVideoIntroductionSignature = (req, res) => {
  try {
    const timestamp = Math.round((new Date()).getTime() / 1000);
    const folder = `coaches/${req.user.id}/video_introductions`;
    const upload_preset = 'coach_videos';
    const apiKey = process.env.CLOUDINARY_API_KEY;

    const paramsToSign = {
      timestamp: timestamp,
      upload_preset: upload_preset,
      folder: folder
    };
    console.log('[DEBUG] [getVideoIntroductionSignature] Parameters being signed:', paramsToSign);

    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
    
    console.log('[DEBUG] [getVideoIntroductionSignature] Generated signature:', signature);

    const responsePayload = {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: apiKey,
      folder: folder,
      upload_preset: upload_preset,
      resource_type: 'video'
    };
    console.log('[DEBUG] [getVideoIntroductionSignature] Full response payload to client:', responsePayload);
    
    res.json(responsePayload);
  } catch (error) {
    logger.error('Error generating video introduction signature:', { error: error.message });
    res.status(500).json({ message: 'Error generating signature', error: error.message });
  }
};

exports.uploadVideoIntroduction = async (req, res) => {
  try {
    const { publicId, url, duration, thumbnail, trimStart, trimEnd } = req.body;
    
    console.log('[coachController|uploadVideoIntroduction] Received request body:', req.body);
    
    if (!publicId || !url) {
      return res.status(400).json({ msg: 'Invalid video data' });
    }
    
    const existingCoach = await Coach.findOne({ user: req.user._id }).select('videoIntroduction').lean();
    const oldPublicId = existingCoach?.videoIntroduction?.publicId;

    const coach = await Coach.findOneAndUpdate(
      { user: req.user._id },
      { 
        videoIntroduction: { 
          publicId, 
          url, 
          duration,
          thumbnail,
          trimStart,
          trimEnd
        } 
      },
      { new: true }
    );

    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    
      if (oldPublicId && oldPublicId !== publicId) {
        assetCleanupService.queueAssetDeletion(oldPublicId, 'video');
      }

    const updatedFullCoachProfile = await getFullCoachProfileById(req.user._id, req.user._id);
    
    console.log('[coachController|uploadVideoIntroduction] Sending back full coach profile to client. Keys:', Object.keys(updatedFullCoachProfile));

    res.json(updatedFullCoachProfile);
  } catch (err) {
    console.error('Error in uploadVideoIntroduction:', err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.deleteVideoIntroduction = async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.user._id });
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    if (!coach.videoIntroduction || !coach.videoIntroduction.publicId) {
      return res.status(404).json({ msg: 'No video introduction to delete.' });
    }

    const publicId = coach.videoIntroduction.publicId;
    assetCleanupService.queueAssetDeletion(publicId, 'video');

    coach.videoIntroduction = undefined;
    await coach.save();

    const updatedFullCoachProfile = await getFullCoachProfileById(req.user._id, req.user._id);

    res.json(updatedFullCoachProfile);
  } catch (err) {
    logger.error('Error deleting video introduction:', { error: err.message, stack: err.stack, userId: req.user._id });
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.getSignature = (req, res) => {
  console.log('Generating upload signature');
  try {
    const timestamp = Math.round((new Date()).getTime()/1000);
    const signature = cloudinary.utils.api_sign_request({
      timestamp: timestamp,
      folder: 'coach_profile_pictures',
      eager: 'w_400,h_400,c_fill,g_face'
    }, process.env.CLOUDINARY_API_SECRET);

    console.log('Signature generated successfully');
    res.json({ timestamp, signature });
  } catch (error) {
    logger.error('Error generating signature:', error);
    res.status(500).json({ message: 'Error generating signature', error: error.message });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('[coachController] Received request to upload profile picture');
    console.log('[coachController] Request body:', req.body);
    console.log('[coachController] User ID:', req.user._id);

    const { publicId, url } = req.body;
    
    if (!publicId || !url) {
      console.log('[coachController] Invalid profile picture data');
      return res.status(400).json({ msg: 'Invalid profile picture data' });
    }

    let coach = await Coach.findOneAndUpdate(
      { user: req.user._id },
      { 
        profilePicture: { 
          publicId, 
          url
        } 
      },
      { new: true }
    ).populate('user');

    if (!coach) {
      console.log('[coachController] Coach not found for user ID:', req.user._id);
      return res.status(404).json({ msg: 'Coach not found' });
    }

    console.log('[coachController] Profile picture updated successfully');
    res.json(coach);
  } catch (err) {
    console.error('[coachController] Error in uploadProfilePicture:', err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.getProfilePictureSignature = (req, res) => {
  const timestamp = Math.round((new Date()).getTime()/1000);
  const signature = cloudinary.utils.api_sign_request({
    timestamp: timestamp,
    upload_preset: 'coach_profile_pictures',
  }, process.env.CLOUDINARY_API_SECRET);

  res.json({
    signature,
    timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY
  });
};

exports.getSessionTypes = async (req, res) => {
  console.log(`[getSessionTypes] Fetching global session types`);

  try {
    const sessionTypes = await SessionType.find({});
    console.log(`[getSessionTypes] Found ${sessionTypes.length} session types`);

    const formattedSessionTypes = sessionTypes.map(type => ({
      id: type._id.toString(),
      name: type.name,
      duration: type.duration || 0,
      price: type.price || 0,
      description: type.description,
      isGroupSession: type.isGroupSession
    }));

    console.log(`[getSessionTypes] Formatted session types:`, formattedSessionTypes);
    res.json(formattedSessionTypes);
  } catch (err) {
    console.error(`[getSessionTypes] Error occurred:`, err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.createSessionType = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, duration, price } = req.body;

  try {
    let coach = await Coach.findById(req.params.id);
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    if (req.user._id !== coach.user.toString()) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    const newSessionType = new SessionType({
      name,
      duration,
      price,
      coach: coach._id
    });

    const sessionType = await newSessionType.save();

    coach.sessionTypes.push(sessionType._id);
    await coach.save();

    res.json(sessionType);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getSessionTypes = async (req, res) => {
  console.log(`[getSessionTypes] Fetching global session types`);

  try {
    const sessionTypes = await SessionType.find({});

    const formattedSessionTypes = sessionTypes.map(type => ({
      id: type._id,
      name: type.name,
      duration: type.duration,
      price: type.price
    }));

    console.log(`[getSessionTypes] Session types found:`, formattedSessionTypes);
    res.json(formattedSessionTypes);
  } catch (err) {
    console.error(`[getSessionTypes] Error occurred:`, err);
    res.status(500).send('Server Error');
  }
};

exports.updateSessionTypes = async (req, res) => {
  const { userId } = req.params;
  const { sessionTypes } = req.body;

  try {
    const coach = await Coach.findOne({ user: userId });

    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    coach.settings.sessionTypes = sessionTypes;
    await coach.save();

    res.json(coach.settings.sessionTypes);
  } catch (err) {
    console.error(`[updateSessionTypes] Error occurred:`, err);
    res.status(500).send('Server Error');
  }
};

exports.updateSessionType = async (req, res) => {
  const { userId, typeId } = req.params;
  const { name, duration, price } = req.body;

  try {
    const coach = await Coach.findOne({ user: userId });

    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    const sessionTypeIndex = coach.settings.sessionTypes.findIndex(
      type => type._id.toString() === typeId
    );

    if (sessionTypeIndex === -1) {
      return res.status(404).json({ msg: 'Session type not found' });
    }

    coach.settings.sessionTypes[sessionTypeIndex] = {
      ...coach.settings.sessionTypes[sessionTypeIndex],
      name,
      duration,
      price,
    };

    await coach.save();

    res.json(coach.settings.sessionTypes[sessionTypeIndex]);
  } catch (err) {
    console.error(`[updateSessionType] Error occurred:`, err);
    res.status(500).send('Server Error');
  }
};

exports.updateAllSessionTypes = async (req, res) => {
  const { userId } = req.params;
  const { sessionTypes } = req.body;

  try {
    const coach = await Coach.findOne({ user: userId });

    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    coach.settings.sessionTypes = sessionTypes;
    await coach.save();

    res.json(coach.settings.sessionTypes);
  } catch (err) {
    console.error(`[updateAllSessionTypes] Error occurred:`, err);
    res.status(500).send('Server Error');
  }
};

exports.deleteSessionType = async (req, res) => {
  const { userId, typeId } = req.params;

  try {
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    coach.settings.sessionTypes = coach.settings.sessionTypes.filter(
      type => type._id.toString() !== typeId
    );
    await coach.save();

    res.json({ msg: 'Session type removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

exports.getCoachSettings = async (req, res) => {
  const { userId } = req.params;
  console.log(`[getCoachSettings] Fetching settings for user ID: ${userId}`);
  try {
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      console.log(`[getCoachSettings] Coach not found for user ID: ${userId}`);
      return res.status(404).json({ msg: 'Coach not found' });
    }
    
    const coachSettings = coach.settings ? coach.settings.toObject() : {};

    const mergedSettings = {
      ...defaultSettings,
      ...coachSettings,
      professionalProfile: { ...defaultSettings.professionalProfile, ...coachSettings.professionalProfile },
      availabilityManagement: { ...defaultSettings.availabilityManagement, ...coachSettings.availabilityManagement },
      sessionManagement: { 
        ...defaultSettings.sessionManagement, 
        ...coachSettings.sessionManagement,
        overtime: { ...defaultSettings.sessionManagement.overtime, ...coachSettings.sessionManagement?.overtime },
        durationRules: { ...defaultSettings.sessionManagement.durationRules, ...coachSettings.sessionManagement?.durationRules },
      },
      clientManagement: { ...defaultSettings.clientManagement, ...coachSettings.clientManagement },
      paymentAndBilling: { ...defaultSettings.paymentAndBilling, ...coachSettings.paymentAndBilling },
      marketingAndGrowth: { ...defaultSettings.marketingAndGrowth, ...coachSettings.marketingAndGrowth },
      analyticsDashboard: { ...defaultSettings.analyticsDashboard, ...coachSettings.analyticsDashboard },
      privacySettings: { 
        ...defaultSettings.privacySettings, 
        ...coachSettings.privacySettings,
        profilePrivacy: { ...defaultSettings.privacySettings.profilePrivacy, ...coachSettings.privacySettings?.profilePrivacy },
      },
      notificationPreferences: { ...defaultSettings.notificationPreferences, ...coachSettings.notificationPreferences },
    };

    console.log(`[getCoachSettings] Settings found and merged for coach ID: ${coach._id}, user ID: ${userId}`);
    res.json(mergedSettings);
  } catch (err) {
    console.error(`[getCoachSettings] Error:`, err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.updateCoachSettings = async (req, res) => {
  const { userId } = req.params;
  const settings = req.body.settings;

  if (settings.cancellationPolicy) {
    const { oneOnOne, webinar } = settings.cancellationPolicy;
    const validateTiers = (tiers) => {
      if (!Array.isArray(tiers)) return false;
      return tiers.every(tier =>
        typeof tier.hoursBefore === 'number' && tier.hoursBefore >= 0 &&
        typeof tier.refundPercentage === 'number' && tier.refundPercentage >= 0 && tier.refundPercentage <= 100
      );
    };

    if (!oneOnOne || !webinar || !validateTiers(oneOnOne.tiers) || !validateTiers(webinar.tiers)) {
      logger.warn('[updateCoachSettings] Invalid cancellationPolicy structure received for userId:', { userId });
      return res.status(400).json({ message: 'Invalid cancellation policy data.' });
    }
  }

  console.log('[updateCoachSettings] Updating settings for userId:', { userId });

  try {
    // Find the existing coach document
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      logger.error('[updateCoachSettings] Coach not found for userId:', { userId });
      return res.status(404).json({ message: 'Coach not found' });
    }

    // Merge the incoming settings with the existing settings
    const updatedSettings = {
      ...coach.settings.toObject(),
      ...settings,
      professionalProfile: {
        ...coach.settings.professionalProfile,
        ...settings.professionalProfile,
      },
      availabilityManagement: {
        ...coach.settings.availabilityManagement,
        ...settings.availabilityManagement,
        workingHours: {
          ...coach.settings.availabilityManagement.workingHours,
          ...settings.availabilityManagement?.workingHours,
        },
      },
      sessionManagement: {
        ...coach.settings.sessionManagement,
        ...settings.sessionManagement,
        overtime: {
          ...coach.settings.sessionManagement.overtime,
          ...settings.sessionManagement?.overtime,
          allowOvertime: settings.sessionManagement?.overtime?.allowOvertime ?? false,
          freeOvertimeDuration: Number.isFinite(settings.sessionManagement?.overtime?.freeOvertimeDuration)
            ? Number(settings.sessionManagement.overtime.freeOvertimeDuration)
            : 0,
          paidOvertimeDuration: Number.isFinite(settings.sessionManagement?.overtime?.paidOvertimeDuration)
            ? Number(settings.sessionManagement.overtime.paidOvertimeDuration)
            : 0,
          overtimeRate: Number.isFinite(settings.sessionManagement?.overtime?.overtimeRate)
            ? Number(settings.sessionManagement.overtime.overtimeRate)
            : 0,
        },
        durationRules: {
          ...coach.settings.sessionManagement.durationRules,
          ...settings.sessionManagement?.durationRules,
        },
      },
       clientManagement: {
        ...coach.settings.clientManagement,
        ...settings.clientManagement,
      },
      insuranceRecognition: {
        ...coach.settings.insuranceRecognition,
        ...settings.insuranceRecognition,
      },
      paymentAndBilling: {
        ...coach.settings.paymentAndBilling,
        ...settings.paymentAndBilling,
        stripe: {
          ...coach.settings.paymentAndBilling.stripe,
          ...settings.paymentAndBilling?.stripe,
        },
      },
      marketingAndGrowth: {
        ...coach.settings.marketingAndGrowth,
        ...settings.marketingAndGrowth,
      },
      analyticsDashboard: {
        ...coach.settings.analyticsDashboard,
        ...settings.analyticsDashboard,
      },
      privacySettings: {
        ...coach.settings.privacySettings,
        ...settings.privacySettings,
        profilePrivacy: {
          ...coach.settings.privacySettings.profilePrivacy,
          ...settings.privacySettings?.profilePrivacy,
        },
      },
      notificationPreferences: {
        ...coach.settings.notificationPreferences,
        ...settings.notificationPreferences,
      },
    };

    // Remove any top-level overtime field if present
    delete updatedSettings.overtime;

    console.log('[updateCoachSettings] Merged settings:', { updatedSettings });

    // Update the coach document
    coach.settings = updatedSettings;
    coach.markModified('settings');
    await coach.save();

    console.log('[updateCoachSettings] Settings updated successfully for userId:', { userId });

    res.status(200).json({
      message: 'Settings updated successfully',
      settings: coach.settings,
    });
  } catch (error) {
    logger.error('[updateCoachSettings] Error updating settings for userId:', {
      userId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      message: 'Error updating settings',
      error: error.message,
    });
  }
};

exports.createSession = async (req, res) => {
  try {
    const { userId } = req.params;
    const sessionData = req.body;
    
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }

    const newSession = {
      ...sessionData,
      id: Date.now(), // Use a timestamp as a temporary ID
    };

    coach.availability.push(newSession);
    await coach.save();

    res.status(201).json(newSession);
  } catch (error) {
    console.error('[createSession] Error:', error);
    res.status(500).json({ message: 'Error creating session', error: error.message });
  }
};

exports.getCoaches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const { sortBy = 'popularity_desc', ...filters } = req.query;
    
    console.log('[getCoaches] Received request with filters:', { sortBy, ...filters });

    const query = { status: 'active' };

if (req.user && req.user.id) {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.user.id);
    
    const currentUser = await User.findById(currentUserId).select('blockedUsers.user').lean();
    const usersBlockedByCurrentUser = currentUser?.blockedUsers?.map(b => b.user) || [];

    const usersWhoBlockedCurrentUser = await User.find({ 'blockedUsers.user': currentUserId }).select('_id').lean();
    const userIdsWhoBlockedCurrentUser = usersWhoBlockedCurrentUser.map(u => u._id);
    
    const allBlockedUserIds = [...new Set([...usersBlockedByCurrentUser, ...userIdsWhoBlockedCurrentUser])];

    if (allBlockedUserIds.length > 0) {
        query.user = { $nin: allBlockedUserIds };
    }
  } catch (err) {
    logger.error('[getCoaches Block Filter] Error processing block list. Filter not applied.', { error: err.message });
  }
}

    console.log('[coachController.getCoaches] Received request', { page, limit, sortBy, filters });

    if (filters.searchTerm) {
      query.$text = { $search: filters.searchTerm };
    }

    const arrayFilterKeys = ['specialties', 'languages', 'educationLevels', 'coachingStyles', 'skills'];
    for (const key of arrayFilterKeys) {
      if (filters[key] && typeof filters[key] === 'string') {
        const ids = filters[key]
          .split(',')
          .map(id => id.trim())
          .filter(id => mongoose.Types.ObjectId.isValid(id))
          .map(id => new mongoose.Types.ObjectId(id));

        if (ids.length > 0) {
          const field = key === 'languages' ? 'languages.language' : key;
          query[field] = { $in: ids };
        }
      }
    }

     const liveSessionFilter = filters.liveSessionAvailable === 'true';
    if (filters.isInsuranceRecognized === 'true') {
      query['settings.insuranceRecognition.isRecognized'] = true;
    }

    console.log('[coachController.getCoaches] Constructed MongoDB query', { query: JSON.stringify(query) });

    const pipeline = [];

    if (liveSessionFilter) {
       console.log('[getCoaches] Applying Live Session Filter with conditions:', liveSessionMatchConditions);
      const liveSessionMatchConditions = {
        'userData.status': 'online',
        'priceConfigData.liveSessionRate.amount': { $gt: 0 }
      };

      const livePriceQuery = {};
      if (filters.minLivePrice) {
        livePriceQuery.$gte = parseInt(filters.minLivePrice, 10);
      }
      if (filters.maxLivePrice) {
        livePriceQuery.$lte = parseInt(filters.maxLivePrice, 10);
      }

      if (Object.keys(livePriceQuery).length > 0) {
        liveSessionMatchConditions['priceConfigData.liveSessionRate.amount'] = {
            ...liveSessionMatchConditions['priceConfigData.liveSessionRate.amount'],
            ...livePriceQuery
        };
      }

      pipeline.push(
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userData' } },
        { $lookup: { from: 'price_configurations', localField: 'user', foreignField: 'user', as: 'priceConfigData' } },
        { $unwind: "$userData" },
        { $unwind: "$priceConfigData" },
        { $match: liveSessionMatchConditions }
      );
    }
    
    pipeline.push({ $match: query });
    pipeline.push(
        {
            $addFields: {
                "settings.professionalProfile.hourlyRate": { 
                    $ifNull: ["$settings.professionalProfile.hourlyRate", "$hourlyRate"] 
                }
            }
        }
    );

    const priceQuery = {};
    if (filters.minPrice) {
      priceQuery.$gte = parseInt(filters.minPrice, 10);
    }
    if (filters.maxPrice) {
      priceQuery.$lte = parseInt(filters.maxPrice, 10);
    }
    if (Object.keys(priceQuery).length > 0) {
      pipeline.push({ $match: { 'settings.professionalProfile.hourlyRate': priceQuery } });
    }

    pipeline.push(
        {
            $lookup: {
                from: 'reviews',
                localField: 'user',
                foreignField: 'rateeId',
                as: 'reviewsData'
            }
        },
        {
            $addFields: {
                rating: { $ifNull: [{ $avg: '$reviewsData.rating' }, 0] },
                totalReviews: { $ifNull: [{ $size: '$reviewsData' }, 0] }
            }
        }
    );


    if (filters.minRating) {
      pipeline.push({ $match: { rating: { $gte: parseFloat(filters.minRating) } } });
    }
    
    let sortStage = {};
    switch (sortBy) {
      case 'popularity_desc':
        sortStage = { totalReviews: -1, rating: -1 };
        break;
      case 'rating_desc':
        sortStage = { rating: -1, totalReviews: -1 };
        break;
      case 'price_asc':
        sortStage = { 'settings.professionalProfile.hourlyRate': 1 };
        break;
      case 'price_desc':
        sortStage = { 'settings.professionalProfile.hourlyRate': -1 };
        break;
      case 'newest_desc':
        sortStage = { createdAt: -1 };
        break;
      default:
        sortStage = { totalReviews: -1, rating: -1 };
    }
    console.log('[coachController.getCoaches] Applying sort options', { sortBy, sortStage });
    pipeline.push({ $sort: sortStage });
    
    const countPipeline = [...pipeline, { $count: 'totalDocs' }];
    const totalResult = await Coach.aggregate(countPipeline);
    const totalCoaches = totalResult.length > 0 ? totalResult[0].totalDocs : 0;
    
    pipeline.push({ $skip: skip }, { $limit: limit });

    pipeline.push({
      $project: {
        reviewsData: 0,
        userData: 0,
        priceConfigData: 0
      }
    });

    const coaches = await Coach.aggregate(pipeline);

    console.log(`[getCoaches] Aggregation pipeline executed. Found ${coaches.length} coaches before final formatting.`);

    await Coach.populate(coaches, [
      { path: 'user', select: 'firstName lastName email profilePicture status' },
      { path: 'specialties' },
      { path: 'languages.language' }
    ]);

    const language = req.language || 'en';
    const allSpecialtyIds = new Set();
    const allLanguageIds = new Set();
    coaches.forEach(coach => {
      coach.specialties?.forEach(s => allSpecialtyIds.add(s._id.toString()));
      coach.languages?.forEach(l => l.language && allLanguageIds.add(l.language._id.toString()));
    });

    if (allSpecialtyIds.size > 0 || allLanguageIds.size > 0) {
      const translationMap = new Map();
      const specialtyKeys = Array.from(allSpecialtyIds).map(id => `specialties_${id}`);
      const languageKeys = Array.from(allLanguageIds).map(id => `languages_${id}`);
      const translationKeys = [...specialtyKeys, ...languageKeys];
      
      const translations = await Translation.find({
        key: { $in: translationKeys },
        [`translations.${language}`]: { $exists: true, $ne: null }
      }).lean();

      translations.forEach(t => {
        translationMap.set(t.key, t.translations[language]);
      });

      coaches.forEach(coach => {
        if (coach.specialties) {
          coach.specialties = coach.specialties.map(s => ({
              ...s,
              translation: translationMap.get(`specialties_${s._id.toString()}`) || null
          }));
        }
        if (coach.languages) {
          coach.languages = coach.languages
            .filter(lang => lang.language)
            .map(lang => ({
                ...lang.language,
                translation: translationMap.get(`languages_${lang.language._id.toString()}`) || null,
                strength: lang.strength
            }));
        }
      });
    }

    console.log(`[coachController.getCoaches] Found ${coaches.length} coaches for page ${page}`);

    const formattedCoaches = coaches.map(coach => ({
      ...coach,
      userId: coach.user?._id,
      _id: coach._id,
      liveSessionRate: coach.priceConfigData?.[0]?.liveSessionRate || null,
    }));

    res.json({
      coaches: formattedCoaches,
      currentPage: page,
      totalPages: Math.ceil(totalCoaches / limit),
      hasMore: page < Math.ceil(totalCoaches / limit),
    });

  } catch (error) {
    logger.error('[coachController.getCoaches] Error getting coaches', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error getting coaches', error: error.message });
  }
};

exports.getCoachReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('[CoachController.getCoachReviews] Fetching reviews', { userId });

    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      logger.warn('[CoachController.getCoachReviews] Coach not found', { userId });
      return res.status(404).json({ success: false, message: 'Coach not found' });
    }

    const reviews = await Review.find({ rateeId: userId, isPrivate: false, isVisible: true })
      .populate('raterId', 'firstName lastName')
      .sort({ createdAt: -1 });

    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingBreakdown[r.rating] = (ratingBreakdown[r.rating] || 0) + 1;
      }
    });

    const publicReviews = reviews.map((r) => ({
      id: r._id.toString(),
      rating: r.rating,
      comment: r.comment,
      coachResponse: r.coachResponse,
      clientInitials: `${r.raterId.firstName[0]}.${r.raterId.lastName[0]}.`,
    }));

    console.log('[CoachController.getCoachReviews] Reviews fetched successfully', {
      userId,
      reviewCount: reviews.length,
      averageRating: averageRating.toFixed(1),
    });

    res.status(200).json({
      success: true,
      averageRating,
      ratingBreakdown,
      reviews: publicReviews,
    });
  } catch (error) {
    logger.error('[CoachController.getCoachReviews] Error fetching reviews', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
    });
    res.status(500).json({ success: false, message: 'Error fetching reviews', error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const coachId = req.user._id;

        const programs = await Program.find({ coach: coachId }).lean();
        const programIds = programs.map(p => p._id);

        const revenueData = await Payment.aggregate([
            { $match: { program: { $in: programIds }, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount.total' } } }
        ]);
        const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

        const totalEnrollments = await Enrollment.countDocuments({ program: { $in: programIds } });

        const reviews = await Review.find({ ratee: coachId, rateeModel: 'User' }).lean(); // Assuming program reviews are not yet implemented
        const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
        const reviewCount = reviews.length;

        // Dummy data for charts - replace with real aggregations when historical data is available
        const monthlyRevenue = [
            { name: 'Jan', revenue: Math.floor(Math.random() * 2000) + 500 },
            { name: 'Feb', revenue: Math.floor(Math.random() * 2000) + 600 },
            { name: 'Mar', revenue: Math.floor(Math.random() * 2000) + 700 },
            { name: 'Apr', revenue: Math.floor(Math.random() * 2000) + 800 },
            { name: 'May', revenue: Math.floor(Math.random() * 2000) + 900 },
            { name: 'Jun', revenue: Math.floor(Math.random() * 2000) + 1000 },
        ];

        const programEnrollments = programs.map(p => ({
            name: p.title.length > 20 ? `${p.title.substring(0, 20)}...` : p.title,
            enrollments: p.enrollmentsCount || 0,
        }));

        res.status(200).json({
            totalRevenue,
            totalEnrollments,
            averageRating,
            reviewCount,
            monthlyRevenue,
            programEnrollments,
        });

    } catch (error) {
        logger.error('Error fetching coach dashboard stats', { error: error.message, stack: error.stack, coachId: req.user._id });
        res.status(500).json({ message: 'Error fetching dashboard statistics.' });
    }
};

exports.getProgramAnalytics = async (req, res) => {
    try {
        const coachId = req.user._id;
        const { programIds, period, startDate: customStartDate, endDate: customEndDate } = req.query;
        console.log(`[DEBUG_ANALYTICS_TABLE] 1. ENTERING getProgramAnalytics for coachId: ${coachId}`, { programIds, period });

        const programQuery = { coach: coachId };
        if (programIds) {
            const parsedProgramIds = programIds.split(',').filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
            if (parsedProgramIds.length > 0) {
                programQuery._id = { $in: parsedProgramIds };
            }
        }

        const programs = await Program.find(programQuery)
            .populate('modules')
            .lean();

        if (!programs.length) {
            console.log('[DEBUG_ANALYTICS_TABLE] 2. No programs found for coach. Returning empty array.');
            return res.status(200).json([]);
        }

        const programIdsForMatch = programs.map(p => p._id);
        console.log(`[DEBUG_ANALYTICS_TABLE] 2. Found ${programIdsForMatch.length} programs. IDs:`, programIdsForMatch.map(id => id.toString()));

        let dateMatch = {};
        let startDate, endDate = new Date();
        if (period === 'custom' && customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else if (period) {
            switch (period) {
                case 'last7days': startDate = new Date(); startDate.setDate(endDate.getDate() - 7); break;
                case 'last30days': startDate = new Date(); startDate.setDate(endDate.getDate() - 30); break;
                case 'last90days': startDate = new Date(); startDate.setDate(endDate.getDate() - 90); break;
                case 'allTime': startDate = new Date(0); break;
                default: startDate = new Date(0);
            }
        } else {
            startDate = new Date(0);
        }
        dateMatch = { createdAt: { $gte: startDate, $lte: endDate } };


        const [enrollments, reviews, revenueData] = await Promise.all([
            Enrollment.find({ program: { $in: programIdsForMatch }, ...dateMatch }).lean(),
            Review.find({ ratee: { $in: programIdsForMatch }, rateeModel: 'Program', ...dateMatch }).lean(),
            Payment.aggregate([
                { $match: { program: { $in: programIdsForMatch }, status: 'completed', ...dateMatch } },
                { $group: { _id: '$program', totalRevenue: { $sum: '$amount.total' } } }
            ])
        ]);
        
        console.log('[DEBUG_ANALYTICS_TABLE] 3. Raw revenue aggregation result from Payment collection:', JSON.stringify(revenueData, null, 2));

        const revenueMap = new Map(revenueData.map(item => [item._id.toString(), item.totalRevenue]));
        console.log('[DEBUG_ANALYTICS_TABLE] 4. Constructed Revenue Map:', Object.fromEntries(revenueMap));


       const analyticsData = programs.map(program => {
            const programEnrollments = enrollments.filter(e => e.program.equals(program._id));
            const programReviews = reviews.filter(r => r.ratee.equals(program._id));
            const validProgramReviews = programReviews.filter(r => r.rating > 0);

            const totalLessons = program.modules.reduce((acc, mod) => acc + (mod.lessons?.length || 0), 0);
            
            let totalCompletedLessons = 0;
            programEnrollments.forEach(e => {
                totalCompletedLessons += e.progress?.completedLessons?.length || 0;
            });

            const totalPossibleLessons = programEnrollments.length * totalLessons;
            const completionRate = totalPossibleLessons > 0 ? (totalCompletedLessons / totalPossibleLessons) * 100 : 0;
            
            const averageRating = validProgramReviews.length > 0
                ? validProgramReviews.reduce((sum, r) => sum + r.rating, 0) / validProgramReviews.length
                : 0;

            return {
                programId: program._id,
                title: program.title,
                enrollmentCount: programEnrollments.length,
                completionRate: completionRate,
                status: program.status,
                basePrice: program.basePrice,
                revenue: revenueMap.get(program._id.toString()) || 0,
                totalLessons: totalLessons,
                averageRating: averageRating,
            };
        });
        
        console.log('[DEBUG_ANALYTICS_TABLE] 5. Final analyticsData object being sent (first item):', JSON.stringify(analyticsData[0], null, 2));


        res.status(200).json(analyticsData);

    } catch (error) {
        logger.error('Error fetching program analytics', { error: error.message, stack: error.stack, coachId: req.user._id });
        res.status(500).json({ message: 'Error fetching program analytics.' });
    }
};

exports.getCoachProfilePictureSignature = (req, res) => {
  try {
    const timestamp = Math.round((new Date()).getTime()/1000);
    const folder = `coaches/${req.user.id}`; // Define folder
    const signature = cloudinary.utils.api_sign_request({
      timestamp: timestamp,
      upload_preset: 'coach_profile_pictures',
      folder: folder // Sign with folder
    }, process.env.CLOUDINARY_API_SECRET);

    res.json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: folder // Return folder to frontend
    });
  } catch (error) {
    logger.error('Error generating coach signature:', { error: error.message });
    res.status(500).json({ message: 'Error generating signature', error: error.message });
  }
};

exports.uploadCoachProfilePicture = async (req, res) => {
  try {
    const { publicId, url } = req.body;
    const userId = req.params.userId;

    if (!publicId || !url) {
      return res.status(400).json({ msg: 'Invalid profile picture data' });
    }
    
    const existingCoach = await Coach.findOne({ user: userId }).select('profilePicture').lean();
    const oldPublicId = existingCoach?.profilePicture?.publicId;

    const coach = await Coach.findOneAndUpdate(
      { user: userId },
      { 
        profilePicture: { 
          publicId, 
          url
        } 
      },
      { new: true }
    );

    if (!coach) {
      return res.status(404).json({ msg: 'Coach not found' });
    }
    
    if (oldPublicId && oldPublicId !== publicId) {
      assetCleanupService.queueAssetDeletion(oldPublicId, 'image');
    }

    const fullyPopulatedCoach = await getFullCoachProfileById(userId, req.user._id);
    if (!fullyPopulatedCoach) {
        return res.status(404).json({ msg: 'Coach not found after update' });
    }

    res.json(fullyPopulatedCoach);
  } catch (err) {
    logger.error('[uploadCoachProfilePicture] Error:', { error: err.message });
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

exports.removeCoachProfilePicture = async (req, res) => {
  try {
    const userId = req.params.userId;
    const coach = await Coach.findOne({ user: userId });
    
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }

    if (coach.profilePicture && coach.profilePicture.publicId) {
      assetCleanupService.queueAssetDeletion(coach.profilePicture.publicId, 'image');
    }

    coach.profilePicture = undefined;
    await coach.save();

    const fullyPopulatedCoach = await getFullCoachProfileById(userId, req.user._id);
    if (!fullyPopulatedCoach) {
        return res.status(404).json({ message: 'Coach not found after update' });
    }

    res.json(fullyPopulatedCoach);
  } catch (error) {
    logger.error('Error in removeCoachProfilePicture:', { error: error.message });
    res.status(500).json({ message: 'Error removing profile picture', error: error.message });
  }
};

exports.getDashboardOverview = async (req, res) => {
    try {
        const coachUserId = new mongoose.Types.ObjectId(req.user._id);
         console.log('[getDashboardOverview] Starting overview fetch for coach user ID:', { coachUserId }); 

          const coach = await Coach.findOne({ user: coachUserId }).select('_id settings.dashboardPreferences settings.dashboardKpiConfig').lean();
        if (!coach) {
            logger.warn('[getDashboardOverview] Coach document not found for user ID:', { coachUserId });
            return res.status(404).json({ message: "Coach not found" });
        }
        const coachDocId = coach._id;
        console.log('[getDashboardOverview] Found Coach document ID for data aggregation', { coachUserId, coachDocId });

        const { period, startDate: customStartDate, endDate: customEndDate, programIds, clientIds, sessionTypeIds } = req.query;
        let startDate, endDate = new Date();

        if (period === 'custom' && customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else if (period) {
            switch (period) {
                case 'last7days':
                    startDate = new Date();
                    startDate.setDate(endDate.getDate() - 7);
                    break;
                case 'last90days':
                    startDate = new Date();
                    startDate.setDate(endDate.getDate() - 90);
                    break;
                case 'allTime':
                    startDate = new Date(0);
                    break;
                case 'last30days':
                default:
                    startDate = new Date();
                    startDate.setDate(endDate.getDate() - 30);
            }
        } else if (customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            endDate = new Date(customEndDate);
        } else {
            startDate = new Date();
            startDate.setDate(endDate.getDate() - 30);
        }

        const parseIds = (ids) => ids ? ids.split(',').filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) : [];
        const parsedProgramIds = parseIds(programIds);
        const parsedClientIds = parseIds(clientIds);
        const parsedSessionTypeIds = parseIds(sessionTypeIds);

        let programFilterMatch = {};
        if (parsedProgramIds.length > 0) {
            programFilterMatch.program = { $in: parsedProgramIds };
        }
        
        const clientFilterMatch = (userField) => {
            if (parsedClientIds.length > 0) {
                return { [userField]: { $in: parsedClientIds } };
            }
            return {};
        };
        
        let sessionTypeFilterMatch = {};
        if (parsedSessionTypeIds.length > 0) {
            sessionTypeFilterMatch.sessionType = { $in: parsedSessionTypeIds };
        }

        const dateMatch = { createdAt: { $gte: startDate, $lte: endDate } };
        const dateMatchBooking = { start: { $gte: startDate, $lte: endDate } };

        const programQuery = { coach: coachUserId };
        if (parsedProgramIds.length > 0) {
            programQuery._id = { $in: parsedProgramIds };
        }
        const coachPrograms = await Program.find(programQuery).select('_id title averageRating').lean();
        const coachProgramIds = coachPrograms.map(p => p._id);
        
        const coachIdMatch = { $or: [{ coach: coachUserId }, { coach: coachDocId }] };
        
        const [
            overviewKpis, 
            actionCenterData, 
            analyticsData
        ] = await Promise.all([
            // 1. Overview KPIs
            (async () => {
                const enrollmentsPromise = Enrollment.countDocuments({ program: { $in: coachProgramIds }, ...dateMatch, ...clientFilterMatch('user') });
                const sessionsBookedPromise = Booking.countDocuments({ ...coachIdMatch, isAvailability: false, status: 'confirmed', ...dateMatchBooking, ...clientFilterMatch('user'), ...sessionTypeFilterMatch });
                const newClientsPromise = Connection.countDocuments({ coach: coachUserId, status: 'accepted', updatedAt: { $gte: startDate, $lte: endDate } });
                
                  const paymentStatsPromise = Payment.aggregate([
                    { $match: { recipient: coachUserId, status: 'completed', ...dateMatch, ...programFilterMatch, ...clientFilterMatch('payer') } },
                    {
                        $group: {
                            _id: null,
                            grossRevenue: { $sum: '$amount.total' },
                            netEarnings: { $sum: { $subtract: ['$amount.total', { $add: ['$amount.platformFee', { $ifNull: ['$amount.vat.amount', 0] }] }] } }
                        }
                    }
                ]);

                const [enrollments, sessionsBooked, newClients, paymentStats] = await Promise.all([enrollmentsPromise, sessionsBookedPromise, newClientsPromise, paymentStatsPromise]);
                const financials = paymentStats[0] || { grossRevenue: 0, netEarnings: 0 };

                return {
                    newEnrollments: enrollments || 0,
                    sessionsBooked: sessionsBooked || 0,
                    newClients: newClients || 0,
                    grossRevenue: financials.grossRevenue,
                    netEarnings: financials.netEarnings,
                };
            })(),
            // 2. Action Center
           (async () => {
                const actionableNotifications = await Notification.find({
    recipient: coachUserId,
    status: 'active',
    $or: [
      { 'metadata.additionalData.requiresAction': true },
      { 'metadata.additionalData.actionRequired': true }
    ]
})
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('sender', 'firstName lastName profilePicture')
                .populate({
                    path: 'metadata.bookingId',
                    populate: [
                        { path: 'sessionType', select: 'name' },
                        { path: 'user', select: 'firstName lastName profilePicture' }
                    ]
                })
                .lean();
                console.log(`[getDashboardOverview] Action Center Query Result: Found ${actionableNotifications.length} notifications.`);
                if (actionableNotifications.length > 0) {
                   
                }
                return actionableNotifications;
            })(),
            
            // 3. Detailed Analytics Block
            (async () => {
                const paymentsInPeriod = await Payment.find({ recipient: coachUserId, status: 'completed', ...dateMatch, ...programFilterMatch, ...clientFilterMatch('payer') }).lean();
                
                console.log('[getDashboardOverview] ANALYTICS: Running targeted aggregation for program revenue.');
                const programRevenueData = await Payment.aggregate([
                    { $match: { recipient: coachUserId, status: 'completed', program: { $exists: true, $in: coachProgramIds }, ...dateMatch, ...clientFilterMatch('payer') } },
                    { $group: { _id: '$program', totalRevenue: { $sum: '$amount.total' } } }
                ]);
                const revenueMap = new Map(programRevenueData.map(item => [item._id.toString(), item.totalRevenue]));
                console.log('[getDashboardOverview] ANALYTICS: Constructed Program Revenue Map via aggregation.', { mapSize: revenueMap.size, content: Object.fromEntries(revenueMap) });
                
                const bookingsInPeriod = await Booking.find({ ...coachIdMatch, isAvailability: false, ...dateMatchBooking, ...clientFilterMatch('user'), ...sessionTypeFilterMatch }).populate('sessionType', 'name').populate('user', 'firstName lastName').lean();
                const enrollmentsInPeriod = await Enrollment.find({ program: { $in: coachProgramIds }, ...dateMatch, ...programFilterMatch, ...clientFilterMatch('user') }).lean();
                const allConnections = await Connection.find({ coach: coachUserId, status: 'accepted' }).populate('client', 'firstName lastName email profilePicture').lean();
                const allBookingsForCoach = await Booking.find({ ...coachIdMatch, status: { $in: ['completed', 'confirmed', 'scheduled'] } }).sort({ start: 1 }).lean();

                console.log('[getDashboardOverview] ANALYTICS: Data fetching complete.', { payments: paymentsInPeriod.length, enrollments: enrollmentsInPeriod.length });

                // Earnings Analytics
                let earnings = {};
                const grossRevenue = paymentsInPeriod.reduce((sum, p) => sum + (p.amount?.total || 0), 0);
                const platformFees = paymentsInPeriod.reduce((sum, p) => sum + (p.amount?.platformFee || 0), 0);
                const netEarnings = grossRevenue - platformFees;
                const clientIdsInPeriod = [...new Set(paymentsInPeriod.map(p => p.payer?.toString()))];
                earnings.kpis = {
                    grossRevenue,
                    netEarnings,
                    platformFees,
                    avgRevenuePerClient: clientIdsInPeriod.length > 0 ? grossRevenue / clientIdsInPeriod.length : 0,
                };

                const revenueOverTimeData = paymentsInPeriod.reduce((acc, p) => {
                    const date = new Date(p.createdAt).toISOString().slice(0, 10);
                    if (!acc[date]) acc[date] = { date, grossRevenue: 0, netEarnings: 0 };
                    acc[date].grossRevenue += p.amount.total;
                    acc[date].netEarnings += p.amount.total - (p.amount.platformFee + (p.amount.vat?.amount || 0));
                    return acc;
                }, {});
                earnings.revenueOverTime = Object.values(revenueOverTimeData).sort((a,b) => new Date(a.date) - new Date(b.date));
                
                const totalProgramRevenue = Array.from(revenueMap.values()).reduce((sum, rev) => sum + rev, 0);
                const revenueBySourceMap = {
                    'Programs': totalProgramRevenue,
                    'Session Bookings': grossRevenue - totalProgramRevenue,
                };
                 console.log('[getDashboardOverview] ANALYTICS: Revenue by source calculated.', { grossRevenue, totalProgramRevenue, breakdown: revenueBySourceMap });

                earnings.revenueBySource = Object.entries(revenueBySourceMap)
                    .map(([name, value]) => ({ name, value }));

                // Bookings Analytics (remains the same)
                let bookings = {};
                const relevantBookings = bookingsInPeriod.filter(b => ['completed', 'confirmed', 'pending_payment', 'scheduled'].includes(b.status));
                const cancelledSessions = bookingsInPeriod.filter(b => b.status.startsWith('cancelled'));
                const totalSessions = relevantBookings.length;
                const totalDurationMinutes = relevantBookings.reduce((sum, b) => {
                    const duration = (new Date(b.end) - new Date(b.start)) / 60000;
                    return sum + (isNaN(duration) ? 0 : duration);
                }, 0);
                bookings.kpis = {
                    totalSessions,
                    avgSessionDuration: totalSessions > 0 ? Math.round(totalDurationMinutes / totalSessions) : 0,
                    cancellationRate: (totalSessions + cancelledSessions.length) > 0 ? Math.round((cancelledSessions.length / (totalSessions + cancelledSessions.length)) * 100) : 0,
                };
                const volumeByTypeMap = bookingsInPeriod.reduce((acc, b) => {
                    const typeName = b.sessionType?.name || 'Unknown';
                    acc[typeName] = (acc[typeName] || 0) + 1;
                    return acc;
                }, {});
                bookings.volumeByType = Object.entries(volumeByTypeMap).map(([name, count]) => ({ name, count }));
                const hotspotsMap = bookingsInPeriod.reduce((acc, b) => {
                    const day = new Date(b.start).toLocaleDateString('en-US', { weekday: 'long' });
                    acc[day] = (acc[day] || 0) + 1;
                    return acc;
                }, {});
                const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                bookings.bookingHotspots = dayOrder.map(day => ({ day, count: hotspotsMap[day] || 0 }));
                const busiestDayEn = Object.keys(hotspotsMap).length ? Object.entries(hotspotsMap).reduce((a, b) => a[1] > b[1] ? a : b)[0] : 'N/A';
                bookings.kpis.busiestDay = busiestDayEn;
                bookings.sessionsTable = bookingsInPeriod.slice(0, 50).map(b => ({
                    _id: b._id, date: b.start, clientName: `${b.user?.firstName || ''} ${b.user?.lastName || ''}`, sessionType: b.sessionType?.name, status: b.status,
                    duration: Math.round((new Date(b.end) - new Date(b.start)) / 60000),
                    revenue: paymentsInPeriod.find(p => p.booking?.toString() === b._id.toString())?.amount.total || 0
                }));

                // Programs Analytics
                let programs = {};
                const topProgramId = programRevenueData.length > 0 ? [...programRevenueData].sort((a,b) => b.totalRevenue - a.totalRevenue)[0]._id.toString() : null;
                const topProgram = topProgramId ? coachPrograms.find(p => p._id.equals(topProgramId))?.title : 'N/A';
                
                programs.kpis = {
                    totalEnrollments: enrollmentsInPeriod.length,
                    topProgram: parsedProgramIds.length === 1 ? (coachPrograms[0]?.title || 'N/A') : topProgram,
                    avgRating: parsedProgramIds.length === 1 ? (coachPrograms[0]?.averageRating || 0) : coachPrograms.reduce((sum, p) => sum + (p.averageRating || 0), 0) / (coachPrograms.length || 1),
                };
                console.log('[getDashboardOverview] ANALYTICS: Program KPIs calculated.', programs.kpis);

                const enrollmentsPerProgramMap = enrollmentsInPeriod.reduce((acc, e) => {
                    const programIdStr = e.program.toString();
                    acc[programIdStr] = (acc[programIdStr] || 0) + 1;
                    return acc;
                }, {});
                programs.enrollmentsPerProgram = coachPrograms.map(p => ({ name: p.title, enrollments: enrollmentsPerProgramMap[p._id.toString()] || 0 }));

                // Use the reliable revenueMap for the chart
                programs.revenuePerProgram = coachPrograms.map(p => ({ name: p.title, revenue: revenueMap.get(p._id.toString()) || 0 }));
                console.log('[getDashboardOverview] ANALYTICS: Revenue per program for chart calculated.', programs.revenuePerProgram);

                programs.performanceTable = coachPrograms.map(p => ({
                    _id: p._id, title: p.title,
                    enrollments: enrollmentsPerProgramMap[p._id.toString()] || 0,
                    completionRate: 0, // Placeholder, requires more complex aggregation
                    totalRevenue: revenueMap.get(p._id.toString()) || 0,
                    avgRating: p.averageRating || 0,
                }));

                // Clients Analytics (remains the same)
                let clients = {};
                const enrolledClientIds = enrollmentsInPeriod.map(e => e.user);
                const totalClients = parsedProgramIds.length > 0 ? enrolledClientIds.length : allConnections.length;
                const newClientIds = new Set(allConnections.filter(c => c.client && new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate && (parsedProgramIds.length === 0 || enrolledClientIds.some(id => id.equals(c.client._id)))).map(c => c.client._id.toString()));
                const returningClientIds = new Set(bookingsInPeriod.filter(b => b.user && !newClientIds.has(b.user._id.toString()) && (parsedProgramIds.length === 0 || enrolledClientIds.some(id => id.equals(b.user._id)))).map(b => b.user._id.toString()));
                const allTimePayments = await Payment.aggregate([ { $match: { recipient: coachUserId, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount.total' } } } ]);
                clients.kpis = {
                    totalClients,
                    newClients: newClientIds.size,
                    returningClients: returningClientIds.size,
                    estimatedLtv: totalClients > 0 ? (allTimePayments[0]?.total || 0) / totalClients : 0,
                };
                clients.newVsReturning = [ { name: 'New', value: newClientIds.size }, { name: 'Returning', value: returningClientIds.size }];
                const revenuePerClientMap = paymentsInPeriod.reduce((acc, p) => {
                    const clientId = p.payer.toString();
                    acc[clientId] = (acc[clientId] || 0) + p.amount.total;
                    return acc;
                }, {});
                const clientInfoMap = allConnections.reduce((acc, c) => { if(c.client) { acc[c.client._id.toString()] = { name: `${c.client.firstName} ${c.client.lastName}`, email: c.client.email }; } return acc; }, {});
                clients.topClientsByRevenue = Object.entries(revenuePerClientMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([id, revenue]) => ({ name: clientInfoMap[id]?.name || 'Unknown', revenue }));
                const clientBookingsMap = allBookingsForCoach.reduce((acc, b) => {
                    if (b.user) {
                        const clientId = b.user.toString();
                        if (!acc[clientId]) {
                            acc[clientId] = { firstSessionDate: b.start, lastSessionDate: b.start, totalSessions: 0 };
                        }
                        acc[clientId].lastSessionDate = b.start;
                        if (b.status === 'completed') {
                            acc[clientId].totalSessions += 1;
                        }
                    }
                    return acc;
                }, {});
                clients.clientListTable = allConnections.filter(c => c.client).map(c => {
                    const bookingInfo = clientBookingsMap[c.client._id.toString()] || {};
                    return {
                        _id: c.client._id, name: `${c.client.firstName} ${c.client.lastName}`, email: c.client.email,
                        profilePicture: c.client.profilePicture?.url || null, 
                        firstSessionDate: bookingInfo.firstSessionDate,
                        lastSessionDate: bookingInfo.lastSessionDate,
                        totalSessions: bookingInfo.totalSessions || 0,
                        totalSpend: Object.entries(revenuePerClientMap).find(([id]) => id === c.client._id.toString())?.[1] || 0,
                    };
                }).slice(0, 50);

                return { earnings, bookings, programs, clients };
            })()
        ]);

       const preferences = coach.settings?.dashboardPreferences;
       const kpiConfig = coach.settings?.dashboardKpiConfig;
       
       let mergedPreferences = preferences;
       if (mergedPreferences && Array.isArray(mergedPreferences) && kpiConfig && kpiConfig.length > 0) {
         const kpiGridWidgetIndex = mergedPreferences.findIndex(p => p.key === 'kpiGrid');
         if (kpiGridWidgetIndex > -1) {
           const newKpiGridWidget = { ...mergedPreferences[kpiGridWidgetIndex] };
           if (!newKpiGridWidget.settings) {
             newKpiGridWidget.settings = {};
           }
           newKpiGridWidget.settings.kpiConfig = kpiConfig;
           mergedPreferences[kpiGridWidgetIndex] = newKpiGridWidget;
         }
       }

       const finalPayload = {
            kpis: overviewKpis,
            actionCenter: actionCenterData,
            analytics: analyticsData,
            revenueOverTime: analyticsData.earnings.revenueOverTime,
            dashboardPreferences: mergedPreferences,
        };
        console.log('[getDashboardOverview] FINAL PAYLOAD (with merged preferences) being sent to frontend:', { kpiKeys: Object.keys(finalPayload.kpis), actionCenterCount: finalPayload.actionCenter.length, hasPrefs: !!mergedPreferences });

        res.json(finalPayload);
    } catch (error) {
        logger.error('[getDashboardOverview] Error fetching dashboard overview data', {
            error: error.message,
            stack: error.stack,
            userId: req.user._id,
        });
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getCoachClientDetails = async (req, res) => {
    try {
        const coachUserId = new mongoose.Types.ObjectId(req.user._id);
        const clientUserId = new mongoose.Types.ObjectId(req.params.clientId);

        const connection = await Connection.findOne({
            coach: coachUserId,
            client: clientUserId,
            status: 'accepted'
        });

        if (!connection) {
            return res.status(403).json({ message: "No accepted connection found with this client." });
        }

        const [clientUser, bookings, enrollments] = await Promise.all([
            User.findById(clientUserId).select('firstName lastName email profilePicture createdAt').lean(),
            Booking.find({ coach: coachUserId, user: clientUserId })
                .populate('sessionType', 'name')
                .sort({ start: -1 })
                .lean(),
            Enrollment.find({ user: clientUserId })
                .populate({
                    path: 'program',
                    select: 'title coach totalLessons',
                    match: { coach: coachUserId }
                })
                .lean()
        ]);
        
        if (bookings.length > 0) {
            const bookingIds = bookings.map(b => b._id);
            const paymentsForBookings = await Payment.find({ booking: { $in: bookingIds } }).select('booking status').lean();
            const paymentMap = new Map(paymentsForBookings.map(p => [p.booking.toString(), p.status]));

            bookings.forEach(booking => {
                const bookingIdStr = booking._id.toString();
                
                booking.paymentStatus = paymentMap.get(bookingIdStr) || (booking.price?.final?.amount?.amount > 0 ? 'payment_required' : 'not_applicable');

                if (booking.status && typeof booking.status === 'string' && booking.status.includes('reschedule')) {
                    booking.rescheduleStatus = 'pending';
                } else {
                    booking.rescheduleStatus = 'none';
                }
            });
        }
        
        const relevantEnrollments = enrollments.filter(e => e.program);

        relevantEnrollments.forEach(e => {
            const totalLessons = e.program?.totalLessons || 0;
            const completedLessons = e.progress?.completedLessons?.length || 0;
            
            if (!e.progress) {
                e.progress = {};
            }
            e.progress.completionPercentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
        });

        const payments = await Payment.aggregate([
            { $match: { recipient: coachUserId, payer: clientUserId, status: 'completed' } },
            { $group: { _id: null, totalSpend: { $sum: '$amount.total' } } }
        ]);

        const completedSessions = bookings.filter(b => b.status === 'completed');

        res.json({
            client: clientUser,
            kpis: {
                totalSpend: payments[0]?.totalSpend || 0,
                totalSessions: completedSessions.length,
                activeSince: clientUser.createdAt,
            },
            bookingHistory: bookings,
            programEnrollments: relevantEnrollments,
        });

    } catch (error) {
        logger.error('[getCoachClientDetails] Error fetching client details', {
            error: error.message,
            stack: error.stack,
            coachId: req.user._id,
            clientId: req.params.clientId,
        });
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getCoachClientsList = async (req, res) => {
    try {
        const coachUserId = new mongoose.Types.ObjectId(req.user._id);
        const connections = await Connection.find({ coach: coachUserId, status: 'accepted' })
            .populate('client', 'firstName lastName')
            .lean();

        const clients = connections
            .filter(c => c.client)
            .map(c => ({
                _id: c.client._id,
                name: `${c.client.firstName} ${c.client.lastName}`
            }));
            
        res.json(clients);
    } catch (error) {
        logger.error('[getCoachClientsList] Error fetching client list', {
            error: error.message,
            coachId: req.user._id,
        });
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.updateDashboardPreferences = async (req, res) => {
  const { preferences } = req.body;
  const userId = req.user.id;

  if (preferences === null || (Array.isArray(preferences) && preferences.length === 0)) {
     try {
        await Coach.updateOne({ user: userId }, { $unset: { 'settings.dashboardPreferences': "", 'settings.dashboardKpiConfig': "" } });
        return res.json({ success: true, message: 'Dashboard preferences reset successfully.' });
     } catch (error) {
        logger.error('[coachController.updateDashboardPreferences] Error resetting preferences', { error: error.message, userId });
        return res.status(500).json({ success: false, message: 'Server error while resetting preferences.' });
     }
  }

  if (!preferences || !Array.isArray(preferences)) {
    return res.status(400).json({ success: false, message: 'Invalid preference format. "preferences" must be an array.' });
  }

  try {
    const coach = await Coach.findOne({ user: userId });

    if (!coach) {
      return res.status(404).json({ success: false, message: 'Coach profile not found.' });
    }

    const preferencesCopy = JSON.parse(JSON.stringify(preferences));

    const kpiGridWidget = preferencesCopy.find(p => p.key === 'kpiGrid');
    if (kpiGridWidget && kpiGridWidget.settings && kpiGridWidget.settings.kpiConfig) {
      coach.settings.dashboardKpiConfig = kpiGridWidget.settings.kpiConfig;
      delete kpiGridWidget.settings.kpiConfig;
    }

    coach.settings.dashboardPreferences = preferencesCopy;
    await coach.save();

    res.json({
      success: true,
      message: 'Dashboard preferences updated successfully.',
      data: coach.settings.dashboardPreferences,
    });
  } catch (error) {
    logger.error('[coachController.updateDashboardPreferences] Error updating preferences', {
      error: error.message,
      userId,
    });
    res.status(500).json({ success: false, message: 'Server error while updating preferences.' });
  }
};

exports.getTaxInfo = async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.user._id }).select('settings.paymentAndBilling.isVatRegistered settings.paymentAndBilling.vatNumber');
    if (!coach) {
      return res.status(404).json({ msg: 'Coach profile not found.' });
    }
    const paymentAndBilling = coach.settings?.paymentAndBilling || {};
    res.json({
      isVatRegistered: paymentAndBilling.isVatRegistered || false,
      vatNumber: paymentAndBilling.vatNumber || '',
    });
  } catch (err) {
    logger.error(`[getTaxInfo] Error fetching tax info for coach ${req.user._id}`, { error: err.message });
    res.status(500).send('Server Error');
  }
};

exports.updateTaxInfo = async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.user._id });

    if (!coach) {
      return res.status(404).json({ msg: 'Coach profile not found.' });
    }

    const { isVatRegistered, vatNumber } = req.body;

    if (!coach.settings.paymentAndBilling) {
        coach.settings.paymentAndBilling = {};
    }

    coach.settings.paymentAndBilling.isVatRegistered = isVatRegistered;
    coach.settings.paymentAndBilling.vatNumber = vatNumber || null;
    
    coach.markModified('settings.paymentAndBilling');
    await coach.save();

    res.json({
      isVatRegistered: coach.settings.paymentAndBilling.isVatRegistered,
      vatNumber: coach.settings.paymentAndBilling.vatNumber,
    });
  } catch (err) {
    logger.error(`[updateTaxInfo] Error updating tax info for coach ${req.user._id}`, { error: err.message });
    res.status(500).send('Server Error');
  }
};

exports.getFeaturedCoaches = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 4;
    let coachQuery = { featuredCoach: true };
    let userQuery = { role: 'coach' };

    if (req.user && req.user.id) {
      const currentUserId = new mongoose.Types.ObjectId(req.user.id);
      const currentUser = await User.findById(currentUserId).select('blockedUsers.user').lean();
      const usersBlockedByCurrentUser = currentUser?.blockedUsers?.map(b => b.user) || [];

      const usersWhoBlockedCurrentUser = await User.find({ 'blockedUsers.user': currentUserId }).select('_id').lean();
      const userIdsWhoBlockedCurrentUser = usersWhoBlockedCurrentUser.map(u => u._id);
      const allBlockedUserIds = [...new Set([...usersBlockedByCurrentUser, ...userIdsWhoBlockedCurrentUser])];
      
      if (allBlockedUserIds.length > 0) {
        userQuery._id = { $nin: allBlockedUserIds };
      }
    }

    const featuredCoaches = await Coach.find(coachQuery)
      .populate({
        path: 'user',
        match: userQuery,
        select: 'firstName lastName profilePicture status'
      })
      .populate('specialties')
      .limit(limit)
      .lean();
    
    let filteredCoaches = featuredCoaches.filter(coach => coach.user);

    // --- Translation Enrichment ---
    const language = req.user?.preferredLanguage || req.headers['accept-language']?.split(',')[0]?.split(';')[0] || 'en';
    const listTypesForTranslation = ['specialties'];

    const translationKeys = [];
    filteredCoaches.forEach(coach => {
        listTypesForTranslation.forEach(type => {
            if (coach[type] && Array.isArray(coach[type])) {
                coach[type].forEach(item => {
                    if (item && item._id) {
                        translationKeys.push(`${type}_${item._id.toString()}`);
                    }
                });
            }
        });
    });

    const translationMap = new Map();
    if (translationKeys.length > 0) {
        const translations = await Translation.find({
            key: { $in: [...new Set(translationKeys)] },
            [`translations.${language}`]: { $exists: true, $ne: null, $ne: '' }
        }).lean();

        translations.forEach(t => {
            if (t.translations && t.translations[language]) {
                translationMap.set(t.key, t.translations[language]);
            }
        });
    }

    filteredCoaches = filteredCoaches.map(coach => {
        const newCoach = { ...coach };
        listTypesForTranslation.forEach(type => {
            if (newCoach[type] && Array.isArray(newCoach[type])) {
                newCoach[type] = newCoach[type].map(item => {
                    if (item && item._id) {
                        const key = `${type}_${item._id.toString()}`;
                        const translation = translationMap.get(key);
                        return { ...item, translation: translation || null };
                    }
                    return item;
                });
            }
        });
        return newCoach;
    });

     const coachesWithDetails = await Promise.all(filteredCoaches.map(async (coach) => {
        const [priceConfig, reviewStats] = await Promise.all([
            PriceConfiguration.findOne({ user: coach.user._id }).select('minimumHourlyRate liveSessionRate').lean(),
            Review.aggregate([
                { 
                    $match: { 
                        isPrivate: false,
                        $or: [
                            { rateeId: coach.user._id },
                            { ratee: coach.user._id, rateeModel: 'User' }
                        ]
                    } 
                },
                { $group: { _id: null, rating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
            ])
        ]);

        return {
            ...coach,
            minimumHourlyRate: priceConfig?.minimumHourlyRate || null,
            liveSessionRate: priceConfig?.liveSessionRate || null,
            rating: reviewStats[0]?.rating || 0,
            reviewCount: reviewStats[0]?.reviewCount || 0,
        };
    }));

    res.json(coachesWithDetails);
  } catch (error) {
    logger.error('[getFeaturedCoaches] Error fetching featured coaches', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error fetching featured coaches' });
  }
};

exports.getVerificationUploadSignature = (req, res) => {
  try {
    const timestamp = Math.round((new Date()).getTime() / 1000); // THIS LINE FIXES THE BUG
    const folder = `coaches/${req.user.id}/verification`;

    const paramsToSign = {
      timestamp: timestamp,
      upload_preset: 'insurance_verification_docs',
      folder: folder
      // 'resource_type' is INTENTIONALLY omitted from signing
    };

    // --- ADDED LOG ---
    console.log('[getVerificationUploadSignature] Parameters being signed', { paramsToSign });

    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

    res.json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: folder,
      resource_type: 'raw' // Return this for the frontend to build the correct URL
    });
  } catch (error) {
    logger.error('Error generating verification upload signature:', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error generating signature', error: error.message });
  }
};

exports.submitInsuranceVerification = async (req, res) => {
  const { registryName, publicId, filename } = req.body;
  const userId = req.user._id;

  if (!publicId || !filename || !registryName) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  try {
    const coach = await Coach.findOne({ user: userId }).select('settings.insuranceRecognition.registries').lean();
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found.' });
    }

    const registry = coach.settings.insuranceRecognition?.registries?.find(
      reg => reg.name === registryName
    );

    const oldPublicId = registry?.verificationDocument?.publicId;
      if (oldPublicId) {
        assetCleanupService.queueAssetDeletion(oldPublicId, 'raw');
      }

    const updateResult = await Coach.updateOne(
      { 
        user: userId, 
        'settings.insuranceRecognition.registries.name': registryName 
      },
      { 
        $set: {
          'settings.insuranceRecognition.registries.$.status': 'pending_review',
          'settings.insuranceRecognition.registries.$.verificationDocument': {
              publicId: publicId,
              filename: filename,
          },
          'settings.insuranceRecognition.registries.$.submittedAt': new Date(),
          'settings.insuranceRecognition.registries.$.rejectionReasonKey': null,
          'settings.insuranceRecognition.registries.$.adminNotes': null,
        }
      }
    );

    if (updateResult.matchedCount === 0) {
        return res.status(404).json({ message: 'Registry not found for coach.' });
    }

    const updatedCoach = await Coach.findOne({ user: userId }).select('settings.insuranceRecognition').lean();
    res.json(updatedCoach.settings.insuranceRecognition);

  } catch (error) {
    logger.error('[submitInsuranceVerification] Failed to submit document reference', { userId, registryName, error: error.message });
    res.status(500).json({ message: 'Server error while submitting verification.' });
  }
};

exports.getDashboardActionCounts = async (req, res) => {
    try {
        const coachUserId = req.user._id;
        const programs = await Program.find({ coach: coachUserId }).select('_id').lean();
        const programIds = programs.map(p => p._id);

        if (programIds.length === 0) {
            return res.json({ newSubmissionsCount: 0, newQACommentsCount: 0 });
        }

        const newSubmissionsCount = await Enrollment.countDocuments({
            program: { $in: programIds },
            'progress.lessonDetails.submission.isReviewed': false,
            'progress.lessonDetails.submission.submittedAt': { $exists: true }
        });

        const lessons = await Lesson.find({ program: { $in: programIds } }).select('_id').lean();
        const lessonIds = lessons.map(l => l._id);

        const newQACommentsCount = await Comment.countDocuments({
            lesson: { $in: lessonIds },
            readBy: { $ne: coachUserId },
            user: { $ne: coachUserId }
        });

        res.json({ newSubmissionsCount, newQACommentsCount });
    } catch (error) {
        logger.error('[getDashboardActionCounts] Error fetching action counts', { error: error.message, stack: error.stack, userId: req.user._id });
        res.status(500).json({ message: 'Server error while fetching action counts.' });
    }
};

exports.markAllSubmissionsAsReviewed = async (req, res) => {
    try {
        const coachUserId = req.user._id;
        const programs = await Program.find({ coach: coachUserId }).select('_id').lean();
        const programIds = programs.map(p => p._id);

        if (programIds.length === 0) {
            return res.status(200).json({ message: 'No programs found for coach.' });
        }
        
        await Enrollment.updateMany(
            { program: { $in: programIds } },
            { $set: { "progress.lessonDetails.$[elem].submission.isReviewed": true } },
            { arrayFilters: [{ "elem.submission.isReviewed": false }] }
        );

        res.status(200).json({ success: true, message: 'All submissions marked as reviewed.' });
    } catch (error) {
        logger.error('[markAllSubmissionsAsReviewed] Error marking submissions as reviewed', { error: error.message, stack: error.stack, userId: req.user._id });
        res.status(500).json({ message: 'Server error while updating submissions.' });
    }
};

exports.markAllQAAsRead = async (req, res) => {
    try {
        const coachUserId = req.user._id;
        const programs = await Program.find({ coach: coachUserId }).select('_id').lean();
        const programIds = programs.map(p => p._id);

        if (programIds.length === 0) {
            return res.status(200).json({ message: 'No programs found for coach.' });
        }

        const lessons = await Lesson.find({ program: { $in: programIds } }).select('_id').lean();
        const lessonIds = lessons.map(l => l._id);

        await Comment.updateMany(
            { lesson: { $in: lessonIds }, readBy: { $ne: coachUserId } },
            { $addToSet: { readBy: coachUserId } }
        );

        res.status(200).json({ success: true, message: 'All Q&A items marked as read.' });
    } catch (error) {
        logger.error('[markAllQAAsRead] Error marking Q&A as read', { error: error.message, stack: error.stack, userId: req.user._id });
        res.status(500).json({ message: 'Server error while updating Q&A.' });
    }
};

exports.getAllSubmissions = async (req, res) => {
    try {
        const coachUserId = req.user._id;
        console.log(`[getAllSubmissions] Fetching for coachId: ${coachUserId}`);
        const programs = await Program.find({ coach: coachUserId }).select('_id title').lean();
        const programIds = programs.map(p => p._id);
        console.log(`[getAllSubmissions] Found ${programIds.length} programs for coach.`);

        if (programIds.length === 0) {
            return res.json([]);
        }

        const enrollmentsWithSubmissions = await Enrollment.aggregate([
            { $match: { program: { $in: programIds } } },
            { $unwind: "$progress.lessonDetails" },
            { $match: { 
                "progress.lessonDetails.submission.submittedAt": { $exists: true }
            }},
            { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userData' } },
            { $lookup: { from: 'lessons', localField: 'progress.lessonDetails.lesson', foreignField: '_id', as: 'lessonData' } },
            { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
            { $sort: { "progress.lessonDetails.submission.submittedAt": -1 } },
            {
                $group: {
                    _id: "$program",
                    submissions: {
                       $push: {
                            enrollmentId: "$_id",
                            user: {
                                _id: "$userData._id",
                                firstName: "$userData.firstName",
                                lastName: "$userData.lastName",
                                email: "$userData.email",
                                profilePicture: "$userData.profilePicture"
                            },
                            lessonId: "$lessonData._id",
                            lessonTitle: "$lessonData.title",
                            submittedAt: "$progress.lessonDetails.submission.submittedAt",
                            submission: "$progress.lessonDetails.submission",
                            isReviewed: { $ifNull: ["$progress.lessonDetails.submission.isReviewed", false] }
                        }
                    }
                }
            },
            { $lookup: { from: 'programs', localField: '_id', foreignField: '_id', as: 'programData' } },
            { $unwind: "$programData" },
            {
                $project: {
                    _id: 0,
                    programId: "$_id",
                    programTitle: "$programData.title",
                    items: "$submissions"
                }
            }
        ]);

        console.log(`[getAllSubmissions] Aggregation result count: ${enrollmentsWithSubmissions.length}`);
        res.json(enrollmentsWithSubmissions);
    } catch (error) {
        logger.error('[getAllSubmissions] Error fetching all submissions', { error: error.message, stack: error.stack, userId: req.user._id });
        res.status(500).json({ message: 'Server error while fetching submissions.' });
    }
};

exports.getAllQA = async (req, res) => {
    try {
        const coachUserId = req.user._id;
        console.log(`[getAllQA] Fetching for coachId: ${coachUserId}`);
        const programs = await Program.find({ coach: coachUserId }).select('_id').lean();
        const programIds = programs.map(p => p._id);
        console.log(`[getAllQA] Found ${programIds.length} programs for coach.`);
        
        if (programIds.length === 0) return res.json([]);
        
        const lessons = await Lesson.find({ program: { $in: programIds } }).select('_id').lean();
        const lessonIds = lessons.map(l => l._id);

        const unreadComments = await Comment.aggregate([
            { $match: { lesson: { $in: lessonIds }, readBy: { $ne: coachUserId }, user: { $ne: coachUserId } } },
            { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userData' }},
            { $lookup: { from: 'lessons', localField: 'lesson', foreignField: '_id', as: 'lessonData' }},
            { $unwind: "$userData" },
            { $unwind: "$lessonData" },
            { $lookup: { from: 'programs', localField: 'lessonData.program', foreignField: '_id', as: 'programData' }},
            { $unwind: "$programData" },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$programData._id",
                    programTitle: { $first: "$programData.title" },
                    items: {
                        $push: {
                           _id: "$_id",
                           content: "$content",
                           createdAt: "$createdAt",
                           lessonId: "$lessonData._id",
                           lessonTitle: "$lessonData.title",
                           user: {
                               _id: "$userData._id",
                               firstName: "$userData.firstName",
                               lastName: "$userData.lastName",
                               profilePicture: "$userData.profilePicture"
                           }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    programId: "$_id",
                    programTitle: "$programTitle",
                    items: "$items"
                }
            }
        ]);

        console.log(`[getAllQA] Aggregation result count: ${unreadComments.length}`);
        res.json(unreadComments);
    } catch (error) {
        logger.error('[getAllQA] Error fetching all Q&A', { error: error.message, stack: error.stack, userId: req.user._id });
        res.status(500).json({ message: 'Server error while fetching Q&A.' });
    }
};

exports.getAllParticipants = async (req, res) => {
    try {
        const coachUserId = req.user._id;
        console.log(`[getAllParticipants] Fetching for coachId: ${coachUserId}`);
        const programs = await Program.find({ coach: coachUserId }).select('_id title').lean();
        const programIds = programs.map(p => p._id);
        console.log(`[getAllParticipants] Found ${programIds.length} programs for coach.`);

        if (programIds.length === 0) {
            return res.json([]);
        }

        const enrollments = await Enrollment.aggregate([
            { $match: { program: { $in: programIds } } },
            { $sort: { createdAt: -1 } },
            { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userData' } },
            { $unwind: '$userData' },
            { 
                $group: {
                    _id: '$program',
                    items: {
                        $push: {
                            _id: '$_id',
                            user: '$userData',
                            createdAt: '$createdAt',
                            progress: '$progress'
                        }
                    }
                }
            },
            { $lookup: { from: 'programs', localField: '_id', foreignField: '_id', as: 'programData' } },
            { $unwind: '$programData' },
            {
                $project: {
                    _id: 0,
                    programId: '$_id',
                    programTitle: '$programData.title',
                    items: '$items'
                }
            }
        ]);
        
        console.log(`[getAllParticipants] Aggregation result count: ${enrollments.length}`);
        res.json(enrollments);
    } catch (error) {
        logger.error('[getAllParticipants] Error fetching all participants', { error: error.message, stack: error.stack, userId: req.user._id });
        res.status(500).json({ message: 'Server error while fetching participants.' });
    }
};

module.exports = {
  registerCoach: exports.registerCoach,
  removeProfilePicture: exports.removeProfilePicture,
  getCoachProfile: exports.getCoachProfile,
  submitReview: exports.submitReview,
  updateCoachProfile: exports.updateCoachProfile,
  getAllCoaches: exports.getAllCoaches,
  updateAvailability: exports.updateAvailability,
  uploadProfilePicture: exports.uploadProfilePicture,
  getCoachBookings: exports.getCoachBookings,
  updateBookingStatus: exports.updateBookingStatus,
  uploadVideoIntroduction: exports.uploadVideoIntroduction,
  deleteVideoIntroduction: exports.deleteVideoIntroduction,
  searchListItems: exports.searchListItems,
  updateCoachProfileItems: exports.updateCoachProfileItems,
  getProfilePictureSignature: exports.getProfilePictureSignature,
  getSessionTypes: exports.getSessionTypes,
  updateSessionType: exports.updateSessionType,
  updateSessionTypes: exports.updateSessionTypes,
  updateAllSessionTypes: exports.updateAllSessionTypes,
  deleteSessionType: exports.deleteSessionType,
  getCoachSettings: exports.getCoachSettings,
  updateCoachSettings: exports.updateCoachSettings,
  createSession: exports.createSession,
  getCoaches: exports.getCoaches,
  getCoachReviews: exports.getCoachReviews,
  getCoachAvailability: exports.getCoachAvailability,
  getSignature: exports.getSignature,
  createSessionType: exports.createSessionType,
  getDashboardStats: exports.getDashboardStats,
  getProgramAnalytics: exports.getProgramAnalytics,
  removeCoachProfilePicture: exports.removeCoachProfilePicture,
  uploadCoachProfilePicture: exports.uploadCoachProfilePicture,
  getCoachProfilePictureSignature: exports.getCoachProfilePictureSignature,
  getDashboardOverview: exports.getDashboardOverview,
  getCoachClientDetails: exports.getCoachClientDetails,
  getCoachClientsList: exports.getCoachClientsList,
  updateDashboardPreferences: exports.updateDashboardPreferences,
  getTaxInfo: exports.getTaxInfo,
  updateTaxInfo: exports.updateTaxInfo,
  getFeaturedCoaches: exports.getFeaturedCoaches,
  getInsuranceRegistries: exports.getInsuranceRegistries,
  submitInsuranceVerification: exports.submitInsuranceVerification,
  getVerificationUploadSignature:exports.getVerificationUploadSignature,
  getVideoIntroductionSignature: exports.getVideoIntroductionSignature,
  getDashboardActionCounts: exports.getDashboardActionCounts,
  markAllSubmissionsAsReviewed: exports.markAllSubmissionsAsReviewed,
  markAllQAAsRead: exports.markAllQAAsRead,
  getAllSubmissions: exports.getAllSubmissions,
  getAllQA: exports.getAllQA,
  getAllParticipants: exports.getAllParticipants,
};