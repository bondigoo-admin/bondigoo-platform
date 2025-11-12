const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const PaymentSchema = new mongoose.Schema({

 liveSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveSession',
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: function() {
      return !this.program && this.type !== 'adjustment';
    }
  },
   program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
  },
   invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
    payoutStatus: {
    type: String,
    enum: [
      'pending',
      'processing',
      'submitted',
      'paid_out',
      'failed',
      'not_applicable',
      'on_hold',
    ],
    default: 'pending',
  },
  stripeTransferId: { type: String, index: true },
  payoutProcessedAt: { type: Date },
  payoutAttempts: { type: Number, default: 0 },
  nextPayoutAttemptAt: { type: Date, index: true },
  coachPayoutStripeInvoiceId: { 
    type: String, 
    index: true, 
    sparse: true
  },
  payer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

coachStripeAccountId: {
    type: String,
    required: function() {
      return this.type !== 'adjustment';
    },
    index: true
  },

 type: {
    type: String,
    required: true,
    enum: [
      'charge',               // Represents a final, successful charge to a customer. THIS is what we'll sum for GTV.
      'program_purchase',     // A specific type of charge for programs.
      'authorization',        // A temporary hold for a manual capture payment (e.g., overtime). NOT revenue.
      'live_session_charge',  // The final, captured state of an initial live session authorization. IS GTV.
      'payout',               // Money going out to a coach.
      'refund',                // A refund transaction.
      'overtime_charge',       // The final, captured state of an overtime authorization. IS revenue.
      'adjustment'            // A manual adjustment, typically negative for post-payout refunds.
    ],
    default: 'charge' // Default to 'charge' to handle existing logic gracefully.
  },
  
  // Payment details
  amount: {
    base: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    vat: {
      rate: { type: Number, default: 8.1 },
      amount: { type: Number, default: 0 },
      included: { type: Boolean, default: true }
    },
    total: { type: Number, default: 0 },
    authorized: { type: Number },
    captured: { type: Number },
    refunded: { type: Number, default: 0 },
    currency: { type: String, default: 'CHF' }
  },

   discountApplied: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Discount' },
    code: { type: String },
    type: { type: String, enum: ['percentage', 'fixed', 'percent'] },
    value: { type: Number },
    amountDeducted: { type: Number }
  },

  // Status tracking
status: {
    type: String,
    enum: [
      'draft',
      'pending',     
      'processing',
      'authorized',   
      'pending_confirmation',   
      'completed',       
      'partially_captured', 
      'failed',           
      'capture_failed',   
      'cancelled',      
      'released',        
      'refunded',        
      'partially_refunded', 
      'disputed',
      'refund_failed',
      'pending_deduction',
      'deducted'
    ],
    default: 'draft'
  },

  priceSnapshot: { type: mongoose.Schema.Types.Mixed },

  translationsSnapshot: { type: mongoose.Schema.Types.Mixed },

  // Stripe integration
  stripe: {
    paymentIntentId: String,
    clientSecret: String,
    setupIntentId: String,
    customerId: String,
    paymentMethodId: String,
    chargeId: String,
    refundId: String,
    disputeId: String
  },

  // Payment method
  paymentMethod: {
    type: String,
    brand: String,
    last4: String,
    expiryMonth: Number,
    expiryYear: Number,
    isDefault: Boolean
  },

  // Refund tracking
refunds: [{
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ['succeeded', 'pending', 'failed', 'requires_action'], // Align with Stripe refund statuses
      required: true
    },
    stripeRefundId: { type: String, required: true, index: true },
    processedAt: { type: Date, default: Date.now },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Kept for internal tracking
    gatewayResponse: { type: mongoose.Schema.Types.Mixed } // Optional, for storing full Stripe response
  }],

  // Error handling
  error: {
    code: String,
    message: String,
    declineCode: String,
    retriable: Boolean
  },

  // Billing details
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    vatNumber: String
  },

  // Metadata
  metadata: {
    ip: String,
    userAgent: String,
    location: String,
    riskScore: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
PaymentSchema.index({ booking: 1 });
PaymentSchema.index({ liveSession: 1 });
PaymentSchema.index({ program: 1 });
PaymentSchema.index({ payer: 1 });
PaymentSchema.index({ recipient: 1 });
PaymentSchema.index({ 'stripe.paymentIntentId': 1 });
PaymentSchema.index({ createdAt: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ payoutStatus: 1 });

PaymentSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed') {
    const payoutEligibleTypes = ['charge', 'program_purchase', 'live_session_charge', 'overtime_charge'];
    if (payoutEligibleTypes.includes(this.type)) {
      if (!this.payoutStatus || this.payoutStatus === 'pending') {
          this.payoutStatus = 'pending';
          if (!this.nextPayoutAttemptAt) {
            const PAYOUT_DELAY_HOURS = parseFloat(process.env.PAYOUT_DELAY_HOURS || '24');
            const delayInMilliseconds = PAYOUT_DELAY_HOURS * 60 * 60 * 1000;
            this.nextPayoutAttemptAt = new Date(Date.now() + delayInMilliseconds);
          }
      }
    } else {
      this.payoutStatus = 'not_applicable';
    }
  }
  next();
});

PaymentSchema.pre('save', function(next) {
  if (this.isModified('priceSnapshot') && this.priceSnapshot) {
    const { netAfterDiscount, base } = this.priceSnapshot;
    
    if (typeof netAfterDiscount !== 'number' || isNaN(netAfterDiscount)) {
      const baseAmount = base?.amount?.amount;
      if (typeof baseAmount === 'number') {
        this.priceSnapshot.netAfterDiscount = baseAmount;
        logger.info(`[PaymentModel Pre-Save] Corrected invalid netAfterDiscount in priceSnapshot.`, { 
          paymentId: this._id || 'NEW',
          originalValue: netAfterDiscount,
          newValue: this.priceSnapshot.netAfterDiscount
        });
      }
    }
  }
  next();
});

// Middleware to sync Booking.payment.status
PaymentSchema.post('save', async function(doc) {
  try {
    if (doc.isModified('status')) {
      const Booking = mongoose.model('Booking');
      const newStatus = doc.status;

      // Map Payment statuses to Booking.payment statuses
      const statusMap = {
        'draft': 'pending',
        'pending': 'pending',
        'processing': 'payment_processing',
        'completed': 'completed',
        'failed': 'failed',
        'cancelled': 'cancelled',
        'refunded': 'refunded',
        'partially_refunded': 'partial_refund',
        'disputed': 'disputed'
      };

      const bookingStatus = statusMap[newStatus] || 'pending'; // Fallback to 'pending' if unmapped

      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: doc.booking, 'payment.paymentRecord': doc._id },
        { $set: { 'payment.status': bookingStatus } },
        { new: true }
      );

      if (updatedBooking) {
        logger.info('[PaymentModel] Synced Booking payment status', {
          paymentId: doc._id,
          bookingId: doc.booking,
          paymentStatus: newStatus,
          bookingPaymentStatus: bookingStatus,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.warn('[PaymentModel] No matching Booking found to update', {
          paymentId: doc._id,
          bookingId: doc.booking,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    logger.error('[PaymentModel] Failed to sync Booking payment status', {
      paymentId: doc._id,
      bookingId: doc.booking,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

PaymentSchema.virtual('formattedAmount').get(function() {
  if (!this.amount?.total) return '0.00 CHF';
  return `${this.amount.total.toFixed(2)} ${this.amount.currency}`;
});

PaymentSchema.virtual('isRefundable').get(function() {
  return ['completed'].includes(this.status) && 
         !['refunded', 'disputed'].includes(this.status);
});

module.exports = mongoose.model('Payment', PaymentSchema);