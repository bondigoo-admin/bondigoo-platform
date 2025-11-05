const express = require('express');
const router = express.Router();
const recordingController = require('../controllers/recordingController');
const { auth: authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { logger } = require('../utils/logger');

// Configure multer for temporary storage
const upload = multer({
  storage: multer.memoryStorage(), // Use memory instead of disk
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Not a video file'));
    }
  },
});

// Increase request timeout for large uploads
router.use((req, res, next) => {
  req.setTimeout(600000); // 10 minutes
  next();
});

// Stop recording route
router.post('/stop', authMiddleware, (req, res, next) => {
  logger.info('[recordingRoutes] Before multer', {
    headers: req.headers,
    body: req.body, // Should be undefined for multipart
    readable: req.readable,
    readableEnded: req.readableEnded,
    contentLength: req.headers['content-length']
  });
  next();
}, upload.single('video'), (req, res, next) => {
  logger.info('[recordingRoutes] After multer', {
    body: req.body,
    file: req.file
  });
  next();
}, recordingController.stopRecording);

// Standard routes
router.post('/start', authMiddleware, recordingController.startRecording);
router.get('/:bookingId/:recordingId', authMiddleware, recordingController.getRecording);
router.get('/:bookingId/:recordingId', authMiddleware, recordingController.getRecording);

router.get('/:bookingId/recordings', authMiddleware, recordingController.getSessionRecordings);

module.exports = router;