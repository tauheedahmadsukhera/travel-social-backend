const mongoose = require('mongoose');

const VerificationRequestSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['Travel Blogger', 'Influencer', 'Photographer', 'Journalist', 'Business', 'Other'],
  },
  documentUrl: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

VerificationRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for sorting/filtering performance
VerificationRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.VerificationRequest || mongoose.model('VerificationRequest', VerificationRequestSchema);
