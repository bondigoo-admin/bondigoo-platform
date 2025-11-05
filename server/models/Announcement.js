const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  content: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  startDate: { type: Date },
  endDate: { type: Date },
  type: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  
  displayLocation: { 
    type: String, 
    enum: ['global_banner', 'dashboard_widget', 'menu_badge'], 
    default: 'global_banner' 
  },
  targetedRoles: [{ 
    type: String, 
    enum: ['client', 'coach', 'admin'] 
  }],
  targetedUsers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  actionUrl: { type: String },
  actionText: { type: String },
  viewCount: { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },

}, { timestamps: true });

AnnouncementSchema.index({ isActive: 1, startDate: 1, endDate: 1, displayLocation: 1 });

AnnouncementSchema.pre('save', function(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    const err = new Error('End date cannot be before the start date.');
    return next(err);
  }
  if (this.targetedUsers && this.targetedUsers.length > 0) {
      this.targetedRoles = [];
  }
  next();
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);