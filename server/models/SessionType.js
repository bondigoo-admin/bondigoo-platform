const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

// Keep existing schemas that aren't pricing-related
const bookingRulesSchema = new mongoose.Schema({
  allowFirmBooking: { type: Boolean, default: true },
  firmBookingThreshold: { type: Number, default: 24 },
  bufferTimeBefore: { type: Number, default: 15 },
  bufferTimeAfter: { type: Number, default: 15 },
  maxSessionsPerDay: { type: Number, default: null },
  maxSessionsPerWeek: { type: Number, default: null },
  requireApprovalNonConnected: { type: Boolean, default: true },
  cancellationPolicy: {
    deadline: { type: Number, default: 24 },
    refundPercentage: { type: Number, default: 100 }
  },
  requiresAvailability: { type: Boolean, default: false }
}, { _id: false });

const capacitySchema = new mongoose.Schema({
  min: { type: Number, default: 1 },
  max: { type: Number, default: 1 },
  waitlist: {
    enabled: { type: Boolean, default: false },
    maxSize: { type: Number, default: 0 }
  }
}, { _id: false });

const durationSchema = new mongoose.Schema({
  default: { type: Number, required: true },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  step: { type: Number, default: 15 }
}, { _id: false });

const materialSchema = new mongoose.Schema({
  prework: {
    required: { type: Boolean, default: false },
    documents: [String],
    deadline: { type: Number }
  },
  postSession: {
    enabled: { type: Boolean, default: false },
    documents: [String],
    availableFor: { type: Number, default: 30 }
  }
}, { _id: false });

let SessionType;
try {
  SessionType = mongoose.model('SessionType');
} catch (error) {
  const SessionTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    isGroupSession: { type: Boolean, default: false },
    
    // Updated duration field to use new schema
    duration: { type: durationSchema, required: true },
    
    format: {
      type: String,
      enum: ['one_on_one', 'group', 'workshop'],
      required: true,
      default: 'one_on_one'
    },
    active: { type: Boolean, default: true },
    bookingRules: { type: bookingRulesSchema, default: () => ({}) },
    capacity: { type: capacitySchema, default: () => ({}) },
    materials: { type: materialSchema, default: () => ({}) },
    
    calendarVisibility: {
      type: String,
      enum: ['public', 'connected', 'private'],
      default: 'public'
    },
    
    recurringOptions: {
      enabled: { type: Boolean, default: false },
      patterns: [{
        type: String,
        enum: ['weekly', 'biweekly', 'monthly', 'custom'],
      }],
      maxSessions: { type: Number, default: 12 }
    },
    
    notifications: {
      preSession: [{
        timing: Number,
        type: {
          type: String,
          enum: ['email', 'push', 'sms']
        }
      }],
      postSession: [{
        timing: Number,
        type: {
          type: String,
          enum: ['email', 'push', 'sms']
        }
      }]
    },

    // New fields for metadata
    metadata: {
      legacyPriceFields: {
        price: Number,
        pricingConfig: mongoose.Schema.Types.Mixed
      },
      migrationDate: Date
    }
  }, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  });

  // Pre-save middleware for backward compatibility and logging
  SessionTypeSchema.pre('save', async function(next) {
    logger.info('[SessionType] Saving session type:', {
      id: this._id,
      name: this.name,
      format: this.format,
      isNew: this.isNew
    });

    // Handle format based on isGroupSession for backward compatibility
    if (this.isNew && this.isGroupSession && !this.format) {
      this.format = 'group';
    }

    // If old price field is present, store it in metadata before removal
    if (this.isNew && (this.price || this.pricing)) {
      logger.info('[SessionType] Storing legacy price fields in metadata:', {
        id: this._id,
        hasPrice: !!this.price,
        hasPricing: !!this.pricing
      });

      this.metadata = {
        legacyPriceFields: {
          price: this.price,
          pricingConfig: this.pricing
        },
        migrationDate: new Date()
      };
    }

    next();
  });

  // Post-save hook for logging
  SessionTypeSchema.post('save', function(doc) {
    logger.info('[SessionType] Session type saved successfully:', {
      id: doc._id,
      name: doc.name,
      format: doc.format
    });
  });

  SessionType = mongoose.model('SessionType', SessionTypeSchema);
}

module.exports = SessionType;