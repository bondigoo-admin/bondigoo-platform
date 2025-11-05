const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const optionalAuth = require('../middleware/optionalAuth'); 

router.get('/active', optionalAuth, announcementController.getActiveAnnouncements);
router.post('/:id/view', announcementController.trackAnnouncementView);
router.post('/:id/click', announcementController.trackAnnouncementClick);

module.exports = router;