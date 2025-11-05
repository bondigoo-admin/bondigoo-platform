const mongoose = require('mongoose');

const SupportMessageSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  isInternalNote: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('SupportMessage', SupportMessageSchema);