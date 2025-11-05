const mongoose = require('mongoose');

const PackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  sessionTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SessionType' }],
  numberOfSessions: { type: Number, required: true },
  price: { type: Number, required: true },
  duration: { type: Number, required: true }, // in days
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Package', PackageSchema);