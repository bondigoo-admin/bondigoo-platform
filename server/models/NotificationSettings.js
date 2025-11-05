const mongoose = require('mongoose');

const NotificationSettingsSchema = new mongoose.Schema({
  defaults: {
    channels: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true }
    },
    timing: {
      sessionReminders: { type: Number, default: 30 },
      dailyDigest: { type: Boolean, default: true },
      digestTime: { type: String, default: '09:00' },
      quietHoursEnabled: { type: Boolean, default: false },
      quietHoursStart: { type: String, default: '22:00' },
      quietHoursEnd: { type: String, default: '07:00' }
    }
  },
  retentionPeriod: {
    read: { type: Number, default: 30 },
    unread: { type: Number, default: 90 },
    important: { type: Number, default: 180 }
  },
  batchProcessing: {
    enabled: { type: Boolean, default: true },
    interval: { type: Number, default: 5 },
    maxBatchSize: { type: Number, default: 100 }
  },
  throttling: {
    enabled: { type: Boolean, default: true },
    maxPerMinute: { type: Number, default: 60 },
    maxPerHour: { type: Number, default: 1000 },
    cooldownPeriod: { type: Number, default: 5 }
  },
  deliveryRules: {
    type: Map,
    of: {
      priority: {
        type: String,
        enum: ['high', 'medium', 'low'],
        default: 'low'
      },
      requiredChannels: [{
        type: String,
        enum: ['email', 'push', 'inApp']
      }],
      throttleExempt: { type: Boolean, default: false }
    }
  }
}, {
  timestamps: true
});

// Add index for faster queries
NotificationSettingsSchema.index({ updatedAt: -1 });

// Add method to validate settings
NotificationSettingsSchema.methods.validate = function() {
  // Add custom validation logic here
  return true;
};

// Add static method to get active settings
NotificationSettingsSchema.statics.getActive = async function() {
  const settings = await this.findOne().sort({ updatedAt: -1 });
  return settings || this.create({});
};

module.exports = mongoose.model('NotificationSettings', NotificationSettingsSchema);