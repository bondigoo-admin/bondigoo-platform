const RecordingService = require('../services/recordingService');
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const cloudinary = require('../utils/cloudinaryConfig');
const Session = require('../models/Session');

exports.startRecording = async (req, res) => {
  try {
    const { bookingId, sessionId, consent } = req.body;
    const userId = req.user._id;
    logger.info('[recordingController.startRecording] Request received', { bookingId, sessionId, consent, userId });
    const result = await RecordingService.startRecording(bookingId, sessionId, userId, consent);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('[recordingController.startRecording] Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to start recording', error: error.message });
  }
};

exports.stopRecording = async (req, res) => {
  try {
    const { bookingId, recordingId } = req.body;
    const video = req.file;

    // Validate input
    if (!video) {
      logger.warn('[recordingController.stopRecording] No video file', { bookingId, recordingId });
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    if (!bookingId || !recordingId) {
      logger.warn('[recordingController.stopRecording] Missing metadata', { bookingId, recordingId });
      return res.status(400).json({ error: 'Missing bookingId or recordingId' });
    }

    // Log upload initiation
    logger.debug('[recordingController.stopRecording] Starting Cloudinary upload', {
      bookingId,
      recordingId,
      fileSize: video.size,
    });

    // Upload to Cloudinary using callback directly
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'session_recordings',
          public_id: `${bookingId}_${recordingId}`,
          type: 'private',
        },
        (error, result) => {
          if (error) {
            logger.error('[recordingController.stopRecording] Cloudinary upload failed', {
              bookingId,
              recordingId,
              error: error.message,
            });
            reject(error);
          } else {
            logger.debug('[recordingController.stopRecording] Cloudinary upload succeeded', {
              bookingId,
              recordingId,
              secure_url: result.secure_url,
            });
            resolve(result);
          }
        }
      );
      const bufferStream = require('stream').Readable.from(video.buffer);
      bufferStream.pipe(uploadStream);
    });

    // Update session
    logger.debug('[recordingController.stopRecording] Updating session', { bookingId, recordingId });
    const session = await Session.findOneAndUpdate(
      { bookingId, 'recordings.recordingId': recordingId },
      {
        $set: {
          'recordings.$.url': result.secure_url,
          'recordings.$.status': 'available',
          'recordings.$.endTime': new Date(),
          'recordings.$.size': video.size,
        },
      },
      { new: true }
    );

    if (!session) {
      logger.warn('[recordingController.stopRecording] Session not found', { bookingId, recordingId });
      return res.status(404).json({ error: 'Session or recording not found' });
    }

    logger.info('[recordingController.stopRecording] Recording uploaded and session updated', {
      bookingId,
      recordingId,
      url: result.secure_url,
    });

    res.json({ success: true, url: result.secure_url });
  } catch (error) {
    logger.error('[recordingController.stopRecording] Stop recording error', {
      error: error.message,
      stack: error.stack,
      bookingId: typeof bookingId !== 'undefined' ? bookingId : 'undefined',
      recordingId: typeof recordingId !== 'undefined' ? recordingId : 'undefined',
    });
    res.status(500).json({ error: error.message });
  }
};

exports.getSessionRecordings = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id;
    logger.info('[recordingController.getSessionRecordings] Request received', { bookingId, userId });

    const session = await Session.findOne({ bookingId }).select('recordings');
    if (!session) {
      logger.warn('[recordingController.getSessionRecordings] Session not found', { bookingId });
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    logger.info('[recordingController.getSessionRecordings] Recordings retrieved', {
      bookingId,
      recordingCount: session.recordings.length,
    });
    res.status(200).json({ success: true, recordings: session.recordings });
  } catch (error) {
    logger.error('[recordingController.getSessionRecordings] Error:', {
      error: error.message,
      stack: error.stack,
      bookingId: req.params.bookingId,
    });
    res.status(500).json({ success: false, message: 'Failed to get session recordings', error: error.message });
  }
};

exports.getRecording = async (req, res) => {
  try {
    const { bookingId, recordingId } = req.params;
    const userId = req.user._id;
    logger.info('[recordingController.getRecording] Request received', { bookingId, recordingId, userId });

    const session = await Session.findOne({ bookingId });
    if (!session) {
      logger.warn('[recordingController.getRecording] Session not found', { bookingId });
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const recording = session.recordings.find((rec) => rec.recordingId === recordingId);
    if (!recording) {
      logger.warn('[recordingController.getRecording] Recording not found', { bookingId, recordingId });
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }

    logger.info('[recordingController.getRecording] Recording retrieved', { bookingId, recordingId });
    res.status(200).json({ success: true, ...recording.toObject() });
  } catch (error) {
    logger.error('[recordingController.getRecording] Error:', {
      error: error.message,
      stack: error.stack,
      bookingId: req.params.bookingId,
      recordingId: req.params.recordingId,
    });
    res.status(500).json({ success: false, message: 'Failed to get recording', error: error.message });
  }
};