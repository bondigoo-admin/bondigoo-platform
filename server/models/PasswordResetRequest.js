const mongoose = require('mongoose');
const crypto =require('crypto');

const PasswordResetRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  resetToken: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // 1 hour
  }
});

module.exports = mongoose.model('PasswordResetRequest', PasswordResetRequestSchema);