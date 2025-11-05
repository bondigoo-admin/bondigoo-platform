const mongoose = require('mongoose');
const { 
  NotificationCategories, 
  NotificationPriorities, 
  NotificationStatus, 
  NotificationMetadata 
} = require('../utils/notificationHelpers');
const { logger } = require('../utils/logger');

const NotificationActionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['approve', 'reject', 'view', 'respond', 'cancel'],
    required: true
  },
  label: String,
  endpoint: String,
  data: mongoose.Schema.Types.Mixed,
}, { _id: false });

const DeliveryStatusSchema = new mongoose.Schema({
  channel: String,
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'delivered', 'read'],
    default: 'pending'
  },
  timestamp: Date,
  error: String
}, { _id: false });

const NotificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  type: { 
    type: String, 
    required: true,
    index: true
  },
  subType: String,
  priority: {
    type: String,
    enum: Object.values(NotificationPriorities),
    default: NotificationPriorities.LOW,
    index: true
  },
  content: {
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: Object.values(NotificationStatus),
    default: NotificationStatus.ACTIVE,
    index: true
  },
  category: {
    type: String,
    enum: Object.values(NotificationCategories),
    required: true,
    index: true
  },
  channels: [{
    type: String,
    enum: ['in_app', 'email', 'push'],
    required: true
  }],
metadata: {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession' },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Connection' },
    resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
    achievementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    additionalData: mongoose.Schema.Types.Mixed
  },
  actions: [NotificationActionSchema],
  delivery: {
    attempts: { type: Number, default: 0 },
    lastAttempt: Date,
    maxAttempts: { type: Number, default: 3 },
    statuses: [DeliveryStatusSchema]
  },
  expiresAt: {
    type: Date,
    index: true
  },
  isRead: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  readAt: Date,
  trashedAt: Date,
  deletedAt: Date,
  restoredAt: Date,
  groupId: {
    type: String,
    sparse: true,
    index: true
  },
  groupOrder: Number,
  deliveryAttempts: {
    type: Number,
    default: 0
  },
  lastDeliveryAttempt: Date,
  throttleKey: String
}, {
  timestamps: true
});

// Indexes for common queries
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isRead: 1 });
NotificationSchema.index({ status: 1, createdAt: -1 });

// TTL index for expiration
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// New compound indexes
NotificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, category: 1, status: 1 });
NotificationSchema.index({ status: 1, trashedAt: 1 }, { sparse: true });

// Methods
NotificationSchema.methods.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  this.status = 'active';
  await this.save();
};

NotificationSchema.methods.markAsDelivered = async function(channel) {
  const deliveryStatus = this.delivery.statuses.find(s => s.channel === channel);
  if (deliveryStatus) {
    deliveryStatus.status = 'delivered';
    deliveryStatus.timestamp = new Date();
  } else {
    this.delivery.statuses.push({
      channel,
      status: 'delivered',
      timestamp: new Date()
    });
  }
  await this.save();
};

NotificationSchema.methods.moveToTrash = async function() {
  console.log('[NotificationModel] Moving notification to trash:', this._id);
  this.status = 'trash';
  this.trashedAt = new Date();
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await this.save();
  console.log('[NotificationModel] Notification moved to trash:', this._id);
};

NotificationSchema.methods.restore = async function() {
  console.log('[NotificationModel] Restoring notification:', this._id);
  this.status = 'active';
  this.trashedAt = null;
  this.restoredAt = new Date();
  this.expiresAt = null;
  await this.save();
  logger.info('Notification restored:', this._id);
};

NotificationSchema.methods.softDelete = async function() {
  console.log('[NotificationModel] Soft deleting notification:', this._id);
  this.status = 'deleted';
  this.deletedAt = new Date();
  await this.save();
  logger.info('Notification soft deleted:', this._id);
};

NotificationSchema.methods.markAsActioned = async function() {
  console.log('[NotificationModel] Marking notification as actioned:', { 
    notificationId: this._id, 
    currentStatus: this.status 
  });
  if (this.status === 'actioned') {
    logger.warn('[NotificationModel] Notification already actioned:', { notificationId: this._id });
    return this;  // No change needed
  }
  this.status = NotificationStatus.ACTIONED;
  this.updatedAt = new Date();  // Ensure timestamp reflects the change
  await this.save();
  logger.info('[NotificationModel] Notification marked as actioned:', {
    id: this._id,
    type: this.type,
    recipient: this.recipient,
    newStatus: this.status
  });
  return this;
};

// Statics
NotificationSchema.statics.getActiveNotifications = async function(userId, options = {}) {
  console.log('[NotificationModel] Getting active notifications for user:', userId);
  const query = {
    recipient: userId,
    status: 'active'
  };

  if (options.since) {
    query.createdAt = { $gt: options.since };
  }

  const notifications = await this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .populate('sender', 'firstName lastName email profilePicture')
    .lean();

  logger.debug('Found active notifications:', {
    userId,
    count: notifications.length,
    options
  });

  return notifications;
};

NotificationSchema.statics.getTrashNotifications = async function(userId, options = {}) {
  console.log('[NotificationModel] Getting trash notifications for user:', userId);
  return await this.find({
    recipient: userId,
    status: 'trash'
  })
    .sort({ trashedAt: -1 })
    .limit(options.limit || 50)
    .lean();
};

NotificationSchema.statics.emptyTrash = async function(userId) {
  console.log('[NotificationModel] Emptying trash for user:', userId);
  const result = await this.updateMany(
    {
      recipient: userId,
      status: 'trash'
    },
    {
      $set: {
        status: 'deleted',
        deletedAt: new Date()
      }
    }
  );
  
  logger.info('Trash emptied:', {
    userId,
    modifiedCount: result.modifiedCount
  });
  
  return result;
};

// Pre-save middleware for categorization and throttling
NotificationSchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      console.log('[NotificationModel] Processing new notification:', this._id);
      
      // Set category based on type
      const metadata = NotificationMetadata[this.type];
      this.category = metadata?.category || NotificationCategories.SYSTEM;
      
      // Generate throttle key if needed
      if (metadata?.throttle) {
        this.throttleKey = `${this.recipient}_${this.type}_${Date.now()}`;
      }
      
      logger.debug('Notification preprocessed:', {
        id: this._id,
        category: this.category,
        throttleKey: this.throttleKey
      });
    }
    next();
  } catch (error) {
    logger.error('Error in notification pre-save middleware:', error);
    next(error);
  }
});

// Add validation middleware
NotificationSchema.pre('validate', function(next) {
  console.log('[NotificationModel] Pre-validate hook:', {
    type: this.type,
    category: this.category,
    metadata: this.metadata
  });

  // Set default category based on type if not provided
  if (!this.category && this.type) {
    const config = NotificationMetadata[this.type];
    if (config) {
      this.category = config.category;
      console.log('[NotificationModel] Set default category:', this.category);
    }
  }

  next();
});

let Notification;
try {
  Notification = mongoose.model('Notification');
} catch (error) {
  Notification = mongoose.model('Notification', NotificationSchema);
}

module.exports = Notification;