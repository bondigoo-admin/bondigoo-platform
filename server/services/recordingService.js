const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const Booking = require('../models/Booking');
const User = require('../models/User');
const StorageManager = require('./storageManager');
const redis = require('../redisClient');

class RecordingService {
  constructor() {
    this.storageManager = new StorageManager();
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async startRecording(bookingId, sessionId, userId, consent = false) {
    logger.info('[recordingService] Starting recording with payload', { bookingId, sessionId, userId, consent });
    try {
      const booking = await Booking.findById(bookingId)
        .populate('coach', '_id')
        .populate('user', '_id');
      if (!booking) throw new Error('Booking not found');
  
      if (booking.status !== 'confirmed' || booking.sessionLink?.sessionId !== sessionId) {
        throw new Error('Booking must be confirmed and match session');
      }
  
      // Allow both coach and user to start recording
      const isCoach = booking.coach._id.toString() === userId;
      const isParticipant = booking.user._id.toString() === userId;
      if (!isCoach && !isParticipant) {
        throw new Error('Only the coach or participant can start a recording');
      }
  
      if (!consent) {
        throw new Error('Recording consent required');
      }
  
      let session = await Session.findOne({ bookingId: new mongoose.Types.ObjectId(bookingId) });
      if (!session) {
        session = new Session({
          bookingId: new mongoose.Types.ObjectId(bookingId),
          state: 'active',
          startedAt: new Date(),
          participants: [
            { userId: booking.coach._id, joinedAt: new Date() },
            { userId: booking.user._id, joinedAt: new Date() },
          ],
        });
      } else if (session.state !== 'active') {
        session.state = 'active';
        session.startedAt = session.startedAt || new Date();
      }
  
      const recordingId = uuidv4();
      session.recordings = session.recordings || [];
      session.recordings.push({
        recordingId,
        status: 'pending',
        startTime: new Date(),
        consentGiven: true,
      });
      await session.save();
  
      logger.info('[recordingService.startRecording] Recording initiated', {
        bookingId,
        recordingId,
        sessionId,
        userId,
      });
  
      return { success: true, recordingId, sessionId };
    } catch (error) {
      logger.error('[recordingService.startRecording] Error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async uploadRecording(bookingId, recordingId, videoFile, userId) {
    try {
      const session = await Session.findOne({ bookingId: mongoose.Types.ObjectId(bookingId) });
      if (!session) throw new Error('Session not found');
  
      const recording = session.recordings.find(r => r.recordingId === recordingId);
      if (!recording || recording.status !== 'pending') {
        throw new Error('Recording not found or invalid state');
      }
  
      const booking = await Booking.findById(bookingId)
        .populate('coach', '_id')
        .populate('user', '_id'); // Added user population for notification
      if (!booking || booking.coach._id.toString() !== userId) {
        throw new Error('Only the coach can upload recordings');
      }
  
      const publicId = `recordings/${bookingId}/${recordingId}`;
      const uploadResult = await cloudinary.uploader.upload(videoFile.path, {
        resource_type: 'video',
        public_id: publicId,
        overwrite: true,
        eager: [{ width: 1280, crop: 'scale' }],
        context: `booking_id=${bookingId}|session_id=${booking.sessionLink.sessionId}`,
      });
  
      const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      const recordingUrl = cloudinary.url(publicId, {
        resource_type: 'video',
        secure: true,
        sign_url: true,
        expires_at: expiresAt,
      });
  
      recording.status = 'available';
      recording.url = uploadResult.secure_url;
      recording.publicId = uploadResult.public_id;
      recording.endTime = new Date();
      recording.duration = uploadResult.duration || ((recording.endTime - recording.startTime) / 1000);
      recording.size = uploadResult.bytes;
      await session.save();
  
      logger.info('[recordingService.uploadRecording] Video uploaded', {
        bookingId,
        recordingId,
        publicId: uploadResult.public_id,
        url: recordingUrl,
      });
  
      await redis.set(`recording:${bookingId}:${recordingId}`, JSON.stringify({
        status: 'available',
        url: recordingUrl,
        duration: recording.duration,
      }), 'EX', 24 * 60 * 60);
  
      // Logging integration with booking virtual field
      logger.info('[recordingService.uploadRecording] Recording integrated with booking', {
        bookingId,
        recordingCount: (await booking.recordings).length, // Access virtual field asynchronously
        latestRecording: recordingId
      });
  
      // Trigger notification for recording availability
      const unifiedNotificationService = require('./unifiedNotificationService');
      await unifiedNotificationService.sendNotification({
        type: 'RECORDING_AVAILABLE',
        recipient: booking.user._id.toString(),
        category: 'session',
        priority: 'medium',
        channels: ['in_app', 'email'],
        content: {
          title: 'Session Recording Available',
          message: `Your session recording from ${new Date(booking.start).toLocaleString()} is now available.`,
        },
        metadata: { bookingId, recordingId, recordingUrl }
      }, booking);
  
      logger.info('[recordingService.uploadRecording] Notification sent for recording availability', {
        bookingId,
        recordingId,
        recipient: booking.user._id.toString()
      });
  
      return { success: true, recordingUrl, duration: recording.duration };
    } catch (error) {
      logger.error('[recordingService.uploadRecording] Error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async getRecording(bookingId, recordingId, userId) {
    try {
      const cacheKey = `recording:${bookingId}:${recordingId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.info('[recordingService.getRecording] Cache hit', { bookingId, recordingId });
        return JSON.parse(cached);
      }

      const session = await Session.findOne({ bookingId: mongoose.Types.ObjectId(bookingId) });
      if (!session) throw new Error('Session not found');

      const recording = session.recordings.find(r => r.recordingId === recordingId);
      if (!recording) throw new Error('Recording not found');

      const booking = await Booking.findById(bookingId)
        .populate('coach', '_id')
        .populate('user', '_id');
      if (!booking) throw new Error('Booking not found');

      const isAuthorized = [booking.coach._id.toString(), booking.user._id.toString()].includes(userId);
      if (!isAuthorized) throw new Error('Unauthorized access to recording');

      const signedUrl = recording.status === 'available' && recording.publicId
        ? cloudinary.url(recording.publicId, {
            resource_type: 'video',
            type: 'private',
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          })
        : null;

      const result = {
        success: true,
        status: recording.status,
        recordingId,
        url: signedUrl,
        startTime: recording.startTime,
        endTime: recording.endTime,
        duration: recording.duration,
      };

      if (recording.status === 'available') {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 24 * 60 * 60);
      }

      logger.info('[recordingService.getRecording] Recording retrieved', { bookingId, recordingId, userId });
      return result;
    } catch (error) {
      logger.error('[recordingService.getRecording] Error', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

module.exports = new RecordingService();