const mongoose = require('mongoose');

const EducationLevelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  order: { type: Number}
});

module.exports = mongoose.model('EducationLevel', EducationLevelSchema);