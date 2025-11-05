const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const connectionController = require('../controllers/connectionController');
const rateLimit = require('express-rate-limit');
const { check } = require('express-validator');

const connectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many connection requests, please try again later.'
});

router.post('/request', connectionLimiter, auth, [
  check('targetUserId').isMongoId().withMessage('Invalid target user ID')
], connectionController.requestConnection);

router.post('/:connectionId/respond', auth, [
  check('connectionId').isMongoId().withMessage('Invalid connection ID'),
  check('status').isIn(['accepted', 'declined']).withMessage('Invalid status')
], connectionController.respondToConnection);

router.get('/user', auth, connectionController.getUserConnections);

router.get('/status/:targetUserId', auth, [
  check('targetUserId').isMongoId().withMessage('Invalid target user ID')
], connectionController.getConnectionStatus);

router.delete('/:connectionId/cancel', auth, [
  check('connectionId').isMongoId().withMessage('Invalid connection ID')
], connectionController.cancelConnectionRequest);

router.delete('/:connectionId/remove', auth, [
  check('connectionId').isMongoId().withMessage('Invalid connection ID')
], connectionController.removeConnection);

console.log('Connection routes defined:', router.stack.map(r => r.route?.path).filter(Boolean));

module.exports = router;