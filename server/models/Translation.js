const mongoose = require('mongoose');

const TranslationSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  listType: {
    type: String,
    required: true
  },
  translations: {
    type: Map,
     of: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

module.exports = mongoose.model('Translation', TranslationSchema);