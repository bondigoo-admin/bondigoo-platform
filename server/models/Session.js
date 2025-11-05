const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const RecordingSchema = new mongoose.Schema({
  recordingId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'available', 'error'], default: 'pending' },
  startTime: { type: Date },
  endTime: { type: Date },
  duration: { type: Number },
  url: { type: String },
  size: { type: Number },
  consentGiven: { type: Boolean, default: false },
});

const OvertimeSegmentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['requested', 'authorized', 'captured', 'partially_captured', 'released', 'declined', 'failed', 'pending_confirmation'],
    required: true
  },
  requestedAt: { type: Date, default: Date.now },
  requestedDuration: { type: Number, required: true, min: 1 }, // In minutes
  calculatedMaxPrice: { // Calculated by frontend, stored by backend
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'CHF' }
  },
  paymentIntentId: { type: String, index: true },
  authorizedAt: { type: Date },
  captureResult: {
    status: { type: String, enum: ['success', 'failed', 'released'] },
    capturedAmount: { amount: Number, currency: String },
    chargeId: { type: String },
    error: { type: String },
    capturedAt: { type: Date }
  },
  endedAt: { type: Date }
}, { _id: true, timestamps: { createdAt: 'segmentCreatedAt', updatedAt: 'segmentUpdatedAt' } });

const CourseMaterialSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String }, // For Cloudinary or other storage
  fileType: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true } // Ensure _id is generated
}, { _id: true });

const SessionSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true,
    index: true, 
  },
  state: {
    type: String,
    enum: ['pending', 'active', 'requested', 'confirmed', 'declined', 'time_suggested', 'ended', 'failed',  'scheduled', 'pending_minimum_attendees', 'pending_payment', 'pending_reschedule',  'cancelled', 'rescheduled',   'cancelled_by_client', 'cancelled_by_coach', 'cancelled_by_admin', 'pending_reschedule_client_request','pending_reschedule_coach_request', 'rescheduled_pending_attendee_actions', 'cancelled_due_to_reschedule'],
    default: 'pending',
  },
  startedAt: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  actualStartTime: { type: Date },
  actualEndTime: { type: Date },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
    },
  }],
  recordings: [RecordingSchema],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  sessionCompleted: { type: Boolean, default: false },
  reviewNotificationsSent: { type: Boolean, default: false },
  resources: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true }
  }],
  breakoutRooms: [{
    roomId: { type: String, required: true },
    participants: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      joinedAt: { type: Date, default: Date.now },
    }],
    createdAt: { type: Date, default: Date.now },
  }],
  raisedHands: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    peerId: { type: String, required: true },
    raisedAt: { type: Date, default: Date.now },
    confirmed: { type: Boolean, default: false },
    confirmedAt: { type: Date }
  }],
  workshopMode: { type: Boolean, default: false },
  screenShareLocked: { type: Boolean, default: false },
  currentSlide: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  agenda: [{ text: String, timestamp: String, completed: Boolean }],
  privateNotes: {
    type: Map,
    of: [{
      id: { type: String, required: true },
      title: { type: String, required: true },
      html: { type: String, default: '' }
    }],
    default: {}
  },
  feedback: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
sessionImages: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String },
    fileType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    isMain: { type: Boolean, default: false },
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true }
  }],
  courseMaterials: [CourseMaterialSchema],
  overtimeSegments: {
    type: [OvertimeSegmentSchema],
    default: [],
    finalizedAt: { type: Date }
  },
  terminationReason: { type: String },
}, {
  timestamps: true,
});

// Compound index for efficient querying
SessionSchema.index({ bookingId: 1, 'recordings.recordingId': 1 });
SessionSchema.index({ bookingId: 1, 'overtimeSegments.paymentIntentId': 1 }); // Index PI in segments

SessionSchema.pre('save', function(next) {
  const logger = require('../utils/logger').logger; // Ensure logger is accessible
  this.lastUpdated = new Date();

  this.recordings.forEach((recording) => {
    if (recording.status === 'available') {
      if (recording.startTime && recording.endTime) {
        const start = new Date(recording.startTime);
        const end = new Date(recording.endTime);
        recording.duration = Math.max(0, (end - start) / 1000); // Duration in seconds
        logger.info('[SessionSchema.pre-save] Calculated duration for recording', {
          bookingId: this.bookingId.toString(),
          recordingId: recording.recordingId,
          duration: recording.duration,
        });
      } else if (!recording.duration || recording.duration <= 0) {
        logger.warn('[SessionSchema.pre-save] Invalid duration for available recording - missing startTime or endTime', {
          bookingId: this.bookingId.toString(),
          recordingId: recording.recordingId,
          duration: recording.duration || 0,
          startTime: recording.startTime,
          endTime: recording.endTime,
        });
        recording.duration = recording.duration || 0; // Ensure it’s not null
      }
    }
  });

 logger.info('[SessionSchema.pre-save] Session about to be saved', {
    bookingId: this.bookingId.toString(),
    recordingCount: this.recordings.length,
    sessionImagesCount: this.sessionImages?.length || 0,
    overtimeSegmentCount: this.overtimeSegments?.length || 0,
  });
  next();
});

const Session = mongoose.model('Session', SessionSchema);

module.exports = Session;