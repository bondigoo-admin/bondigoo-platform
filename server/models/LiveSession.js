const mongoose = require('mongoose');

const ParticipantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastHeartbeat: { type: Date }
}, { _id: false });

const PresentParticipantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    socketId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const liveSessionSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  participants: [ParticipantSchema],
  presentParticipants: [PresentParticipantSchema], 
  status: {
    type: String,
    // Enhanced enum for clearer analytics and state management
    enum: [
        'requested',            // CORRECT: Client initiated request. 'pending' was incorrect.
        'accepted',             // Coach accepted, awaiting client payment authorization
        'declined',             // Coach rejected request
        'client_cancelled',     // Client cancelled before session start
        'pending_authorization',// Awaiting client's stripe.confirmCardPayment()
        'handshake_pending',  // Payment secured, waiting for both users to join the video call page
        'in_progress',          // Session is active and being billed
        'completed',            // Session ended successfully with payment capture/release
        'completed_payment_failed', // Session ended, but final payment capture failed
        'error_auth_failed',    // Failed at initial authorization step
        'error_reauth_failed',   // Failed during a re-authorization attempt
        `pending_settlement`,
    ],
     required: true
  },
basePerMinuteRate: {
    amount: { type: Number, required: true },
    currency: { type: String, required: true }
  },
  effectivePerMinuteRate: {
    amount: { type: Number, required: true },
    currency: { type: String, required: true }
  },
  discountApplied: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Discount' },
    code: { type: String },
    type: { type: String, enum: ['percent', 'fixed', 'percentage'] },
    value: { type: Number },
    amountDeducted: { type: Number }
  },
  startTime: { type: Date },
  endTime: { type: Date },
  durationInSeconds: { type: Number, default: 0 },
  finalCost: {
    grossAmount: Number,
    netAmount: Number,
    platformFeeAmount: Number,
    taxAmount: Number,
    taxRate: Number,
    currency: String
  },
  paymentRecords: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
  }],
  cancellationReason: { type: String }, // For storing decline messages or system errors
  clientFeedbackRating: { type: Number, min: 1, max: 5 },
  coachFeedbackRating: { type: Number, min: 1, max: 5 },
  clientPrivateNotes: { type: String },
  sessionLink: {
    sessionId: { type: String, unique: true, sparse: true },
    token: { type: String },
    generatedAt: { type: Date },
    expired: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('LiveSession', liveSessionSchema);