const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    questionType: { type: String, enum: ['single_choice', 'multiple_choice'], default: 'single_choice' },
    options: [{
        text: { type: String, required: true },
        isCorrect: { type: Boolean, default: false }
    }],
    explanation: { type: String }
}, { _id: true });

const quizContentSchema = new mongoose.Schema({
    passingScore: { type: Number, min: 0, max: 100, default: 80 },
    questions: [questionSchema]
}, { _id: false });

const assignmentContentSchema = new mongoose.Schema({
    instructions: { type: String, required: true },
    submissionType: { type: String, enum: ['text', 'file_upload'], required: true }
}, { _id: false });

const fileSchema = new mongoose.Schema({
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileName: { type: String },
    mimeType: { type: String },
    thumbnail: { type: String },
    duration: { type: Number },
    width: { type: Number },
    height: { type: Number },
    resourceType: { type: String },
    trimStart: { type: Number },
    trimEnd: { type: Number },
}, { _id: false });

const overlaySchema = new mongoose.Schema({
    type: { type: String, enum: ['link', 'note'], required: true },
    position: { 
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
    },
    data: {
        url: String, // For 'link' type
        text: String, // For 'note' type
    }
}, { _id: true });

const resourceSchema = new mongoose.Schema({
    publicId: String,
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: Number,
    type: String,
}, { _id: false });

const slideSchema = new mongoose.Schema({
    order: { type: Number, required: true },
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String, required: true },
    audioUrl: String,
    audioPublicId: String,
    duration: Number, 
    waveform: [Number],
    resources: [resourceSchema],
    overlays: [overlaySchema],
    authorComment: String
}, { _id: true });

const presentationContentSchema = new mongoose.Schema({
    originalFileUrl: String,
    originalFilePublicId: String,
    slides: [slideSchema]
}, { _id: false });

const lessonSchema = new mongoose.Schema({
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
    index: true
  },
  module: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  contentType: {
    type: String,
    enum: ['video', 'text', 'document', 'quiz', 'assignment', 'presentation'],
    required: true
  },
  content: {
       text: String,
       quiz: quizContentSchema,
       assignment: assignmentContentSchema,
       files: [fileSchema],
       presentation: presentationContentSchema
     },
  contentDuration: {
    minutes: { type: Number, default: 0 },
    source: { type: String, enum: ['auto_video', 'manual'], default: 'manual' }
  },
  estimatedCompletionTime: {
    minutes: { type: Number, default: 0 }
},
  resources: [{
    name: String,
    url: String,
    publicId: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Lesson', lessonSchema);