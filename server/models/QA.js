const mongoose = require('mongoose');

const QASchema = new mongoose.Schema({
  // Link to the Session document using the MongoDB ObjectId
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Who asked
  question: { type: String, required: true },
  approved: { type: Boolean, default: false }, // Moderation status
  answered: { type: Boolean, default: false }, // Optional: Track if answered
  answer: { type: String, default: '' },
  answerText: { type: String }, // Optional: Store answer text
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for faster querying by session
QASchema.index({ sessionId: 1 });

const QA = mongoose.model('QA', QASchema);

module.exports = QA;