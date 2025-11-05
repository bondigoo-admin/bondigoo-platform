const mongoose = require('mongoose');

const PollOptionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  votes: { type: Number, default: 0 },
});

const PollSchema = new mongoose.Schema({
  // Link to the Session document using the MongoDB ObjectId
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  type: { type: String, enum: ['multiple', 'rating', 'open'], required: true },
  question: { type: String, required: true },
  options: [PollOptionSchema],
  // Store userIds who voted to prevent multiple votes
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  // Optional: createdBy if needed
  // createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Index for faster querying by session
PollSchema.index({ sessionId: 1 });

const Poll = mongoose.model('Poll', PollSchema);

module.exports = Poll;