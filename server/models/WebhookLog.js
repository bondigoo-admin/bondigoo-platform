const mongoose = require('mongoose');

const WebhookLogSchema = new mongoose.Schema({
  source: { type: String, required: true }, // e.g., 'stripe'
  eventType: { type: String, required: true },
  payload: { type: String }, // Stringified JSON
  headers: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ['processed', 'failed'], required: true },
  errorMessage: { type: String },
}, { timestamps: true });

WebhookLogSchema.index({ status: 1, eventType: 1, createdAt: -1 });
WebhookLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WebhookLog', WebhookLogSchema);