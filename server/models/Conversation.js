const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  type: {
    type: String,
    enum: ['one-on-one', 'group', 'broadcast'],
    default: 'one-on-one',
    index: true,
  },
  name: {
    type: String,
    trim: true,
  },
  groupAvatar: {
    url: String,
    publicId: String,
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  },
  unreadCounts: {
    type: Map,
    of: Number,
    default: () => new Map(),
  },
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: [],
  }],
  restorationHistory: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    restoredAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  }],
  encryptionKey: {
    type: String,
    required: false,
    select: false,
  },
  description: {
    type: String,
    trim: true,
  },
  settings: {
    allowMemberInvites: { type: Boolean, default: true },
    allowMemberInfoEdit: { type: Boolean, default: true },
  },
  context: {
    type: { 
      type: String, 
      enum: ['support_ticket', 'program_assignment_submission'] 
    },
    id: { type: mongoose.Schema.Types.ObjectId },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }
  },
}, {
  timestamps: true,
});

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ updatedAt: -1 });
ConversationSchema.index(
  { 'context.enrollmentId': 1, 'context.lessonId': 1 },
  { unique: true, sparse: true }
);

ConversationSchema.pre('save', function(next) {
  logger.debug(`[ConversationModel] Saving conversation: ${this._id}`, {
    participantCount: this.participants?.length,
    deletedForCount: this.deletedFor?.length,
    timestamp: new Date().toISOString(),
  });
  next();
});

module.exports = mongoose.model('Conversation', ConversationSchema);