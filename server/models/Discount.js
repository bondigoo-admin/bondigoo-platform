const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema({

  coach: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },

  code: { 
    type: String, 
    required: true, 
    uppercase: true, 
    trim: true 
  },
  type: { 
    type: String, 
    enum: ['percent', 'fixed'], 
    required: true 
  },
  value: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  },

  isAutomatic: {
    type: Boolean,
    default: false
  },

  appliesTo: {
    scope: { 
      type: String, 
      enum: ['platform_wide', 'all_programs', 'specific_programs', 'all_sessions', 'specific_session_types'], 
      required: true 
    },
    entityIds: [{ 
      type: mongoose.Schema.Types.ObjectId 
    }]
  },

  minimumPurchaseAmount: {
    type: Number,
    min: 0
  },

  eligibility: {
    type: {
        type: String,
        enum: ['all', 'segment', 'individual'],
        required: true,
        default: 'all'
    },
    entityIds: [{
        type: mongoose.Schema.Types.ObjectId
    }]
  },
  
  startDate: { 
    type: Date 
  },
  expiryDate: { 
    type: Date 
  },

  usageLimit: { 
    type: Number, 
    min: 1 
  },
  timesUsed: { 
    type: Number, 
    default: 0 
  },
  
  limitToOnePerCustomer: {
    type: Boolean,
    default: false
  }

}, { 
  timestamps: true 
});

discountSchema.index({ coach: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Discount', discountSchema);