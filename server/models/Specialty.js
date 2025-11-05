// models/Specialty.js

const mongoose = require('mongoose');

const SpecialtySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String
});

SpecialtySchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Specialty', SpecialtySchema);