
// import mongoose from 'mongoose';

// const designSchema = new mongoose.Schema({
//   user: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   templateId: {
//     type: Number,
//     required: true
//   },
//   name: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   customization: {
//     color: String,
//     material: String,
//     size: String,
//     customName: String
//   },
//   price: {
//     type: Number,
//     required: true
//   },
//   imageUrl: {
//     type: String // In case we want to store a generated image URL later
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// export default mongoose.model('Design', designSchema);

// models/Design.js - Update this
import mongoose from 'mongoose';

const designSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  templateId: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  designType: { // ADD THIS FIELD - FIXES undefined issue
    type: String,
    enum: ['ai-generated', '3d-custom', 'custom'],
    default: 'ai-generated'
  },
  customization: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  price: {
    type: Number,
    required: true,
    default: 0
  },
  imageUrl: {
    type: String,
    required: false
  },
  preview: {
    type: String,
    required: false
  },
  cloudinaryUrl: { // ADD THIS for Cloudinary URLs
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: { // Optional: for tracking updates
    type: Date,
    default: Date.now
  }
});

// Update timestamp before saving
designSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('Design', designSchema);