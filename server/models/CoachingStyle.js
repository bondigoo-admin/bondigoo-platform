// models/CoachingStyle.js

const mongoose = require('mongoose');

const CoachingStyleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String
});

CoachingStyleSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('CoachingStyle', CoachingStyleSchema);