const express = require('express');
const router = express.Router();
const liveSessionController = require('../controllers/liveSessionController');
const { auth } = require('../middleware/auth');

router.post('/request', auth, liveSessionController.requestLiveSession);
router.post('/:sessionId/respond', auth, liveSessionController.respondToLiveSessionRequest);

router.get('/validate/:sessionId/:token', auth, liveSessionController.validateSessionLink);

router.post('/:sessionId/authorize', auth, liveSessionController.createAuthorization);
router.post('/:sessionId/start', auth, liveSessionController.startLiveSession);
router.post('/:sessionId/auth-failure', auth, liveSessionController.handleAuthorizationFailure);

router.post('/:sessionId/cancel', auth, liveSessionController.cancelLiveSessionRequest);

router.post('/:sessionId/end', auth, liveSessionController.endLiveSession);

router.post('/:sessionId/feedback', auth, liveSessionController.submitFeedback);

module.exports = router;