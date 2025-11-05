const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  lessons: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  }],
  isGated: { 
    type: Boolean, 
    default: false 
  },
  contentDuration: {
  minutes: { type: Number, default: 0 },
  isOverridden: { type: Boolean, default: false }
},
estimatedCompletionTime: {
  minutes: { type: Number, default: 0 },
  isOverridden: { type: Boolean, default: false }
}
}, {
  timestamps: true
});

module.exports = mongoose.model('Module', moduleSchema);