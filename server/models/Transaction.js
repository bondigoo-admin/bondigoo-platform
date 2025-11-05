const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  // Core fields
booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program'
  },
   liveSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveSession'
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  type: {
    type: String,
    enum: ['charge', 'refund', 'payout', 'fee', 'transfer', 'dispute'],
    required: true
  },
  amount: {
    value: { type: Number },
    currency: { type: String, default: 'CHF' }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'disputed'],
    default: 'pending'
  },
  
  // Stripe-specific fields
  stripe: {
    transactionId: String,
    chargeId: String,
    transferId: String,
    refundId: String,
    balanceTransactionId: String
  },

  // VAT handling
  vat: {
    rate: { type: Number, default: 8.1 },
    amount: Number,
    included: { type: Boolean, default: true },
    number: String
  },

  // Metadata
  description: String,
  metadata: {
    ip: String,
    userAgent: String,
    location: String,
    riskScore: Number,
    refundPolicy: { type: String, enum: ['standard', 'platform_fault', 'goodwill'] },
    coachDebitAmount: { type: Number },
    platformFeeForfeited: { type: Number },
    vatReclaimed: { type: Number },
    stripeFeeLost: { type: Number }
  },

  // Error handling
  error: {
    code: String,
    message: String,
    declineCode: String,
    retriable: Boolean
  },

  // Timestamps handled by mongoose
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
TransactionSchema.index({ booking: 1, type: 1 });
TransactionSchema.index({ program: 1, type: 1 });
TransactionSchema.index({ liveSession: 1 });
TransactionSchema.index({ payment: 1 });
TransactionSchema.index({ 'stripe.transactionId': 1 });
TransactionSchema.index({ createdAt: 1 });
TransactionSchema.index({ status: 1 });

// Middleware
TransactionSchema.pre('save', function(next) {
  // Ensure VAT calculations are up to date
  if (this.amount?.value && (!this.vat?.amount || this.isModified('amount.value'))) {
    const vatRate = this.vat?.rate || 8.1;
    this.vat = {
      ...this.vat,
      amount: this.vat?.included
        ? this.amount.value - (this.amount.value / (1 + vatRate / 100))
        : this.amount.value * (vatRate / 100)
    };
  }
  next();
});

// Virtual for formatted amount
TransactionSchema.virtual('formattedAmount').get(function() {
  if (!this.amount?.value) return '0.00 CHF';
  return `${this.amount.value.toFixed(2)} ${this.amount.currency}`;
});

module.exports = mongoose.model('Transaction', TransactionSchema);