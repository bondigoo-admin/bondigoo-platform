const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  goals: [String],
  coachingHistory: [{
    coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
    startDate: Date,
    endDate: Date
  }],
  preferences: {
    preferredCoachingStyles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CoachingStyle' }],
    preferredSessionTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SessionType' }]
  }
});

module.exports = mongoose.model('Client', ClientSchema);