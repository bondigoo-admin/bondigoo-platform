const mongoose = require('mongoose');

const SkillSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  description: String
});

SkillSchema.index({ name: 'text', category: 'text', description: 'text' });

module.exports = mongoose.model('Skill', SkillSchema);