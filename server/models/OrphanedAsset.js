const mongoose = require('mongoose');

const orphanedAssetSchema = new mongoose.Schema({
  // Core Cloudinary Identifiers
  publicId: { type: String, required: true, unique: true, index: true },
  resourceType: { type: String, required: true, enum: ['image', 'video', 'raw'] },
  
  // Contextual Information for Admin Review
  assetType: { type: String, default: 'unknown', index: true }, // e.g., 'profile_picture', 'program_asset'
  folder: { type: String },
  fileSize: { type: Number }, // in bytes
  format: { type: String },
  createdAtCloudinary: { type: Date }, // When the asset was created in Cloudinary
  
  // Workflow Management
  discoveredAt: { type: Date, default: Date.now, index: true },
  status: {
    type: String,
    enum: ['pending_review', 'deletion_queued', 'error'],
    default: 'pending_review',
    index: true
  },
}, { timestamps: true });

module.exports = mongoose.model('OrphanedAsset', orphanedAssetSchema);