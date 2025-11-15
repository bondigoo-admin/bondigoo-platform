const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  dateOfBirth: { type: Date },
  role: { type: String, enum: ['client', 'coach', 'admin'], default: 'client' },
  salutation: {
    type: String,
    enum: ['mr', 'mrs', 'dr', 'prof', 'mx']
  },
  preferredLanguage: { type: String },
  coachingNeeds: [String],
  customGoals: [String],
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  profileVisibility: { 
    type: String, 
    enum: ['public', 'connections_only', 'private'],
    default: 'public'
  },
  bio: { type: String, default: '' },
  location: { type: String },
  occupation: { type: String },
  interests: [String],
  achievements: [String],
  profilePicture: {
    url: String,
    publicId: String
  },
  phone: { type: String },
  socialMedia: {
    linkedin: String,
    twitter: String,
    instagram: String,
    facebook: String
  },
  settings: {
    notificationPreferences: {
      email: { type: Boolean, default: true }, 
      inApp: { type: Boolean, default: true },
      emailPreferencesByCategory: {
        account_and_security: { type: Boolean, default: true },
        bookings_and_sessions: { type: Boolean, default: true },
        payments_and_earnings: { type: Boolean, default: true },
        platform_and_community: { type: Boolean, default: false }
      }
    },
    privacySettings: {
      showEmail: { type: Boolean, default: false },
      showPhone: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: true }, 
      showOccupation: { type: Boolean, default: true } 
    },
     language: { type: String, default: 'de' },
    timeZone: { type: String, default: 'UTC' },
    dateFormat: { type: String, default: 'DD.MM.YYYY' }, 
    timeFormat: { type: String, enum: ['12h', '24h'], default: '24h' },
    currency: { type: String, default: 'CHF' } 
  }, dashboardPreferences: {
      type: [{
        key: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        settings: mongoose.Schema.Types.Mixed
      }],
      default: undefined
    },
    adminDashboardKpiConfig: {
      type: [{
        key: { type: String, required: true },
        enabled: { type: Boolean, default: true }
      }],
      default: undefined
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'busy', 'on_break'],
    default: 'offline'
  },
  lastStatusUpdate: {
    type: Date
  },
    taxInfo: {
    lastIpAddress: { type: String }
  },
   tokenVersion: {
    type: Number,
    default: 0
  }, stripe: {
    customerId: String,
    accountId: String,
    setupIntentId: String,
    defaultPaymentMethod: String
  },
  paymentMethods: [{
    type: String,
    provider: String,
    brand: String,
    last4: String,
    expiryMonth: Number,
    expiryYear: Number,
    isDefault: Boolean,
    stripePaymentMethodId: String
  }],
   billingDetails: {
    name: String,
    company: String,
     accountType: {
      type: String,
      enum: ['personal', 'business'],
      default: 'personal'
    },
    companyName: String,
    vatNumber: String,
    address: {
      street: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      countryCode: String
    }
  },
  paymentPreferences: {
    defaultCurrency: { type: String, default: 'CHF' },
    savePaymentMethods: { type: Boolean, default: true },
    autoPayEnabled: { type: Boolean, default: false },
    invoiceDelivery: { type: String, enum: ['email', 'platform', 'both'], default: 'both' }
  },
  sessionHistory: [{
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    role: { type: String, enum: ['coach', 'participant'], required: true },
    completedAt: { type: Date }
  }],
  blockedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  backgrounds: [{
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  }],
  suspensionReason: { type: String },
  trustScore: { type: Number, default: 100, index: true },
  blockedByCount: { type: Number, default: 0 },
  flags: [
    {
      flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason: {
        type: String,
        enum: ['spam', 'harassment', 'hate_speech', 'impersonation', 'misinformation', 'inappropriate_content', 'inappropriate_profile', 'self_harm', 'violence', 'intellectual_property', 'other'],
        required: true
      },
      details: { type: String, trim: true, default: '' },
      status: { type: String, enum: ['pending', 'resolved_warning', 'resolved_suspension', 'resolved_dismissed'], default: 'pending' },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
    }
  ],
  moderation: {
    warningsCount: { type: Number, default: 0 }
  },
  suspension: {
    isSuspended: { type: Boolean, default: false, index: true },
    endsAt: { type: Date },
    type: { type: String, enum: ['read_only', 'full_lockout'] }
  },
  ltv: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'CHF' }
    },
  lastLogin: { type: Date },
  averageRating: { type: Number },
  profileCompleteness: { type: Number },
  totalSessions: { type: Number, default: 0 },
  totalEnrollments: { type: Number, default: 0 },
  hasActiveDispute: { type: Boolean, default: false },
  primaryGoal: [{
    type: String,
    enum: ['one_on_one', 'programs', 'live_sessions', 'webinars', 'exploring']
  }],
  preferredLearningStyle: { type: String, enum: ['live', 'scheduled', 'self_paced'] },
  experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  onboardingStatus: {
    completed: { type: Boolean, default: false },
    lastStep: { type: String, default: 'welcome' }
  },
  deletionRequest: {
    token: String,
    expires: Date
  },
  termsAcceptance: {
      version: { type: String, required: true },
      acceptedAt: { type: Date, required: true },
      ipAddress: { type: String, required: true }
    },
    privacyPolicyAcceptance: {
    version: { type: String},
    acceptedAt: { type: Date },
    ipAddress: { type: String }
}
  });


UserSchema.index({ 'blockedUsers.user': 1 });

UserSchema.pre('save', function(next) {
  console.log(`[UserModel] Saving user: ${this._id}, Email: ${this.email}`);
  next();
});

UserSchema.pre('findOneAndUpdate', function(next) {
  console.log(`[UserModel] Updating user: ${this._conditions._id}`);
  next();
});

console.log('[UserModel] User schema updated with additional settings fields');

module.exports = mongoose.model('User', UserSchema);