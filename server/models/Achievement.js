// models/Achievement.js

const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  icon: String,
  criteria: { type: String, required: true },
  points: { type: Number, default: 0 }
});

AchievementSchema.index({ name: 'text', description: 'text', criteria: 'text' });

module.exports = mongoose.model('Achievement', AchievementSchema);