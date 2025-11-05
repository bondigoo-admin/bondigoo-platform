const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const timeRangeSchema = new mongoose.Schema({
  start: { 
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format (HH:MM)`
    }
  },
  end: { 
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format (HH:MM)`
    }
  }
}, { _id: false });

const rateSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'CHF',
    uppercase: true,
    enum: ['CHF', 'EUR', 'USD'], // Start with CHF, expandable for future currencies
  }
}, { _id: false });

const priceOverrideSchema = new mongoose.Schema({
  sessionType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionType',
    required: true
  },
  rate: rateSchema,
  conditions: {
    minDuration: { type: Number, min: 0 }, // in minutes
    maxDuration: { type: Number, min: 0 }, // in minutes
    participantCount: {
      min: { type: Number, min: 1 },
      max: { type: Number }
    },
    bookingWindow: {
      min: { type: Number }, // hours before session
      max: { type: Number }  // hours before session
    }
  },
  priority: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const timeBasedRateSchema = new mongoose.Schema({
  rate: {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    isPercentage: {
      type: Boolean,
      default: true,
    },
  },
  sessionTypes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionType',
    required: true
  }],
  dayOfWeek: [{
    type: Number,
    min: 0,
    max: 6,
    required: true
  }],
  timeRange: timeRangeSchema,
  timezone: {
    type: String,
    required: true,
    default: 'Europe/Zurich'
  },
  priority: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const sessionTypeRateSchema = new mongoose.Schema({
  sessionType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionType',
    required: true
  },
  rate: rateSchema
}, { _id: false });

const specialPeriodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  sessionTypes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionType',
    required: true
  }],
  rate: {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    isPercentage: {
      type: Boolean,
      default: true,
    },
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  priority: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const discountSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['connection', 'early_bird', 'volume', 'promotion', 'custom'],
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  isPercentage: {
    type: Boolean,
    default: true
  },
  conditions: {
    minBookingValue: Number,
    maxDiscountAmount: Number,
    minAdvanceHours: Number,
    validFrom: Date,
    validUntil: Date,
    maxUsageCount: Number,
    userType: {
      type: String,
      enum: ['all', 'connected', 'returning']
    }
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const programRateSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  rate: rateSchema
}, { _id: false });

const PriceConfigurationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  baseRate: rateSchema,
  liveSessionRate: rateSchema,
  sessionTypeOverrides: [priceOverrideSchema],
  sessionTypeRates: [sessionTypeRateSchema],
  timeBasedRates: [timeBasedRateSchema],
  specialPeriods: [specialPeriodSchema],
  discounts: [discountSchema],
  programRates: [programRateSchema],
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive'],
    default: 'draft'
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveUntil: Date,
  metadata: {
    lastCalculation: Date,
    version: {
      type: Number,
      default: 1
    },
    migrationSource: String,
    legacyId: String
  }
}, {
  timestamps: true,
  collection: 'price_configurations'
});

// Indexes
PriceConfigurationSchema.index({ 'user': 1, 'status': 1 });
PriceConfigurationSchema.index({ 'user': 1, 'effectiveFrom': 1, 'effectiveUntil': 1 });
PriceConfigurationSchema.index({ 'user': 1, 'sessionTypeOverrides.sessionType': 1 });
PriceConfigurationSchema.index({ 'user': 1, 'timeBasedRates.sessionTypes': 1 });
PriceConfigurationSchema.index({ 'user': 1, 'specialPeriods.sessionTypes': 1 });

PriceConfigurationSchema.pre('validate', function(next) {
  logger.info('[PriceConfiguration] Pre-validate hook:', {
    userId: this.user,
    version: this.metadata?.version
  });

  // Ensure baseRate exists
  if (!this.baseRate) {
    this.baseRate = { amount: 0, currency: 'CHF' };
  }

  // Ensure arrays exist
  this.sessionTypeRates = this.sessionTypeRates || [];
  this.timeBasedRates = this.timeBasedRates || [];
  this.specialPeriods = this.specialPeriods || [];

  // Initialize metadata if needed
  if (!this.metadata) {
    this.metadata = {
      version: 1,
      lastCalculation: new Date()
    };
  }

  next();
});

// Pre-save middleware for validation
PriceConfigurationSchema.pre('save', function(next) {
  logger.info('[PriceConfiguration] Pre-save validation:', {
    coachId: this.coach,
    version: this.metadata.version
  });

  // Validate date ranges
  if (this.effectiveUntil && this.effectiveFrom >= this.effectiveUntil) {
    next(new Error('effectiveFrom must be before effectiveUntil'));
  }

  // Validate special periods
  this.specialPeriods.forEach(period => {
    if (period.startDate >= period.endDate) {
      next(new Error(`Special period "${period.name}" has invalid date range`));
    }
  });

  // Increment version on changes to pricing rules
  if (this.isModified('baseRate') || 
      this.isModified('sessionTypeOverrides') || 
      this.isModified('timeBasedRates') || 
      this.isModified('specialPeriods')) {
    this.metadata.version += 1;
    this.metadata.lastCalculation = new Date();
  }

  next();
});

// Methods
PriceConfigurationSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && 
         (!this.effectiveUntil || this.effectiveUntil > now) &&
         this.effectiveFrom <= now;
};

// method to find applicable discounts
PriceConfigurationSchema.methods.findApplicableDiscounts = function(bookingValue, advanceHours, userType) {
  return this.discounts.filter(discount => {
    if (!discount.active) return false;
    if (discount.conditions.minBookingValue && bookingValue < discount.conditions.minBookingValue) return false;
    if (discount.conditions.minAdvanceHours && advanceHours < discount.conditions.minAdvanceHours) return false;
    if (discount.conditions.validFrom && new Date() < discount.conditions.validFrom) return false;
    if (discount.conditions.validUntil && new Date() > discount.conditions.validUntil) return false;
    if (discount.conditions.userType && discount.conditions.userType !== 'all' && discount.conditions.userType !== userType) return false;
    return true;
  });
};

console.log('[PriceConfiguration] Model updated with discount schema and findApplicableDiscounts method');

// Statics
PriceConfigurationSchema.statics.findActiveForCoach = async function(userId) {
  logger.debug('[PriceConfiguration] Finding active configuration:', { userId });
  return this.findOne({
    user: userId,  // Changed from coach to user
    status: 'active',
    effectiveFrom: { $lte: new Date() },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: new Date() } }
    ]
  }).exec();
};

PriceConfigurationSchema.statics.findOrCreateForCoach = async function(userId) {
  logger.info('[PriceConfiguration] Finding or creating price configuration:', { userId });
  
  let config = await this.findOne({ 
    user: userId,  // Changed from coach to user
    status: 'active' 
  });
  
  if (!config) {
    logger.info('[PriceConfiguration] No active configuration found, creating new one:', { userId });
    
    // Verify coach exists before creating config
    const coach = await mongoose.model('Coach').findOne({ user: userId });
    if (!coach) {
      logger.error('[PriceConfiguration] Cannot create config - coach not found:', { userId });
      throw new Error('Coach not found');
    }
    
    config = new this({
      user: userId,  // Changed from coach to user
      status: 'active',
      baseRate: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'CHF' }
      },
      sessionTypeRates: [],
      timeBasedRates: [],
      specialPeriods: [],
      discounts: []
    });
    await config.save();
    
    logger.info('[PriceConfiguration] Created new configuration:', { 
      userId,
      configId: config._id
    });
  }
  
  return config;
};

const PriceConfiguration = mongoose.model('PriceConfiguration', PriceConfigurationSchema);

module.exports = PriceConfiguration;