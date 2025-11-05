const mongoose = require('mongoose');

const LanguageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true }
});

LanguageSchema.index({ name: 'text', code: 'text' });

module.exports = mongoose.model('Language', LanguageSchema);