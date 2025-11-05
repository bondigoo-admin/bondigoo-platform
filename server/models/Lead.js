const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  originalFilename: { type: String },
  resourceType: { type: String }
}, { _id: false });

const LeadSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  type: { type: String, required: true, enum: ['coach', 'client'] },
  ipAddress: { type: String },
  
  // Founder Coach Application Fields
  firstName: { type: String },
  lastName: { type: String },
  websiteUrl: { type: String },
  linkedInUrl: { type: String },
  primarySpecialties: [String],
  yearsOfExperience: { type: Number, min: 0 },
  clientDescription: { type: String },
  currentTools: [String],
  biggestAdminPainPoint: { type: String },
  motivationToJoin: { type: String },
  uploadedDocuments: [documentSchema],
  status: { type: String, enum: ['pending', 'reviewed', 'accepted', 'rejected'], default: 'pending', index: true },
  adminNotes: { type: String }

}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);