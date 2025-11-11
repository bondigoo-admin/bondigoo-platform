const mongoose = require('mongoose');
const crypto = require('crypto');

const CancellationPolicyTierSchema = new mongoose.Schema({
  hoursBefore: { type: Number, required: true },
  refundPercentage: { type: Number, required: true, min: 0, max: 100 },
  descriptionKey: { type: String }
}, { _id: false });

const OneOnOneReschedulingPolicySchema = new mongoose.Schema({
  allowClientInitiatedRescheduleHoursBefore: { type: Number, default: 24 },
  clientRescheduleApprovalMode: {
    type: String,
    enum: ['automatic_if_early', 'coach_approval_if_late', 'always_coach_approval'],
    default: 'coach_approval_if_late'
  },
  maxClientReschedulesPerBooking: { type: Number, min: 1, default: null }
}, { _id: false });

const OneOnOneCancellationPolicySchema = new mongoose.Schema({
  tiers: [CancellationPolicyTierSchema],
  minimumNoticeHoursClientCancellation: { type: Number, default: 4 },
  additionalNotes: { type: String },
  rescheduling: { type: OneOnOneReschedulingPolicySchema, default: () => ({}) }
}, { _id: false });

const WebinarCancellationPolicySchema = new mongoose.Schema({
  tiers: [CancellationPolicyTierSchema],
  minimumNoticeHoursClientCancellation: { type: Number, default: 24 },
  additionalNotes: { type: String }
}, { _id: false });

const CancellationPolicySchema = new mongoose.Schema({
  policyPreset: { 
    type: String, 
    enum: ['flexible', 'moderate', 'strict', 'custom'], 
    default: 'moderate' 
  },
  oneOnOne: { type: OneOnOneCancellationPolicySchema, default: () => ({
      tiers: [
        { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.oneOnOne.tier.full_refund_gt_24h" }
      ],
      minimumNoticeHoursClientCancellation: 24,
      additionalNotes: "",
      rescheduling: {
        allowClientInitiatedRescheduleHoursBefore: 24,
        clientRescheduleApprovalMode: 'coach_approval_if_late'
      }
    })
  },
  webinar: { type: WebinarCancellationPolicySchema, default: () => ({
      tiers: [
        { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.webinar.tier.full_refund_gt_24h" }
      ],
      minimumNoticeHoursClientCancellation: 24,
      additionalNotes: ""
    })
  },
  lastUpdated: { type: Date }
}, { _id: false });

const KpiConfigItemSchema = new mongoose.Schema({
  key: { type: String, required: true },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const CoachSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  headline: { type: String, maxlength: 120 },
  specialties: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' }],
  languages: [{
    language: { type: mongoose.Schema.Types.ObjectId, ref: 'Language' },
    strength: { 
      type: String, 
      enum: ['native', 'fluent', 'intermediate', 'basic'],
      default: 'intermediate'
    }
  }],
  educationLevels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EducationLevel' }],
  achievements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' }],
  coachingStyles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CoachingStyle' }],
  skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  bio: {
    type: [{
        id: { type: String, required: true },
        title: { type: String, trim: true, maxlength: 100 },
        content: { type: String, trim: true, maxlength: 2000 }
    }],
    default: []
  },
  education: [{
    degree: String,
    institution: String,
    year: Number
  }],
  experience: { type: Number },
  hourlyRate: { type: Number },
  rating: { type: Number, default: 0 },
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  profilePicture: {
    url: String,
    publicId: String
  },
  videoIntroduction: {
    publicId: String,
    url: String,
    duration: Number,
    thumbnail: String,
    trimStart: Number,
    trimEnd: Number
  },
  socialMedia: {
    linkedin: String,
    twitter: String,
    instagram: String,
    facebook: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending'
  },
  settings: {
   
    professionalProfile: {
      specialties: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' }],
      expertise: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expertise' }],
      hourlyRate: Number,
      currency: String,
      showTestimonials: Boolean,
      showReviews: Boolean,
    },
    availabilityManagement: {
      workingHours: {
        monday: { start: String, end: String },
        tuesday: { start: String, end: String },
        wednesday: { start: String, end: String },
        thursday: { start: String, end: String },
        friday: { start: String, end: String },
        saturday: { start: String, end: String },
        sunday: { start: String, end: String }
      },
      vacationMode: Boolean,
      vacationStart: Date,
      vacationEnd: Date,
      bufferTime: Number,
    },
    sessionManagement: {
      sessionTypes: [{
        name: String,
        duration: Number,
        price: Number,
        currency: String,
        isEnabled: Boolean
      }],
      maxSessionsPerDay: Number,
      maxSessionsPerWeek: Number,
      overtime: {
        allowOvertime: { type: Boolean, default: false },
        freeOvertimeDuration: { 
          type: Number, 
          default: 0,
          validate: {
            validator: Number.isFinite,
            message: 'Free overtime duration must be a valid number',
          },
          min: [0, 'Free overtime duration cannot be negative'],
        },
        paidOvertimeDuration: { 
          type: Number, 
          default: 0,
          validate: {
            validator: Number.isFinite,
            message: 'Paid overtime duration must be a valid number',
          },
          min: [0, 'Paid overtime duration cannot be negative'],
        },
        overtimeRate: { 
          type: Number, 
          default: 0,
          validate: {
            validator: Number.isFinite,
            message: 'Overtime rate must be a valid number',
          },
          min: [0, 'Overtime rate cannot be negative'],
        },
      },
      durationRules: {
        minDuration: { type: Number, default: 30 }, // minutes
        maxDuration: { type: Number, default: 120 }, // minutes
        defaultDuration: { type: Number, default: 60 }, // minutes
        durationStep: { type: Number, default: 15 }, // minutes
        allowCustomDuration: { type: Boolean, default: true }
      }
    },
    liveSession: {
      enableAutoCooldown: { type: Boolean, default: false },
      cooldownDurationMinutes: { type: Number, default: 5, min: 1, max: 30 }
    },
    clientManagement: {
      clientCapacity: Number,
      waitingListEnabled: Boolean,
      waitingListCapacity: Number,
    },
    paymentAndBilling: {
      isVatRegistered: { type: Boolean, default: false },
      vatNumber: { type: String },
      legalBusinessName: { type: String },
      taxId: { type: String },
      stripe: {
        accountId: String,
        accountType: { 
          type: String, 
          enum: ['express', 'standard', 'custom'], 
          default: 'express' 
        },
        accountStatus: {
          status: { 
            type: String,
            enum: ['pending', 'active', 'restricted', 'disabled'],
            default: 'pending'
          },
          restrictedReason: String,
          detailsSubmitted: Boolean,
          chargesEnabled: Boolean,
          payoutsEnabled: Boolean,
          requirementsProvided: [String],
          requirementsPending: [String],
          requirementsDue: [String],
          requirementsErrors: [{
            code: String,
            reason: String,
            resolveBy: Date
          }],
          lastChecked: { type: Date, default: Date.now },
          nextCheckDue: Date
        },
        payoutSettings: {
          schedule: {
            interval: { 
              type: String, 
              enum: ['manual', 'daily', 'weekly', 'monthly'], 
              default: 'weekly' 
            },
            weeklyAnchor: { 
              type: Number, 
              min: 1, 
              max: 7,
              validate: {
                validator: function(v) {
                  return this.settings?.paymentAndBilling?.stripe?.payoutSettings?.schedule?.interval !== 'weekly' || (v >= 1 && v <= 7);
                },
                message: 'Weekly anchor must be between 1 and 7'
              }
            },
            monthlyAnchor: {
              type: Number,
              min: 1,
              max: 31,
              validate: {
                validator: function(v) {
                  return this.settings?.paymentAndBilling?.stripe?.payoutSettings?.schedule?.interval !== 'monthly' || (v >= 1 && v <= 31);
                },
                message: 'Monthly anchor must be between 1 and 31'
              }
            }
          },
          defaultCurrency: { 
            type: String, 
            default: 'CHF'
          },
          minimumPayout: {
            amount: { type: Number, default: 50 },
            currency: { type: String, default: 'CHF' }
          }
        },
        capabilities: {
          cardPayments: { type: String, enum: ['active', 'inactive', 'pending'], default: 'inactive' },
          transfers: { type: String, enum: ['active', 'inactive', 'pending'], default: 'inactive' },
          sepaDebit: { type: String, enum: ['active', 'inactive', 'pending'], default: 'inactive' }
        },
        businessProfile: {
          mcc: { type: String, default: '8299' },
          name: String,
          url: String,
          supportEmail: String,
          supportPhone: String
        },
        metadata: mongoose.Schema.Types.Mixed
      },
      // Add other payment and billing related settings here
      paymentMethods: [{
        type: String,
        enabled: Boolean,
        settings: mongoose.Schema.Types.Mixed
      }]
    },

    platformFeeOverride: {
      type: {
        type: String,
        enum: ['ZERO_FEE', 'PERCENTAGE_DISCOUNT'],
        required: true
      },
      discountPercentage: {
        type: Number,
        min: 0,
        max: 100,
        required: function() { return this.type === 'PERCENTAGE_DISCOUNT'; }
      },
      appliesTo: {
        type: [String],
        enum: ['ALL', 'SCHEDULED_SESSIONS', 'LIVE_SESSIONS', 'PROGRAMS'],
        required: true,
        default: ['ALL']
      },
      effectiveUntil: {
        type: Date,
        default: null
      },
      adminNotes: {
        type: String,
        trim: true
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    },

    insuranceRecognition: {
      isRecognized: { type: Boolean, default: false, index: true },
      registries: [{
        _id: false,
        name: { type: String, required: true },
        therapistId: { type: String, trim: true },
        status: { 
          type: String, 
          enum: ['unverified', 'pending_review', 'verified', 'rejected'], 
          default: 'unverified' 
        },
        verificationDocument: {
          publicId: { type: String },
          filename: { type: String }
        },
        expiryDate: { type: Date },
        rejectionReasonKey: { type: String },
        adminNotes: { type: String },
        submittedAt: { type: Date },
        lastReviewedAt: { type: Date }
      }]
},
    
    marketingAndGrowth: {
      featuredCoach: Boolean,
      referralProgramEnabled: Boolean,
      referralReward: Number,
    },
    analyticsDashboard: {
      displayMetrics: [String],
      customReports: [String],
    },
    privacySettings: {
      calendarVisibility: String,
      showFullCalendar: Boolean,
      bookingPrivacy: String,
      requireApprovalNonConnected: Boolean,
      profilePrivacy: {
        bio: Boolean,
        specialties: Boolean,
        pricing: {
          type: String,
          enum: ['everyone', 'registered_users', 'connected_users', 'private'],
          default: 'everyone'
        }
      },
      sessionTypeVisibility: mongoose.Schema.Types.Mixed,
      availabilityNotifications: String,
      notificationGroups: [String],
      showEmail: Boolean,
      showPhone: Boolean
    },
      dashboardPreferences: {
      type: [{
        key: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        settings: mongoose.Schema.Types.Mixed
      }],
      default: undefined
    },
    dashboardKpiConfig: {
      type: [KpiConfigItemSchema],
      default: undefined
    },
    allowFirmBooking: {
      type: Boolean,
      default: true
    },
    firmBookingThreshold: {
      type: Number,
      default: 24
    },
      cancellationPolicy: {
     type: CancellationPolicySchema,
      default: () => ({
        oneOnOne: {
          tiers: [
            { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.oneOnOne.tier.full_refund_gt_24h" }
          ],
          minimumNoticeHoursClientCancellation: 24,
          additionalNotes: "",
          rescheduling: {
            allowClientInitiatedRescheduleHoursBefore: 24,
            clientRescheduleApprovalMode: 'coach_approval_if_late'
          }
        },
        webinar: {
          tiers: [
            { hoursBefore: 24, refundPercentage: 100, descriptionKey: "policy.webinar.tier.full_refund_gt_24h" }
          ],
          minimumNoticeHoursClientCancellation: 24,
          additionalNotes: ""
        },
        lastUpdated: new Date()
      })
    },
    bufferTimeBetweenSessions: {
      type: Number,
      default: 15
    },
    maxAdvanceBookingDays: {
      type: Number,
      default: 30
    },
    minNoticeForBooking: {
      type: Number,
      default: 24
    },
    timeZone: {
      type: String,
      default: 'UTC'
    },
    notificationPreferences: {
      email: Boolean,
      sms: Boolean,
      inApp: Boolean
    },
  },
  packages: [{
    name: String,
    description: String,
    sessionCount: Number,
    price: Number,
    currency: String
  }],

  onboardingStatus: {
    completed: { type: Boolean, default: false },
    lastStep: { type: String, default: 'welcome' }
  },

  isTopCoach: { type: Boolean, default: false },
}, {
  timestamps: true
});

CoachSchema.pre('save', function(next) {
  if (this.isModified('bio') || this.isNew) {
    if (typeof this.bio === 'string') {
      const content = this.bio.trim();
      this.bio = content ? [{
        id: crypto.randomUUID(),
        title: '',
        content: content,
      }] : [];
    } else if (Array.isArray(this.bio)) {
      // Keep section if it has an ID and EITHER a title OR content.
      // This prevents deleting a section while the user is typing content before adding a title.
      this.bio = this.bio.filter(b => 
        b && b.id && (b.title?.trim() || (b.content && b.content.replace(/<[^>]*>?/gm, '').trim()))
      );
    }
  }
  next();
});

CoachSchema.pre('save', function(next) {
  if (this.isModified('settings.cancellationPolicy')) {
    this.settings.cancellationPolicy.lastUpdated = new Date();
  }
  next();
});

CoachSchema.pre('save', function(next) {
  // If old path exists, migrate to new path
  if (this.isModified('settings.stripe') && this.settings?.stripe) {
    this.settings.paymentAndBilling = this.settings.paymentAndBilling || {};
    this.settings.paymentAndBilling.stripe = this.settings.stripe;
    this.settings.stripe = undefined;
  }

  if (this.isModified('settings.paymentAndBilling.stripe.payoutSettings.schedule')) {
    const schedule = this.settings?.paymentAndBilling?.stripe?.payoutSettings?.schedule;
    if (schedule) {
      if (schedule.interval !== 'weekly') {
        schedule.weeklyAnchor = undefined;
      }
      if (schedule.interval !== 'monthly') {
        schedule.monthlyAnchor = undefined;
      }
      if (schedule.interval === 'weekly' && !schedule.weeklyAnchor) {
        schedule.weeklyAnchor = 1;
      }
      if (schedule.interval === 'monthly' && !schedule.monthlyAnchor) {
        schedule.monthlyAnchor = 1;
      }
    }
  }
  next();
});

// Add virtual for Stripe account status
CoachSchema.virtual('stripeEnabled').get(function() {
  const stripe = this.settings?.paymentAndBilling?.stripe;
  return stripe?.accountStatus?.chargesEnabled && 
         stripe?.accountStatus?.payoutsEnabled && 
         stripe?.accountStatus?.status === 'active';
});

// Add method to check if coach can receive payments
CoachSchema.methods.canReceivePayments = function() {
  return this.stripeEnabled && 
         this.settings?.paymentAndBilling?.stripe?.capabilities?.cardPayments === 'active';
};

CoachSchema.pre('findOne', function(next) {
  this.populate({
    path: 'user',
    select: 'firstName lastName email billingDetails'
  });
  next();
});

CoachSchema.index({ headline: 'text', bio: 'text' });

CoachSchema.index({ rating: -1, review: -1 });

module.exports = mongoose.model('Coach', CoachSchema);