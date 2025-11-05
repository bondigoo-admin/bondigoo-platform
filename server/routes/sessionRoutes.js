const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { uploadResource, cacheSegmentation, getSegmentation } = require('../controllers/resourceController');
const recordingController = require('../controllers/recordingController');
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');
const sessionAuth = require('../middleware/sessionAuth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const Session = require('../models/Session');
const Booking = require('../models/Booking');
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const notificationService = require('../services/unifiedNotificationService');

const redisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/generate/:bookingId', auth, sessionController.generateSessionLink); // Still uses Booking for now, update if needed
router.get('/validate/:sessionId/:token', auth, sessionAuth, sessionController.validateSessionLink);
router.post('/start/:sessionId', auth, sessionController.startSession);
router.post('/resources', auth, upload.single('file'), uploadResource);

router.post('/:sessionId/polls', auth, sessionController.createPoll);
router.put('/:sessionId/polls/:pollId', auth, sessionController.updatePoll);
router.get('/:sessionId/polls', auth, sessionController.getPolls);
router.delete('/:sessionId/polls/:pollId', auth, sessionController.deletePoll);

router.post('/:sessionId/qa', auth, sessionController.createQA);
router.put('/:sessionId/qa/:qaId', auth, sessionController.updateQA);
router.get('/:sessionId/qa', auth, sessionController.getQA);
router.delete('/:sessionId/qa/:qaId', auth, sessionController.deleteQA);


router.put('/:sessionId/notes-agenda', auth, sessionController.updateNotesAgenda);
router.get('/:sessionId/notes-agenda', auth, sessionController.getNotesAgenda);

router.post('/user/backgrounds', auth, upload.single('background'), sessionController.uploadBackground);
router.get('/user/backgrounds', auth, sessionController.getBackgrounds);

router.get('/:sessionId/analytics', auth, sessionController.getSessionAnalytics);

router.post('/cacheSegmentation', auth, redisLimiter, require('../controllers/resourceController').cacheSegmentation);
router.get('/getSegmentation/:key', auth, redisLimiter, require('../controllers/resourceController').getSegmentation);

router.get('/:bookingId/recordings', auth, recordingController.getSessionRecordings);

router.post('/:sessionId/resources', auth, upload.single('file'), sessionController.uploadResource);
router.get('/:sessionId/resources', auth, sessionController.getResources);
router.delete('/:sessionId/resources/:resourceId', auth, sessionController.deleteResource);

router.post(
  '/:sessionLinkSessionId/image', 
  auth, 
  upload.single('sessionImageFile'),
  sessionController.uploadSessionImage
);
router.delete(
  '/:sessionLinkSessionId/image/:imageId',
  auth,
  sessionController.deleteSessionImage
);
router.put(
  '/:sessionLinkSessionId/image/:imageId/set-main',
  auth,
  sessionController.setMainSessionImage
);

router.post(
  '/:sessionLinkSessionId/course-materials', 
  auth, 
  upload.array('courseMaterialFiles', 10), // Allow multiple files
  sessionController.uploadSessionCourseMaterials
);
router.delete(
  '/:sessionLinkSessionId/course-materials/:materialId', 
  auth, 
  sessionController.deleteSessionCourseMaterial
);

router.get('/:sessionId/notes/private/:userId', auth, (req, res, next) => {
  logger.info('[sessionRoutes] Incoming request to getPrivateNotes', {
    method: req.method,
    path: req.path,
    sessionId: req.params.sessionId,
    userId: req.params.userId,
    requester: req.user?._id?.toString()
  });
  sessionController.getPrivateNotes(req, res, next);
});

router.get('/:sessionId/agenda', auth, (req, res, next) => {
  logger.info('[sessionRoutes] Incoming request to getAgenda', {
    method: req.method,
    path: req.path,
    sessionId: req.params.sessionId,
    requester: req.user?._id?.toString()
  });
  sessionController.getAgenda(req, res, next);
});

router.put('/:sessionId/notes/private/:userId', auth, (req, res, next) => {
  logger.info('[sessionRoutes] Incoming request to updatePrivateNotes', {
    method: req.method,
    path: req.path,
    sessionId: req.params.sessionId,
    userId: req.params.userId,
    requester: req.user?._id?.toString(),
    bodyLength: req.body.notes?.length || 0
  });
  sessionController.updatePrivateNotes(req, res, next);
});

router.put('/:sessionId/agenda', auth, (req, res, next) => {
  logger.info('[sessionRoutes] Incoming request to updateAgenda', {
    method: req.method,
    path: req.path,
    sessionId: req.params.sessionId,
    requester: req.user?._id?.toString(),
    agendaLength: req.body.agenda?.length || 0
  });
  sessionController.updateAgenda(req, res, next);
});

router.post('/:sessionId/overtime', auth, sessionController.handleOvertimeResponse);
router.post('/:sessionId/terminate', auth, paymentController.terminateSessionForPayment);
router.post('/:sessionId/continue', auth, paymentController.continueSession);

router.post('/:sessionId/end', auth, async (req, res) => {
  const { sessionId } = req.params;
  const { simulate } = req.body;
  const userId = req.user._id;

  logger.info('[sessionRoutes] Attempting to end session', {
    sessionId,
    userId,
    simulate: !!simulate,
    timestamp: new Date().toISOString(),
  });

  try {
    // Find booking by sessionLink.sessionId
    const booking = await Booking.findOne({
      'sessionLink.sessionId': sessionId,
      'sessionLink.expired': false,
    }).populate('coach user');
    if (!booking) {
      logger.warn('[sessionRoutes] No booking found for sessionId', { sessionId, userId });
      return res.status(404).json({ success: false, message: 'Booking not found for this session ID' });
    }

    logger.info('[sessionRoutes] Booking found', {
      sessionId,
      bookingId: booking._id.toString(),
      userId,
    });

    // Find session by bookingId
    const session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      logger.warn('[sessionRoutes] Session not found for booking', {
        sessionId,
        bookingId: booking._id.toString(),
        userId,
      });
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    logger.info('[sessionRoutes] Session retrieved', {
      sessionId,
      sessionDocId: session._id.toString(),
      bookingId: session.bookingId.toString(),
      currentState: session.state,
    });

    // Authorization check
    const isCoach = booking.coach._id.toString() === userId.toString();
    const isClient = booking.user._id.toString() === userId.toString();
    if (!isCoach && !isClient) {
      logger.warn('[sessionRoutes] Unauthorized attempt to end session', {
        sessionId,
        userId,
        coachId: booking.coach._id.toString(),
        clientId: booking.user._id.toString(),
      });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (simulate && process.env.NODE_ENV === 'development') {
      // Simulation logic
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      session.state = 'ended';
      session.endedAt = now;
      session.sessionCompleted = true;
      session.participants = [
        { userId: booking.coach._id, joinedAt: fiveMinutesAgo, leftAt: now },
        { userId: booking.user._id, joinedAt: fiveMinutesAgo, leftAt: now },
      ];
      await session.save();

      const io = req.app.get('io');
      io.of('/video').to(`session:${sessionId}`).emit('SESSION_ENDED', {
        endedBy: userId,
        timestamp: now.toISOString(),
        isCompleted: true,
      });

      await notificationService.triggerReviewPrompts(session, booking);

      logger.info('[sessionRoutes] Session end simulated', {
        sessionId,
        sessionDocId: session._id.toString(),
        userId,
        timestamp: now.toISOString(),
      });

      return res.json({ success: true, message: 'Session end simulated successfully' });
    } else {
      // Regular end logic
      if (session.state === 'ended') {
        logger.warn('[sessionRoutes] Session already ended', {
          sessionId,
          sessionDocId: session._id.toString(),
          userId,
        });
        return res.status(400).json({ success: false, message: 'Session already ended' });
      }

      session.state = 'ended';
      session.endedAt = new Date();
      await session.save();

      const io = req.app.get('io');
      io.of('/video').to(`session:${sessionId}`).emit('SESSION_ENDED', {
        endedBy: userId,
        timestamp: new Date().toISOString(),
        isCompleted: session.sessionCompleted,
      });

      if (session.sessionCompleted) {
        await notificationService.triggerReviewPrompts(session, booking);
      }

      logger.info('[sessionRoutes] Session ended normally', {
        sessionId,
        sessionDocId: session._id.toString(),
        userId,
        timestamp: new Date().toISOString(),
      });

      return res.json({ success: true, message: 'Session ended successfully' });
    }
  } catch (error) {
    logger.error('[sessionRoutes] Error ending session', {
      sessionId,
      userId,
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:sessionId/latest-overtime-request', auth, sessionController.getLatestOvertimeRequest);

if (process.env.NODE_ENV === 'development') {
  router.post('/:sessionId/dev/set-overtime-choice', auth, sessionController.setOvertimeChoiceDev);
  router.post('/:sessionId/dev/simulate-user-overtime-authorization', auth, sessionController.simulateUserOvertimeAuthorizationDev);
  router.post('/:sessionId/dev/simulate-overtime-usage', auth, sessionController.simulateOvertimeUsageDev);
  logger.info('[sessionRoutes] Registered DEV endpoint: /:sessionId/dev/set-overtime-choice');
  logger.info('[sessionRoutes] Registered DEV endpoint: /:sessionId/dev/simulate-user-overtime-authorization');
  logger.info('[sessionRoutes] Registered DEV endpoint: /:sessionId/dev/simulate-overtime-usage');
}

module.exports = router;