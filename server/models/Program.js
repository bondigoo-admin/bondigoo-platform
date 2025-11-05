const mongoose = require('mongoose');
const Module = require('./Module');
const Lesson = require('./Lesson');
const Enrollment = require('./Enrollment');
const SkillLevel = require('./SkillLevel');
const Language = require('./Language');
const cloudinary = require('../utils/cloudinaryConfig');

const discountSchema = new mongoose.Schema({
  code: { type: String },
  type: { type: String, enum: ['percent', 'fixed'] },
  value: { type: Number }
}, { _id: false });

const programSchema = new mongoose.Schema({
  coach: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String
  },
  subtitle: {
    type: String
  },
  description: {
    type: String
  },
  programImages: [{
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    isMain: { type: Boolean, default: false }
  }],
 trailerVideo: {
    publicId: String,
    url: String,
    duration: Number,
    thumbnail: String,
    width: Number,
    height: Number,
    trimStart: Number,
    trimEnd: Number
  },
learningOutcomes: [String],
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProgramCategory'
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true
  },
  modules: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module'
  }],
    isDiscussionEnabled: { 
    type: Boolean,
    default: true
  },language: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Language'
  }],
  skillLevel: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SkillLevel'
  }],
   availableContentTypes: {
    type: [String],
    index: true
  },
  enrollmentsCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  revenue: {
      type: Number,
      default: 0
  },
  totalLessons: {
    type: Number,
    default: 0
  },
contentDuration: {
  minutes: { type: Number, default: 0 },
  isOverridden: { type: Boolean, default: false }
},
estimatedCompletionTime: {
  minutes: { type: Number, default: 0 },
  isOverridden: { type: Boolean, default: false }
},
  basePrice: {
    amount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, default: 'CHF', enum: ['CHF', 'EUR', 'USD', 'GBP'] }
  },
  discount: discountSchema,
  priceLink: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionType',
    required: false
  },
 isFeatured: { type: Boolean, default: false, index: true },
  flags: [
    {
      flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason: {
        type: String,
        enum: ['spam', 'harassment', 'hate_speech', 'impersonation', 'misinformation', 'inappropriate_content', 'violence', 'intellectual_property', 'other'],
        required: true
      },
      details: { type: String, trim: true, default: '' },
      status: { type: String, enum: ['pending', 'resolved_archived', 'resolved_dismissed'], default: 'pending' },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
    }
  ],
}, {
  timestamps: true
});

programSchema.index({ learningOutcomes: 'text' });

programSchema.statics.recalculateAndSaveDerivedData = async function(programId) {
    console.log(`[Program Model] Starting derived data recalculation for program ${programId}.`);
    if (!mongoose.Types.ObjectId.isValid(programId)) {
        console.error(`[Program Model] Invalid programId provided: ${programId}`);
        return;
    }

    const lessons = await mongoose.model('Lesson').find({ program: programId }).select('contentType').lean();

    if (!lessons || lessons.length === 0) {
        console.log(`[Program Model] No lessons found for program ${programId}. Setting content types to [].`);
        await this.updateOne({ _id: programId }, { $set: { availableContentTypes: [] } });
        return;
    }

    const uniqueContentTypes = [...new Set(lessons.map(lesson => lesson.contentType))];
    
    console.log(`[Program Model] Found unique content types: [${uniqueContentTypes.join(', ')}] for program ${programId}.`);
    
    await this.updateOne({ _id: programId }, { $set: { availableContentTypes: uniqueContentTypes } });
    
    console.log(`[Program Model] Successfully saved derived data for program ${programId}.`);
};

programSchema.pre('remove', async function(next) {
    try {
        await Module.deleteMany({ program: this._id });
        await Lesson.deleteMany({ program: this._id });
        await Enrollment.deleteMany({ program: this._id });

        if (this.programImages && this.programImages.length > 0) {
            const publicIds = this.programImages.map(img => img.publicId).filter(Boolean);
            if (publicIds.length > 0) {
                await Promise.all(
                    publicIds.map(id => cloudinary.uploader.destroy(id))
                );
            }
        }
        if (this.trailerVideo && this.trailerVideo.publicId) {
             await cloudinary.uploader.destroy(this.trailerVideo.publicId, { resource_type: 'video' });
        }

        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('Program', programSchema);