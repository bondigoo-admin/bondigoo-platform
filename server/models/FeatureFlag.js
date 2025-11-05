const mongoose = require('mongoose');

const FeatureFlagSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  description: { type: String },
  isActive: { type: Boolean, default: false },
  rolloutPercentage: { type: Number, default: 0, min: 0, max: 100 },
  targetedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  targetedRoles: [{ type: String, enum: ['client', 'coach', 'admin'] }],
  targetedCountries: [String],
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('FeatureFlag', FeatureFlagSchema);