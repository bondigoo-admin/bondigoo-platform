const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const priceController = require('../controllers/priceController');
const { auth, isCoach } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { logger } = require('../utils/logger');

// Global route logging middleware
router.use((req, res, next) => {
  logger.debug('[priceRoutes] Route accessed:', {
    method: req.method,
    url: req.originalUrl,
    userId: req.user?._id
  });
  next();
});

// Base routes
router.get('/config/rates', auth, priceController.getPricingRates);
router.get('/config/:userId', optionalAuth, priceController.getCoachPriceConfiguration);

// Base rate updates
router.patch('/config/:userId/base-rate', [
  auth,
  isCoach,
  check('baseRate.amount').isFloat({ min: 0 }),
  check('baseRate.currency').isIn(['CHF', 'EUR', 'USD']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], priceController.updateBaseRate);

router.patch('/config/:userId/live-session-rate', [
  auth,
  isCoach,
  check('rate.amount').isFloat({ min: 0 }),
  check('rate.currency').isIn(['CHF', 'EUR', 'USD']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], priceController.updateLiveSessionRate);

// Session type rates
router.patch('/config/:userId/session-type/:typeId', [
  auth,
  isCoach,
  check('rate.amount').isFloat({ min: 0 }),
  check('rate.currency').isIn(['CHF', 'EUR', 'USD']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], priceController.updateSessionTypeRate);

router.delete('/config/:userId/session-type/:typeId', [
  auth,
  isCoach
], priceController.removeSessionTypeRate);

router.post('/calculate', [
  auth,
  check('userId').isMongoId(),
  check('sessionTypeId').optional().isMongoId(),
  check('programId').optional().isMongoId(),
  check('sessionTypeId').custom((value, { req }) => {
    if (!value && !req.body.programId) {
      throw new Error('Either sessionTypeId or programId must be provided');
    }
    return true;
  }),
  check('start').isISO8601().withMessage('Invalid start time format'),
  check('end').isISO8601().withMessage('Invalid end time format'),
  check('timezone')
    .optional()
    .isString()
    .matches(/^[A-Za-z]+\/[A-Za-z_]+$/)
    .withMessage('Invalid timezone format'),
  check('participantCount')
    .optional()
    .isInt({ min: 1 })
    .toInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('[priceRoutes] Price calculation validation failed:', {
        errors: errors.array(),
        body: req.body
      });
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], priceController.calculateSessionPrice);

router.post('/calculate-for-display', [
  auth,
  check('price').isFloat({ min: 0 }),
  check('currency').isString(),
  check('userId').isMongoId(),
  check('sessionTypeId').isMongoId(),
], priceController.calculateForDisplay);

router.post('/calculate-program', [
  auth,
  check('programId').isMongoId(),
  check('discountCode').optional().isString().trim(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], priceController.calculateProgramPrice);

router.post('/calculate-webinar', [
  auth,
  check('webinarBookingId').isMongoId().withMessage('A valid webinar booking ID is required.'),
  check('discountCode').optional().isString().trim(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
], priceController.calculateWebinarPrice);

// Time-based rates
router.post('/config/:userId/time-based', auth, isCoach, priceController.addTimeBasedRate);
router.patch('/config/:userId/time-based/:rateId', auth, isCoach, priceController.updateTimeBasedRate);
router.delete('/config/:userId/time-based/:rateId', auth, isCoach, priceController.removeTimeBasedRate);

// Special periods
router.post('/config/:userId/special-period', auth, isCoach, priceController.addSpecialPeriod);
router.patch('/config/:userId/special-period/:periodId', auth, isCoach, priceController.updateSpecialPeriod);
router.delete('/config/:userId/special-period/:periodId', auth, isCoach, priceController.removeSpecialPeriod);

// Generic error handler
router.use((err, req, res, next) => {
  if (err.type === 'PriceCalculationError') {
    logger.error('[priceRoutes] Price calculation error:', {
      error: err.message,
      code: err.code,
      details: err.details
    });
    return res.status(400).json({
      success: false,
      error: err.message,
      details: err.details
    });
  }
  next(err);
});

module.exports = router;