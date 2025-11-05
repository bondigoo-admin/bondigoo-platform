const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['open', 'in_progress', 'closed', 'awaiting_coach_response', 'escalated_to_admin', 'resolved', 'resolved_by_coach'], 
    default: 'open',
    index: true
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null,
    index: true,
  },
  
ticketType: { 
      type: String, 
      enum: ['general_inquiry', 'technical_support', 'refund_request', 'safety_report', 'appeal'], 
      default: 'general_inquiry',
      index: true
  },
  auditLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AuditLog', index: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true },
  requestedRefundAmount: { 
      amount: Number, 
      currency: String 
  },
  resolution: {
      action: { type: String, enum: ['refund_approved', 'refund_denied', 'no_action'] },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: { type: Date },
      finalRefundAmount: Number,
      adminNotes: String,
      policyApplied: { type: String, enum: ['standard', 'platform_fault', 'goodwill'] }
  },
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);