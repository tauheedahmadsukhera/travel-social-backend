const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reporterId: { type: String, required: true },
  targetId: { type: String, required: true },
  targetType: { type: String, enum: ['post', 'user', 'comment', 'story'], required: true },
  reason: { type: String, required: true },
  details: String,
  status: { type: String, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Report || mongoose.model('Report', ReportSchema);
