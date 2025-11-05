const mongoose = require('mongoose');

const discountUsageSchema = new mongoose.Schema({
  discount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Discount',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

discountUsageSchema.index({ discount: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('DiscountUsage', discountUsageSchema);