const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');
const { auth } = require('../middleware/auth');

router.get('/:userId', auth, statusController.getUserStatusById);
router.put('/me', auth, statusController.updateMyStatus);

module.exports = router;