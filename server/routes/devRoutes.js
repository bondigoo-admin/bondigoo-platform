const express = require('express');
const router = express.Router();
const devController = require('../controllers/devController');
const { auth } = require('../middleware/auth');

router.post('/set-status', auth, devController.setUserStatus);
router.post('/simulate-coach-response', auth, devController.simulateCoachResponse);

module.exports = router;