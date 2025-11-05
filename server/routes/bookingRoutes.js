const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { auth, isCoach } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');

const validateSuggestedTimes = [
  check('times')
    .isArray()
    .withMessage('Times must be an array')
    .custom((times) => {
      if (!times.every(time => 
        time.start && time.end && 
        new Date(time.start).getTime() < new Date(time.end).getTime()
      )) {
        throw new Error('Each time suggestion must have valid start and end times');
      }
      return true;
    }),
  check('message').optional().isString(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

router.get('/:bookingId/summary', auth, bookingController.getBookingSummary);

router.get('/:userId/bookings', optionalAuth, [
  check('start', 'Start date is required').isISO8601(),
  check('end', 'End date is required').isISO8601(),
], bookingController.getCoachBookings);

router.get('/upcoming/:userId', auth, bookingController.getUpcomingBookings);
router.get('/:bookingId', optionalAuth, bookingController.getBooking);

router.post(
  '/',
  [
    auth,
    [
      check('userId', 'User ID is required').not().isEmpty(),
      check('sessionTypeId', 'Session type ID is required').optional(),
      check('sessionTypeName', 'Session type name is required').optional(),
      check('start', 'Start time is required').isISO8601(),
      check('end', 'End time is required').isISO8601(),
      check('sessionTypeId', 'Either session type ID or name is required').custom((value, { req }) => {
        if (!value && !req.body.sessionTypeName) {
          throw new Error('Either session type ID or name is required');
        }
        return true;
      }),
    ],
  ],
  bookingController.createBooking
);

router.get('/', auth, bookingController.getBookings);
router.get(
  '/user/:userId/sessions',
  [
    auth,
    check('userId', 'User ID is required').notEmpty(),
    check('start', 'Start date must be ISO date').optional().isISO8601(),
    check('end', 'End date must be ISO date').optional().isISO8601(),
  ],
  bookingController.getUserSessions
);

router.put(
  '/:bookingId/status',
  [
    auth,
    check('status', 'Status is required').isIn(['pending', 'confirmed', 'cancelled']),
  ],
  bookingController.updateBookingStatus
);

router.post(
  '/sessions',
  [
    auth,
    [
      check('userId', 'User ID is required').not().isEmpty(),
      check('type', 'Session type is required').not().isEmpty(),
      check('start', 'Start time is required').isISO8601(),
      check('end', 'End time is required').isISO8601(),
    ],
  ],
  bookingController.createSession
);

router.put(
  '/sessions/:sessionId',
  [
    auth,
    [
      check('type', 'Session type is required').not().isEmpty(),
      check('start', 'Start time is required').isISO8601(),
      check('end', 'End time is required').isISO8601(),
    ],
  ],
  bookingController.updateSession
);

router.put(  '/:bookingId',   auth,   bookingController.updateBooking );

router.get('/public-summary/:bookingId', auth, bookingController.getBooking);

router.delete('/:bookingId', auth, bookingController.deleteBooking);

router.use((req, res, next) => {
  console.log(`[bookingRoutes] ${req.method} ${req.originalUrl}`);
  next();
});

router.post(
  '/availability',
  [
    auth,
    isCoach,
    [
      check('start', 'Start time is required').isISO8601(),
      check('end', 'End time is required').isISO8601(),
      check('title', 'Title is required').not().isEmpty(),
      check('recurringPattern', 'Invalid recurring pattern').isIn(['none', 'daily', 'weekly', 'biweekly', 'monthly']),
      check('availableForInstantBooking', 'Available for instant booking must be a boolean').isBoolean(),
      check('recurringEndDate', 'Recurring end date is required for recurring patterns').custom((value, { req }) => {
        if (req.body.recurringPattern !== 'none' && !value) {
          throw new Error('Recurring end date is required for recurring patterns');
        }
        return true;
      }),
    ],
  ],
  bookingController.createAvailability
);

router.put(
  '/availability/:availabilityId',
  [
    auth,
    isCoach,
    [
      check('start', 'Start time is required').isISO8601(),
      check('end', 'End time is required').isISO8601(),
      check('title', 'Title is required').not().isEmpty(),
    ],
  ],
  bookingController.updateAvailability
);

router.delete('/availability/:availabilityId', [auth, isCoach], bookingController.deleteAvailability);
router.post(
  '/:bookingId/decline',
  [
    auth,
    [
      check('bookingId', 'Booking ID is required').not().isEmpty(),
    ],
  ],
  bookingController.declineBooking
);

router.post(
  '/:bookingId/accept',
  [
    auth,
    [
      check('bookingId', 'Booking ID is required').not().isEmpty(),
    ],
  ],
  bookingController.acceptBooking
);

router.post(
  '/:bookingId/suggest',
  [
    auth,
    check('bookingId', 'Booking ID is required').not().isEmpty(),
    validateSuggestedTimes
  ],
  bookingController.suggestAlternativeTime
);

router.get('/:bookingId/overtime', auth, bookingController.getBookingOvertimeSettings);
router.put('/:bookingId/overtime', auth, isCoach, bookingController.updateBookingOvertimeSettings);
router.post('/:bookingId/register', auth, bookingController.registerForWebinar);

router.get(
  '/:bookingId/calculate-cancellation-details',
  auth,
  bookingController.calculateCancellationDetails
);


router.post(
  '/:bookingId/cancel-by-client',
  auth,
  [
    check('cancellationReason').optional().isString().trim().escape()
  ],
  bookingController.cancelBookingByClient
);

router.post(
  '/:bookingId/cancel-by-coach',
  auth,
  isCoach, // Ensure only a coach can call this
  [
    check('cancellationReason').optional().isString().trim().escape()
  ],
  bookingController.cancelBookingByCoach
);

router.post(
  '/:bookingId/check-reschedule-eligibility',
  auth,
  bookingController.checkRescheduleEligibility
);

router.post(
  '/:bookingId/request-reschedule-by-client',
  auth,
  [
    check('bookingId').isMongoId(),
    check('proposedSlots').isArray({ min: 1 }).withMessage('At least one proposed slot is required.'),
    check('proposedSlots.*.start').isISO8601().toDate().withMessage('Invalid start date format for proposed slot.'),
    check('proposedSlots.*.end').isISO8601().toDate().withMessage('Invalid end date format for proposed slot.')
      .custom((value, { req, path }) => {
        const index = parseInt(path.match(/\[(\d+)\]/)[1]);
        if (new Date(value) <= new Date(req.body.proposedSlots[index].start)) {
          throw new Error('Proposed end time must be after start time.');
        }
        return true;
      }),
    check('requestMessage').optional().isString().trim().escape()
  ],
  bookingController.requestRescheduleByClient
);

router.post(
  '/:bookingId/reschedule-response-by-coach',
  auth,
  isCoach,
  [
    check('requestId').isMongoId().withMessage('Valid reschedule request ID is required.'),
    check('action').isIn(['approve', 'decline', 'counter_propose']).withMessage('Invalid action.'),
    check('selectedTime.start').if(check('action').equals('approve')).isISO8601().toDate().withMessage('Valid start time required for approval.'),
    check('selectedTime.end').if(check('action').equals('approve')).isISO8601().toDate().withMessage('Valid end time required for approval.'),
    check('coachProposedTimes').if(check('action').equals('counter_propose')).isArray({ min: 1 }).withMessage('At least one proposed slot required for counter-proposal.'),
    check('coachProposedTimes.*.start').if(check('action').equals('counter_propose')).isISO8601().toDate(),
    check('coachProposedTimes.*.end').if(check('action').equals('counter_propose')).isISO8601().toDate(),
    check('coachMessage').optional().isString().trim().escape()
  ],
  bookingController.respondToRescheduleRequestByCoach
);

router.post(
  '/:bookingId/propose-reschedule-by-coach',
  auth,
  isCoach,
  [
    check('proposedSlots').isArray({ min: 1 }).withMessage('At least one proposed slot is required.'),
    check('proposedSlots.*.start').isISO8601().toDate(),
    check('proposedSlots.*.end').isISO8601().toDate(),
    check('reason').optional().isString().trim().escape()
  ],
  bookingController.proposeRescheduleByCoach
);

router.post(
  '/:bookingId/reschedule-webinar-by-coach',
  auth,
  isCoach,
  [
    check('newPrimaryStartTime').isISO8601().toDate().withMessage('New primary start time is required.'),
    check('newPrimaryEndTime').isISO8601().toDate().withMessage('New primary end time is required.'),
    check('newWebinarSlots').optional().isArray().withMessage('New webinar slots must be an array if provided.'),
    check('newWebinarSlots.*.startTime').optional().isISO8601().toDate(),
    check('newWebinarSlots.*.endTime').optional().isISO8601().toDate(),
    check('reason').optional().isString().trim().escape()
  ],
  bookingController.rescheduleWebinarByCoach
);

router.post(
  '/:bookingId/attendee-webinar-reschedule-response',
  auth, // Authenticated user (attendee)
  [
    check('response').isIn(['confirm', 'decline']).withMessage("Response must be 'confirm' or 'decline'.")
  ],
  bookingController.respondToWebinarRescheduleByAttendee
);

router.post(
  '/:bookingId/webinar/unregister', // Or a similar descriptive path
  auth, // Assuming standard authentication middleware
  [
    check('cancellationReason').optional().isString().trim().escape()
  ],
  bookingController.cancelWebinarRegistrationByClient
);

router.post(
  '/:bookingId/client-reschedule-response',
  auth,
  [
    check('bookingId').isMongoId(),
    check('requestId').isMongoId().withMessage('Valid reschedule request ID is required.'),
    check('action').isIn(['approve', 'decline', 'counter_propose']).withMessage("Action must be 'approve', 'decline', or 'counter_propose'."),
    check('selectedTime.start').if(check('action').equals('approve')).isISO8601().toDate().withMessage('Valid start time required for approval.'),
    check('selectedTime.end').if(check('action').equals('approve')).isISO8601().toDate().withMessage('Valid end time required for approval.')
      .custom((value, { req }) => {
        if (req.body.action === 'approve' && new Date(value) <= new Date(req.body.selectedTime.start)) {
          throw new Error('Selected end time must be after start time.');
        }
        return true;
      }),
    check('proposedSlots').if(check('action').equals('counter_propose')).isArray({ min: 1 }).withMessage('At least one proposed slot required for counter-proposal.'),
    check('proposedSlots.*.start').if(check('action').equals('counter_propose')).isISO8601().toDate(),
    check('proposedSlots.*.end').if(check('action').equals('counter_propose')).isISO8601().toDate()
      .custom((value, { req, path }) => {
          if (req.body.action === 'counter_propose') {
            const index = parseInt(path.match(/\[(\d+)\]/)[1]);
            if (new Date(value) <= new Date(req.body.proposedSlots[index].start)) {
                 throw new Error('Proposed end time must be after start time for counter-proposal slot.');
            }
          }
        return true;
      }),
    check('clientMessage').optional().isString().trim().escape()
  ],
  bookingController.respondToCoachRescheduleProposalByClient 
);

router.post(
  '/:bookingId/accept-by-client',
  auth,
  bookingController.acceptBookingByClient
);

router.post(
  '/:bookingId/decline-by-client',
  auth,
  bookingController.declineBookingByClient
);

router.post('/:bookingId/cancel-during-payment', auth, bookingController.cancelBookingByUserDuringPayment);

module.exports = router;