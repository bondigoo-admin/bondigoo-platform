const mongoose = require('mongoose');

const SkillLevelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true, index: true },
  level: { type: Number, required: true, unique: true, index: true },
  description: { type: String, required: true },
  icon: { type: String, required: false },
  color: { type: String, required: false }
});

SkillLevelSchema.index({ name: 'text', code: 'text', description: 'text' });

module.exports = mongoose.model('SkillLevel', SkillLevelSchema);