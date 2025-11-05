const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  raterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rateeId: { // Re-add the old field to the schema so Mongoose knows about it
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rateeModel: {
    type: String,
    enum: ['User', 'Program']
    // required: false (or removed)
  },
  ratee: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'rateeModel'
    // required: false (or removed)
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    default: '',
    trim: true,
  },
  privateFeedback: {
    type: String,
    default: '',
    trim: true,
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  coachResponse: {
    type: String,
    default: '',
    trim: true,
  },
  isVisible: {
    type: Boolean,
    default: true,
  },
 flags: [
    {
      flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason: {
        type: String,
        enum: ['spam', 'harassment', 'hate_speech', 'impersonation', 'misinformation', 'inappropriate_content', 'inappropriate_profile', 'self_harm', 'violence', 'intellectual_property', 'other'],
        required: true
      },
      details: { type: String, trim: true, default: '' },
      status: { type: String, enum: ['pending', 'resolved_hidden', 'resolved_dismissed'], default: 'pending' },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
    }
  ],
  qualityBadge: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true, 
});

ReviewSchema.index(
  { sessionId: 1, raterId: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { sessionId: { $exists: true, $ne: null } } 
  }
);

ReviewSchema.index({ ratee: 1, isPrivate: 1, isVisible: 1 });

module.exports = mongoose.model('Review', ReviewSchema);