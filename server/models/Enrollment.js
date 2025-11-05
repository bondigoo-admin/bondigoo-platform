const mongoose = require('mongoose');

const submissionFileSchema = new mongoose.Schema({
    url: String,
    publicId: String,
    name: String,
    type: String,
    size: Number,
    resource_type: String
}, { _id: false });

const slideNoteSchema = new mongoose.Schema({
    slideId: { type: mongoose.Schema.Types.ObjectId, required: true },
    note: { type: String }
}, { _id: false });

const submissionSchema = new mongoose.Schema({
    text: String,
    files: [submissionFileSchema],
    submittedAt: Date,
    presentationNotes: [slideNoteSchema],
    lastViewedSlideIndex: { type: Number, default: 0 },
    isReviewed: { type: Boolean, default: false },
}, { _id: false });

const lessonProgressSchema = new mongoose.Schema({
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    status: { type: String, enum: ['not_started', 'in_progress', 'completed', 'submitted', 'reviewed'], default: 'not_started' },
    score: { type: Number },
    submission: submissionSchema,
    attempts: { type: Number, default: 0 },
    completedFileIds: [String]
}, { _id: false });


const enrollmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
    index: true
  },
    payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: false
  },
  progress: {
    completedLessons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    }],
    lastViewedLesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    },
    totalLessons: {
      type: Number,
      required: true
    },
    lessonDetails: [lessonProgressSchema]
  },
 status: {
    type: String,
    enum: ['pending_payment', 'active', 'completed'],
    default: 'pending_payment'
  },
  hasReviewed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Enrollment', enrollmentSchema);