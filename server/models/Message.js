const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const AttachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  resourceType: { type: String, required: true, enum: ['image', 'video', 'raw', 'file', 'audio'] },
  format: { type: String },
  originalFilename: { type: String },
  bytes: { type: Number },
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: function () { return this.contentType === 'text'; },
    trim: true,
  },
  contentType: {
    type: String,
    enum: ['text', 'image', 'video', 'file', 'audio', 'system'],
    default: 'text',
    required: true,
  },
  attachment: {
    type: [AttachmentSchema],
    default: undefined
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: [],
  }],
  deletedUniversally: {
    type: Boolean,
    default: false,
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'sent',
  },
   contextType: {
    type: String,
    enum: ['booking', 'profile', 'session', 'support_ticket', 'program_assignment_submission'],
    index: true,
    required: false,
  },
  contextId: {
    type: mongoose.Schema.Types.Mixed,
    index: true,
    required: false,
  },
}, {
  timestamps: true,
});

MessageSchema.pre('save', function (next) {
  logger.debug(`[MessageModel] Saving message for conversation: ${this.conversationId}`, {
    contentType: this.contentType,
    hasAttachment: !!this.attachment,
    deliveryStatus: this.deliveryStatus,
    senderId: this.senderId.toString(),
    timestamp: new Date().toISOString(),
  });
  next();
});

module.exports = mongoose.model('Message', MessageSchema);