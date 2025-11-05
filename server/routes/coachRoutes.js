const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const coachController = require('../controllers/coachController');
const checkRole = require('../middleware/checkRole');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const cloudinary = require('../utils/cloudinaryConfig');
const { auth, isCoach } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth'); 
const { logger } = require('../utils/logger');
const SessionType = require('../models/SessionType');
const Coach = require('../models/Coach');
const { validateCoachTaxInfo } = require('../middleware/validators');
const searchController = require('../controllers/searchController');

// Video storage configuration
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'coach_introductions',
    allowed_formats: ['mp4', 'mov', 'avi', 'webm'],
    resource_type: 'video'
  },
});

// Image storage configuration
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'coach_profile_pictures',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 500, height: 500, crop: "limit" }]
  },
});

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'));
    }
  }
});

const uploadVideo = multer({ storage: videoStorage });
const uploadImage = multer({ storage: imageStorage });

router.get('/get-signature', auth, coachController.getSignature);

router.post('/upload-video-introduction', auth, uploadVideo.single('video'), coachController.uploadVideoIntroduction);
router.delete('/me/video-introduction', [auth, isCoach], coachController.deleteVideoIntroduction);
router.get('/:userId/availability', optionalAuth, coachController.getCoachAvailability);
router.put(
  '/:userId/availability',
  [
    auth,
    isCoach,
    [
      check('availability').isArray(),
      check('settings').optional().isObject(),
    ],
  ],
  coachController.updateAvailability
);

router.get('/check/:userId', async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.params.userId });
    if (coach) {
      res.json({ message: 'Coach found', coachId: coach._id, userId: coach.user });
    } else {
      res.status(404).json({ message: 'Coach not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/', optionalAuth, searchController.searchCoaches);

router.get('/featured', optionalAuth, coachController.getFeaturedCoaches);

router.get('/insurance-registries', coachController.getInsuranceRegistries);

router.get('/me/insurance-recognition/signature', auth, coachController.getVerificationUploadSignature);
router.post('/me/insurance-recognition/submit', auth, coachController.submitInsuranceVerification);

router.get('/session-types', coachController.getSessionTypes);

router.get('/:userId/session-types', async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.params.userId });
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }
    const sessionTypes = await SessionType.find({ coach: coach._id });
    res.json(sessionTypes);
  } catch (error) {
    console.error('Error fetching session types:', error);
    res.status(500).json({ message: 'Error fetching session types' });
  }
});

router.post(
  '/:userId/session-types',
  [
    auth,
    isCoach,
    [
      check('name').notEmpty(),
      check('duration').isInt({ min: 1 }),
      check('price').isFloat({ min: 0 }),
    ],
  ],
  coachController.createSessionType
);

router.put(
  '/:userId/session-types/:typeId',
  [
    auth,
    isCoach,
    [
      check('name').notEmpty(),
      check('duration').isInt({ min: 1 }),
      check('price').isFloat({ min: 0 }),
    ],
  ],
  coachController.updateSessionType
);

router.put(
  '/:userId/session-types',
  [
    auth,
    isCoach,
    [
      check('sessionTypes').isArray(),
      check('sessionTypes.*.name').notEmpty(),
      check('sessionTypes.*.duration').isInt({ min: 1 }),
      check('sessionTypes.*.price').isFloat({ min: 0 }),
    ],
  ],
  coachController.updateAllSessionTypes
);

router.delete(
  '/:userId/session-types/:typeId',
  [auth, isCoach],
  coachController.deleteSessionType
);

router.post(
  '/:userId/sessions',
  [
    auth,
    isCoach,
    [
      check('type').notEmpty(),
      check('start').isISO8601(),
      check('end').isISO8601(),
      // Add more validation as needed
    ],
  ],
  coachController.createSession
);

router.get('/:userId/get-profile-picture-signature', auth, coachController.getCoachProfilePictureSignature);
router.post('/:userId/upload-profile-picture', auth, coachController.uploadCoachProfilePicture);
router.delete('/:userId/remove-profile-picture', auth, coachController.removeCoachProfilePicture);
router.post('/me/video-introduction/signature', [auth, isCoach], coachController.getVideoIntroductionSignature);

router.post(
  '/register',
  [
    check('firstName', 'First name is required').not().isEmpty(),
    check('lastName', 'Last name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('preferredLanguage', 'Preferred language is required').not().isEmpty(),
    check('termsAccepted').custom((value) => {
        if (value !== true) {
          throw new Error('You must accept the Terms of Service to register.');
        }
        return true;
    }),
  ],
  coachController.registerCoach
);

router.get('/:userId/reviews', auth, coachController.getCoachReviews);
router.get('/profile/:userId', optionalAuth, coachController.getCoachProfile);
router.post('/review', auth, coachController.submitReview);

router.get('/:userId/bookings', auth, coachController.getCoachBookings);
router.put('/bookings/:bookingId', auth, isCoach, coachController.updateBookingStatus);

router.put(
  '/profile/:userId',
  [
    auth,
    isCoach,
    [
      check('firstName', 'First name is required').optional().notEmpty(),
      check('lastName', 'Last name is required').optional().notEmpty(),
      check('specialties', 'Specialties field is required').optional().isArray(),
      check('bio', 'Bio is required').optional().notEmpty(),
      check('rates', 'Rates must be an array').optional().isArray(),
      check('languages', 'Languages must be an array').optional().isArray(),
    ]
  ],
  coachController.updateCoachProfile
);

router.get('/check-settings/:userId', optionalAuth, async (req, res) => {
  try {
    const coach = await Coach.findOne({ user: req.params.userId });
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }
    if (!coach.settings) {
      return res.status(404).json({ message: 'Coach settings not found' });
    }
    res.json({ message: 'Coach settings found', settingsExist: true });
  } catch (error) {
    console.error('Error checking coach settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/settings/:userId', optionalAuth, async (req, res) => {
  try {
    console.log(`[coachRoutes] Fetching settings for user ID: ${req.params.userId}`);
    const coach = await Coach.findOne({ user: req.params.userId });
    if (!coach) {
      console.log(`[coachRoutes] Coach not found for user ID: ${req.params.userId}`);
      return res.status(404).json({ message: 'Coach not found' });
    }
    if (!coach.settings) {
      console.log(`[coachRoutes] Settings not found for coach ID: ${coach._id}`);
      return res.status(404).json({ message: 'Coach settings not found' });
    }
    console.log(`[coachRoutes] Settings found for coach ID: ${coach._id}`);
    res.json(coach.settings);
  } catch (error) {
    console.error('[coachRoutes] Error fetching coach settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/settings/:userId', auth, isCoach, coachController.updateCoachSettings);

router.get('/search-list-items', optionalAuth, coachController.searchListItems);
router.put('/update-profile-items', [
  auth,
  isCoach,
  check('type').isString().notEmpty(),
  check('items').isArray(),
], coachController.updateCoachProfileItems);

router.get('/dashboard/overview', [auth, isCoach], coachController.getDashboardOverview);
router.patch('/dashboard-preferences', [auth, isCoach], coachController.updateDashboardPreferences);
router.get('/dashboard-stats', [auth, isCoach], coachController.getDashboardStats);
router.get('/program-analytics', [auth, isCoach], coachController.getProgramAnalytics);
router.get('/clients/:clientId', [auth, isCoach], coachController.getCoachClientDetails);

router.get('/dashboard/action-counts', [auth, isCoach], coachController.getDashboardActionCounts);
router.post('/submissions/mark-all-reviewed', [auth, isCoach], coachController.markAllSubmissionsAsReviewed);
router.post('/qa/mark-all-read', [auth, isCoach], coachController.markAllQAAsRead);
router.get('/all-submissions', [auth, isCoach], coachController.getAllSubmissions);
router.get('/all-qa', [auth, isCoach], coachController.getAllQA);
router.get('/all-participants', [auth, isCoach], coachController.getAllParticipants);

router.get(
  '/me/tax-info',
  auth,
  isCoach,
  coachController.getTaxInfo
);

router.put(
  '/me/tax-info',
  auth,
  isCoach,
  coachController.updateTaxInfo
);


console.log('Coach routes initialized:', router.stack.map(r => r.route?.path).filter(Boolean));

module.exports = router;