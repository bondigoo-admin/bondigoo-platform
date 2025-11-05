const mongoose = require('mongoose');

const EmailChangeRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  newEmail: {
    type: String,
    required: true,
  },
  verificationToken: {
    type: String,
    required: true,
    unique: true,
  },
  oldEmail: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 3600000), // 1 hour from now
    index: { expires: '1h' },
  },
});

module.exports = mongoose.model('EmailChangeRequest', EmailChangeRequestSchema);