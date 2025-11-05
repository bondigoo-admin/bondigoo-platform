const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const RescheduleHistoryEntrySchema = new mongoose.Schema({
  originalStart: { type: Date, required: true },
  originalEnd: { type: Date, required: true },
  newStart: { type: Date, required: true },
  newEnd: { type: Date, required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['approved_auto', 'approved_by_coach', 'approved_by_client', 'declined_by_coach', 'declined_by_client', 'counter_proposed', 'executed_coach_initiative'],
    required: true
  },
  actionTimestamp: { type: Date, default: Date.now },
  actorMessage: { type: String }
}, { _id: false });

const ProposedSlotSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true }
}, { _id: false });

const RescheduleRequestSchema = new mongoose.Schema({
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  proposedAt: { type: Date, default: Date.now },
  proposedSlots: [ProposedSlotSchema],
  requestMessage: { type: String },
  status: {
    type: String,
    enum: ['pending_coach_action', 'pending_client_action', 'approved', 'declined', 'countered', 'counter_proposed_by_coach', 'counter_proposed_by_client', 'pending_coach_approval'],
    required: true
  },
  decisionMessage: { type: String },
  decidedAt: { type: Date }
});

const BookingCourseMaterialSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String },
  fileType: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  _id: { type: mongoose.Schema.Types.ObjectId } // Match if Session's CourseMaterialSchema elements have _id
}); 

const ImageMetadataWithFlagSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String },
  fileType: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  isMain: { type: Boolean, default: false },
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true }
}, { _id: true });

const BookingFileMetadataSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String },
  fileType: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  _id: { type: mongoose.Schema.Types.ObjectId } // If materials have _ids from Session model
}, { _id: false });

const vatSchema = new mongoose.Schema({
  rate: { type: Number, default: 8.1 },
  amount: Number,
  included: { type: Boolean, default: true },
  number: String,
  country: String
}, { _id: false });

const amountCurrencySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  currency: { type: String, default: 'CHF' }
}, { _id: false });

const priceSchema = new mongoose.Schema({
  base: {
    amount: { type: amountCurrencySchema, required: true },
    currency: { type: String, default: 'CHF' }
  },
  final: {
    amount: { type: amountCurrencySchema, required: true },
    currency: { type: String, default: 'CHF' }
  },
  currency: { type: String, default: 'CHF' },
  vat: {
    rate: { type: Number, default: 8.1 },
    amount: Number,
    included: { type: Boolean, default: true }
  },
  platformFee: {
    percentage: { type: Number, default: 15 },
    amount: Number
  },
  discounts: [{
    _id: { type: mongoose.Schema.Types.ObjectId },
    code: { type: String },
    type: { type: String, enum: ['percent', 'fixed'] },
    value: { type: Number },
    amountDeducted: { type: Number }
  }],
  calculationMeta: {
    calculatedAt: Date,
    version: String
  }
}, { _id: false });

const PriceOverrideSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['standard', 'custom'],
    required: true,
    default: 'standard'
  },
  customRatePerHour: {
    amount: { type: Number, min: 0 },
    currency: { type: String, default: 'CHF' }
  },
  allowDiscounts: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const stripeSchema = new mongoose.Schema({
  paymentIntentId: String,
  clientSecret: String,
  chargeId: String,
  transferId: String,
  refundId: String,
  receiptUrl: String,
  paymentMethodId: String,
  setupIntentId: String,
  mandateId: String
}, { _id: false });

const paymentMethodSchema = new mongoose.Schema({
  type: String,
  provider: String,
  last4: String,
  expiryMonth: Number,
  expiryYear: Number,
  brand: String,
  isDefault: Boolean
}, { _id: false });

const payoutSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  scheduledDate: Date,
  completedDate: Date,
  stripeTransferId: String,
  amount: Number,
  currency: String
}, { _id: false });

const SlotSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true }
}, { _id: false });

const WebinarSlotSchema = new mongoose.Schema({
  date: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true }
}, { _id: false });

const CancellationTierSchema = new mongoose.Schema({
  hoursBefore: { type: Number, required: true, min: 0 },
  refundPercentage: { type: Number, required: true, min: 0, max: 100 },
  descriptionKey: String
}, { _id: false });

const ReschedulingPolicySchema = new mongoose.Schema({
  allowClientInitiatedRescheduleHoursBefore: { type: Number, min: 0 },
  clientRescheduleApprovalMode: { type: String, enum: ['automatic_if_early', 'coach_approval_if_late', 'always_coach_approval'] }
}, { _id: false });

const CancellationPolicyTypeSchema = new mongoose.Schema({
  tiers: [CancellationTierSchema],
  minimumNoticeHoursClientCancellation: { type: Number, min: 0 },
  additionalNotes: String,
  rescheduling: ReschedulingPolicySchema
}, { _id: false });

const CancellationPolicySchema = new mongoose.Schema({
  oneOnOne: CancellationPolicyTypeSchema,
  webinar: CancellationPolicyTypeSchema,
  lastUpdated: Date,
  policyPreset: String
}, { _id: false });

const BookingSchema = new mongoose.Schema({
  // Core fields
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],   
  isLiveSession: { type: Boolean, default: false },
  sessionType: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(v) {
        return mongoose.Types.ObjectId.isValid(v) || 
               (typeof v === 'object' && mongoose.Types.ObjectId.isValid(v.id || v._id));
      },
      message: 'Invalid sessionType format'
    }
  },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  timezone: { type: String, required: true },
  
  // Status with preserved enums
  status: { 
    type: String, 
    enum: [
      'requested',
      'firm_booked',
      'confirmed',
      'cancelled_by_coach',
      'cancelled_by_client',
      'completed',
      'no_show',
      'declined',
      'pending_minimum_attendees',
      'rescheduled',
      'scheduled',
      'pending_payment',
      'cancelled_by_admin',
      'pending_reschedule_client_request',
      'pending_reschedule_coach_request',
      'rescheduled_pending_attendee_actions',
      'cancelled_due_to_reschedule'
    ], 
    default: 'requested' 
  },

  // Modified price field to handle both formats
  price: {
    type: priceSchema,
    validate: {
      validator: function(v) {
        // Allow null for availability slots
        if (v === null) return true;
        
        // Require both base.amount.amount and final.amount.amount for real bookings
        if (!v.base?.amount?.amount || !v.final?.amount?.amount) return false;
        
        // Ensure currencies match at all levels
        const currencies = new Set([
          v.currency,
          v.base?.currency,
          v.base?.amount?.currency,
          v.final?.currency,
          v.final?.amount?.currency
        ].filter(Boolean));
        
        if (currencies.size > 1) return false;
        
        return true;
      },
      message: 'Invalid price format: must include base.amount.amount and final.amount.amount with matching currencies'
    }
  },

    priceOverride: {
    type: PriceOverrideSchema
  },

  // Original payment field
  payment: {
    paymentRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }, // New reference to Payment model
    status: { 
      type: String, 
      enum: [
        'pending',
        'payment_required',
        'payment_processing',
        'completed',
        'failed',
        'refunded',
        'partial_refund',
        'disputed',
        'cancelled'
      ],
      default: 'pending'
    },
    stripe: { type: stripeSchema }, // Kept for backward compatibility
    method: { type: paymentMethodSchema }, // Kept for backward compatibility
    payout: { type: payoutSchema }, // Kept for backward compatibility
    refunds: [{ // Kept for backward compatibility
      amount: Number,
      reason: String,
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
      },
      stripeRefundId: String,
      date: Date,
      initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      notes: String
    }],
    reminderSent: [{ // Add this explicitly
      type: String,
      enum: ['24hours', '48hours', '7days'], // Extensible for future payment reminder intervals
    }]
  },

  disputeTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', default: null },

   discountApplied: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Discount' },
    code: { type: String },
    type: { type: String, enum: ['percentage', 'fixed', 'percent'] },
    value: { type: Number },
    amountDeducted: { type: Number }
  },

  overtime: {
    type: {
      allowOvertime: { type: Boolean, default: false },
      freeOvertimeDuration: { 
        type: Number, 
        default: 0,
        validate: {
          validator: Number.isFinite,
          message: 'Free overtime duration must be a valid number'
        },
        min: [0, 'Free overtime duration cannot be negative']
      },
      paidOvertimeDuration: { 
        type: Number, 
        default: 0,
        validate: {
          validator: Number.isFinite,
          message: 'Paid overtime duration must be a valid number'
        },
        min: [0, 'Paid overtime duration cannot be negative']
      },
      overtimeRate: { 
        type: Number, 
        default: 0,
        validate: {
          validator: Number.isFinite,
          message: 'Overtime rate must be a valid number'
        }
      }
    },
    default: {
      allowOvertime: false,
      freeOvertimeDuration: 0,
      paidOvertimeDuration: 0,
      overtimeRate: 0
    }
  },

  // Original fields
  isAvailability: { type: Boolean, default: false },
  availableForInstantBooking: { type: Boolean, default: false },
  firmBookingThreshold: { type: Number, default: 24 },
  title: { type: String, required: true },
  description: String,
  location: String, 
  isOnline: { type: Boolean, default: false },
  language: String,
  tags: [String],
  cancellationPolicy: { type: CancellationPolicySchema },
  sessionGoal: String,
  clientNotes: String,
  preparationRequired: String,
  followUpTasks: String,
  minAttendees: Number,
  maxAttendees: Number,
  sessionTopic: String,
  prerequisites: String,
  learningObjectives: String,
  materialsProvided: String,
  whatToBring: String,
  skillLevel: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced', 'allLevels'] 
  },
  slots: { type: [SlotSchema], default: undefined }, 
  webinarSlots: { type: [WebinarSlotSchema], default: [] },
  webinarPlatform: String,
  webinarLink: String,
  presenterBio: String,
  qaSession: Boolean,
  recordingAvailable: Boolean,
  replayAccessDuration: Number,

  isPublic: { type: Boolean, default: true },
  showInWebinarBrowser: { type: Boolean, default: true },
  webinarLanguage: String,

  // Recurring pattern with backwards compatibility
  recurringPattern: {
    type: mongoose.Schema.Types.Mixed,
    default: 'none',
    validate: {
      validator: function(v) {
        if (typeof v === 'string') {
          return ['none', 'daily', 'weekly', 'biweekly', 'monthly'].includes(v);
        }
        if (typeof v === 'object' && v !== null) {
          return v.pattern && ['none', 'daily', 'weekly', 'biweekly', 'monthly'].includes(v.pattern);
        }
        return false;
      },
      message: 'Invalid recurring pattern format'
    }
  },
  recurringEndDate: Date,
  earlyBirdDeadline: { type: Date, default: null },
  earlyBirdPrice: { type: Number, default: null },

  // Original certification fields
  isPartOfPackage: Boolean,
  certificationOffered: Boolean,
  certificationDetails: String,

  // New fields (optional)
  bookingType: {
    type: String,
    enum: ['firm', 'request', 'recurring', 'package'],
    default: 'request'
  },

  attendees: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentIntentId: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'cancelled', 'attended', 'no_show', 'pending_reschedule_confirmation', 'confirmed_rescheduled', 'cancelled_due_to_reschedule'],
      default: 'confirmed'
    },
    joinedAt: Date,
    leftAt: Date,
    notes: String,
    feedback: {
      rating: Number,
      comment: String,
      submittedAt: Date
    },
    rescheduleStatus: { 
      type: String, 
      enum: ['confirmed_original', 'pending_reschedule_confirmation', 'confirmed_rescheduled', 'cancelled_due_to_reschedule'], 
      default: 'confirmed_original' 
    }
  }],

  suggestedTimes: [{
    start: Date,
    end: Date,
    suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    suggestedAt: { type: Date, default: Date.now },
    message: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    }
  }],

  waitlist: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: Date,
    priority: Number,
    status: {
      type: String,
      enum: ['waiting', 'offered', 'accepted', 'declined', 'expired'],
      default: 'waiting'
    }
  }],

  reminders: [{
    type: {
      type: String,
      enum: ['session', 'payment', 'follow_up', 'review', 'custom'], // Extensible types
      required: true
    },
    identifier: {
      type: String,
      required: true // e.g., '60min', '24hours', 'post_session'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    channels: [{
      type: String,
      enum: ['in_app', 'email', 'sms', 'push'], // Support multiple delivery channels
      default: 'in_app'
    }],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed, // Flexible key-value pairs for context
      default: {}
    }
  }],

  reminderSent: [{
    type: String,
    enum: ['60min', '30min', '15min', '5min']
  }],

  virtualMeeting: {
    platform: String,
    meetingId: String,
    passcode: String,
    joinUrl: String,
    hostUrl: String
  },

  sessionLink: {
    token: { type: String },
    sessionId: { type: String },
    generatedAt: { type: Date },
    expired: { type: Boolean, default: false },
  },

   virtualMeeting: {
    platform: String,
    meetingId: String,
    passcode: String,
    joinUrl: String,
    hostUrl: String
  },

  sessionImages: { type: [ImageMetadataWithFlagSchema], default: [] },
  courseMaterials: { type: [BookingCourseMaterialSchema], default: [] },

  cancellationReason: { type: String },
  rescheduleHistory: { type: [RescheduleHistoryEntrySchema], default: [] },
  rescheduleRequests: { type: [RescheduleRequestSchema], default: [] },

  analytics: {
    bookingSource: String,
    conversionTime: Number,
    marketingCampaign: String,
    utmParameters: {
      source: String,
      medium: String,
      campaign: String
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


// Query middleware to handle price conversion for existing documents
BookingSchema.pre('find', function() {
  this.lean(false);
});

BookingSchema.post('find', function(docs) {
  if (!Array.isArray(docs)) { // Handle findOne case
      if (docs && !docs.isAvailability && docs.price !== null && typeof docs.price === 'number') {
          const priceValue = docs.price;
          logger.info(`[Booking Model Post-FindOne] Converting numeric price for booking ${docs._id} to object structure.`);
          docs.price = {
              base: { amount: { amount: priceValue, currency: 'CHF' }, currency: 'CHF' },
              final: { amount: { amount: priceValue, currency: 'CHF' }, currency: 'CHF' },
              currency: 'CHF',
              vat: { rate: 8.1, amount: 0, included: true },
              platformFee: { percentage: 15, amount: 0 },
              discounts: [],
              calculationMeta: { calculatedAt: new Date(), version: '1.0-converted' }
          };
      }
      return;
  }
  docs.forEach(doc => {
    if (doc && !doc.isAvailability && doc.price !== null && typeof doc.price === 'number') {
      const priceValue = doc.price;
      logger.info(`[Booking Model Post-Find] Converting numeric price for booking ${doc._id} to object structure.`);
      doc.price = {
        base: { amount: { amount: priceValue, currency: 'CHF' }, currency: 'CHF' },
        final: { amount: { amount: priceValue, currency: 'CHF' }, currency: 'CHF' },
        currency: 'CHF',
        vat: { rate: 8.1, amount: 0, included: true },
        platformFee: { percentage: 15, amount: 0 },
        discounts: [],
        calculationMeta: { calculatedAt: new Date(), version: '1.0-converted' }
      };
    }
  });
});

BookingSchema.post('save', function(doc) {
  console.log(`[Booking Model] Booking saved successfully: ${doc._id}`);
});

BookingSchema.methods.getPaymentStatus = function() {
  return {
    status: this.payment?.status || 'pending',
    isRefundable: this.canBeRefunded(),
    refundAmount: this.calculateRefundAmount(),
    hasStripeIntent: !!this.payment?.stripe?.paymentIntentId
  };
};

BookingSchema.methods.canBeRefunded = function() {
  return this.payment?.status === 'completed' && 
         !['refunded', 'cancelled_by_coach', 'cancelled_by_client'].includes(this.status) &&
         this.calculateRefundAmount() > 0;
};


BookingSchema.methods.getPrice = function() {
  if (this.isAvailability) return null;
  if (!this.price) {
    logger.warn(`[BookingSchema.getPrice] Price field is null/undefined for booking ${this._id}`);
    return null;
  }

  if (this.price.base?.amount?.amount && this.price.final?.amount?.amount) {
    return this.price;
  }

  let baseAmountVal, currencyVal = 'CHF';
  let finalAmountVal;

  if (typeof this.price === 'number') {
    baseAmountVal = this.price;
    finalAmountVal = this.price; // Assume final is same as base if only a number is provided
    logger.warn(`[BookingSchema.getPrice] Numeric price found for ${this._id}. Converting to object.`);
  } else if (this.price.base && typeof this.price.base === 'number') { 
    baseAmountVal = this.price.base;
    finalAmountVal = this.price.final || this.price.base; // Fallback for older structure
    currencyVal = this.price.currency || 'CHF';
    logger.warn(`[BookingSchema.getPrice] Old object price format (numeric base) found for ${this._id}. Converting.`);
  } else if (this.price.base?.amount && typeof this.price.base.amount === 'number') { 
     baseAmountVal = this.price.base.amount;
     finalAmountVal = this.price.final?.amount || this.price.base.amount; // Fallback for older structure
     currencyVal = this.price.base.currency || this.price.currency || 'CHF';
     logger.warn(`[BookingSchema.getPrice] Intermediate object price format found for ${this._id}. Converting.`);
  } else {
    logger.error(`[BookingSchema.getPrice] Unknown or incomplete price format for booking ${this._id}:`, JSON.stringify(this.price));
    return { 
        base: { amount: { amount: 0, currency: 'CHF' }, currency: 'CHF' },
        final: { amount: { amount: 0, currency: 'CHF' }, currency: 'CHF' },
        currency: 'CHF',
        vat: { rate: 0, amount: 0, included: true },
        platformFee: { percentage: 0, amount: 0 },
        discounts: [],
        calculationMeta: { calculatedAt: new Date(), version: 'error-default-getprice-v2' }
    };
  }

  const convertedPriceStructure = {
      base: { amount: { amount: baseAmountVal, currency: currencyVal }, currency: currencyVal },
      final: { amount: { amount: finalAmountVal, currency: currencyVal }, currency: currencyVal },
      currency: currencyVal,
      vat: { rate: this.price.vat?.rate || 0, amount: this.price.vat?.amount || 0, included: this.price.vat?.included !== undefined ? this.price.vat.included : true },
      platformFee: { percentage: this.price.platformFee?.percentage || 0, amount: this.price.platformFee?.amount || 0 },
      discounts: this.price.discounts || [],
      calculationMeta: { calculatedAt: new Date(), version: '1.2-getprice-conversion' }
  };
  
  // Merge any existing valid parts from the original price object if it was an object
  if(typeof this.price === 'object' && this.price !== null) {
      if(this.price.vat && typeof this.price.vat === 'object') convertedPriceStructure.vat = {...convertedPriceStructure.vat, ...this.price.vat};
      if(this.price.platformFee && typeof this.price.platformFee === 'object') convertedPriceStructure.platformFee = {...convertedPriceStructure.platformFee, ...this.price.platformFee};
      if(Array.isArray(this.price.discounts)) convertedPriceStructure.discounts = this.price.discounts;
  }
  return convertedPriceStructure;
};

BookingSchema.methods.getRecurringPattern = function() {
  if (typeof this.recurringPattern === 'string') {
    return {
      pattern: this.recurringPattern,
      interval: 1,
      exceptions: []
    };
  }
  return this.recurringPattern;
};

BookingSchema.methods.canBeCancelled = function() {
  const now = new Date();
  const sessionStart = new Date(this.start);
  const hoursUntilSession = (sessionStart - now) / (1000 * 60 * 60);
  
  return this.status !== 'cancelled_by_coach' && 
         this.status !== 'cancelled_by_client' &&
         this.status !== 'completed' &&
         hoursUntilSession > 24;
};

BookingSchema.methods.calculateRefundAmount = function() {
  const now = new Date();
  const sessionStart = new Date(this.start);
  const hoursUntilSession = (sessionStart - now) / (1000 * 60 * 60);
  const price = this.getPrice();
  
  if (!price?.final?.amount) return 0;
  
  if (hoursUntilSession > 48) return price.final.amount;
  if (hoursUntilSession > 24) return price.final.amount * 0.5;
  return 0;
};

BookingSchema.virtual('recordings').get(async function() {
  try {
    const session = await Session.findOne({ bookingId: this._id });
    if (!session) {
      /*logger.warn('[BookingSchema.virtual.recordings] No session found', {
        bookingId: this._id.toString()
      });*/
      return [];
    }
    /*logger.info('[BookingSchema.virtual.recordings] Retrieved recordings', {
      bookingId: this._id.toString(),
      recordingCount: session.recordings.length
    });*/
    return session.recordings;
  } catch (error) {
   /* logger.error('[BookingSchema.virtual.recordings] Error fetching recordings', {
      bookingId: this._id.toString(),
      error: error.message,
      stack: error.stack
    });*/
    return [];
  }
});

// Virtuals
BookingSchema.virtual('duration').get(function() {
  if (!this.start || !this.end) return 0;
  return (new Date(this.end).getTime() - new Date(this.start).getTime()) / 60000; // duration in minutes
});


BookingSchema.virtual('spotsRemaining').get(function() {
  if (this.isAvailability || !this.maxAttendees || this.maxAttendees <= 0) return Infinity;
  
  const activeAttendeeStatuses = [
    'confirmed', 
    'attended', 
    'pending_reschedule_confirmation', 
    'confirmed_rescheduled'
  ];

  const activeAttendeesCount = this.attendees?.filter(attendee => 
    attendee.user && activeAttendeeStatuses.includes(attendee.status)
  ).length || 0;
  
  return this.maxAttendees - activeAttendeesCount;
});

let Booking;
try {
  Booking = mongoose.model('Booking');
} catch (error) {
  Booking = mongoose.model('Booking', BookingSchema);
}

module.exports = Booking;