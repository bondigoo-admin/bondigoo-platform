// Path: server/models/Connection.js
// This is the CORRECTED version you should have from before.

const mongoose = require('mongoose');
const User = require('./User'); 
const Coach = require('./Coach'); 

const ConnectionSchema = new mongoose.Schema({
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  notes: { type: String, maxlength: 500 },
  lastInteractionDate: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true }
});

ConnectionSchema.index({ coach: 1, client: 1 }, { unique: true });

ConnectionSchema.statics.findConnectionsForUser = async function(userId) {
  const connections = await this.find({
    $or: [{ coach: userId }, { client: userId }]
  }).populate('coach client initiator', 'firstName lastName email profilePicture role') // Ensure 'role' is populated
    .lean();

  for (let connection of connections) {
    const processParticipant = async (participantType) => {
      const participant = connection[participantType];
      if (participant && participant.role === 'coach') {
        const coachData = await Coach.findOne({ user: participant._id }).select('profilePicture').lean();
        if (coachData && coachData.profilePicture) {
          participant.coachProfilePicture = coachData.profilePicture;
        }
      }
    };
    await processParticipant('coach');
    await processParticipant('client');
    await processParticipant('initiator'); // Also process initiator if it can be 'otherUser'
  }
  return connections;
};

ConnectionSchema.methods.isInitiatedBy = function(userId) {
  return this.initiator.toString() === userId.toString();
};

ConnectionSchema.methods.getOtherUser = function(userId) {
  if (!this.coach || !this.client) return null; 
  const coachId = this.coach._id ? this.coach._id.toString() : this.coach.toString();
  const clientId = this.client._id ? this.client._id.toString() : this.client.toString();
  const selfId = userId.toString();

  if (selfId === coachId) return this.client;
  if (selfId === clientId) return this.coach;
  return null; 
};

ConnectionSchema.statics.findPendingConnectionsForUser = async function(userId) {
  const connections = await this.find({
    $or: [{ coach: userId }, { client: userId }],
    status: 'pending'
  }).populate('coach client initiator', 'firstName lastName email profilePicture role') 
    .lean();

  for (let connection of connections) {
    const processParticipant = async (participantType) => {
      const participant = connection[participantType];
      if (participant && participant.role === 'coach') {
        const coachData = await Coach.findOne({ user: participant._id }).select('profilePicture').lean();
        if (coachData && coachData.profilePicture) {
          participant.coachProfilePicture = coachData.profilePicture;
        }
      }
    };
    await processParticipant('coach');
    await processParticipant('client');
    await processParticipant('initiator');
  }
  return connections;
};

ConnectionSchema.methods.toJSON = function() {
  const obj = this.toObject({ virtuals: true }); 
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Connection', ConnectionSchema);