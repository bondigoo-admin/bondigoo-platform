const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const userController = require('../controllers/userController');
const resourceController = require('../controllers/resourceController');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { logger } = require('../utils/logger');

console.log('[userRoutes.js] The user routes file is being executed.');

router.post('/register', [
  check('firstName', 'First name is required').not().isEmpty(),
  check('lastName', 'Last name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
  check('termsAccepted').custom((value) => {
    if (value !== true) {
      throw new Error('You must accept the Terms of Service to register.');
    }
    return true;
  }),
], (req, res, next) => {
    console.log(`[userRoutes.js] >>>>> HIT: POST /register route handler at ${new Date().toISOString()}`);
    next();
}, userController.registerUser);

router.get('/search-messaging', auth, userController.searchUsersForMessaging);

router.post('/book', auth, userController.bookSession);
router.get('/bookings', auth, userController.getUserBookings);
router.post('/review', auth, userController.addReview);
router.get('/reviews/:coachId', userController.getCoachReviews);
router.get('/:id/bookings', auth, userController.getUserBookings);
router.get('/search', auth, userController.searchUsers);
router.get('/:id/profile', auth, userController.getUserProfile);
router.put('/profile', auth, userController.updateUserProfile);
router.patch('/me/onboarding', auth, userController.updateUserOnboarding);
router.patch('/me/onboarding-step', auth, userController.updateOnboardingStep);
router.get('/search/coaches', auth, userController.searchCoaches);
router.post('/logout', auth, userController.logout);
router.get('/backgrounds', auth, (req, res, next) => {
  logger.info('[userRoutes] GET /backgrounds hit', { userId: req.user._id });
  next();
}, resourceController.getUserBackgrounds);
router.post('/background', auth, (req, res, next) => {
  logger.info('[userRoutes] POST /background hit', { userId: req.user._id, hasFile: !!req.files });
  next();
}, resourceController.uploadUserBackground);
router.delete('/background', auth, resourceController.deleteUserBackground);

// @route   POST api/users/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], userController.login);

// @route   GET api/users/details
// @desc    Get detailed user information for settings page
// @access  Private
router.get('/details', auth, userController.getUserDetails);

// @route   PUT api/users/details
// @desc    Update user profile and settings information
// @access  Private
router.put('/details', auth, userController.updateUserDetails);

// @route   PUT api/users/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', auth, userController.changePassword);

// @route   POST api/users/request-email-change
// @desc    Request to change user's email address
// @access  Private
router.post('/request-email-change', auth, userController.requestEmailChange);

// @route   POST api/users/verify-email-change
// @desc    Verify the new email address with a token
// @access  Public
router.post('/verify-email-change', userController.verifyEmailChange);

// @route   GET api/users/payment-methods
// @desc    Get user's saved payment methods
// @access  Private
router.get('/payment-methods', auth, userController.getPaymentMethods);

// @route   POST api/users/payment-methods/default
// @desc    Set a default payment method
// @access  Private
router.post('/payment-methods/default', auth, userController.setDefaultPaymentMethod);

// @route   DELETE api/users/payment-methods/:methodId
// @desc    Delete a saved payment method
// @access  Private
router.delete('/payment-methods/:methodId', auth, userController.deletePaymentMethod);

// @route   POST api/users/request-password-reset
// @desc    Request a password reset email
// @access  Public
router.post('/request-password-reset', userController.requestPasswordReset);

// @route   GET api/users/verify-password-reset-token/:token
// @desc    Verify a password reset token from the email link
// @access  Public
router.get('/verify-password-reset-token/:token', userController.verifyPasswordResetToken);

// @route   POST api/users/reset-password
// @desc    Reset the password using a valid token
// @access  Public
router.post('/reset-password', userController.resetPassword);

// @route   GET api/users/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, userController.getCurrentUser);

router.get('/dashboard_overview', auth, userController.getUserDashboardOverview);

router.patch('/dashboard-preferences', auth, userController.updateDashboardPreferences);

router.post('/upload-profile-picture', auth, userController.uploadProfilePicture);
router.get('/user-status/:email', auth, userController.getUserStatus);
router.post('/update-status', auth, userController.updateUserStatus);
router.put('/profile-picture', auth, userController.updateUserProfilePicture);
router.get('/:id/settings', auth, userController.getUserSettings);
router.put('/:id/settings', auth, userController.updateUserSettings);
router.put('/status', auth, userController.updateUserStatus);
router.get('/get-profile-picture-signature', auth, userController.getProfilePictureSignature);
router.delete('/remove-profile-picture', auth, userController.removeProfilePicture);

router.post('/:userId/block', auth, userController.blockUser);
router.delete('/:userId/block', auth, userController.unblockUser);
router.get('/me/blocked', auth, userController.getBlockedUsers);
router.post('/flags', auth, userController.flagEntity);

router.post('/:userId/report', auth, userController.reportUser);

module.exports = router;