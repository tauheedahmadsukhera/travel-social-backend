const mongoose = require('mongoose');

const storyCommentSchema = new mongoose.Schema({
  userId:     { type: String, required: true },
  userName:   { type: String, default: 'Anonymous' },
  userAvatar: { type: String, default: null },
  text:       { type: String, required: true },
  editedAt:   { type: Date, default: null },
  createdAt:  { type: Date, default: Date.now },
}, { _id: true }); // Mongoose auto-generates ObjectId _id for each comment

const storySchema = new mongoose.Schema({
  userId: String,
  userName: String,
  userAvatar: String,
  image: String,
  video: String,
  thumbnail: String,
  caption: String,
  locationData: Object,
  postMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  isPostShare: Boolean,
  visibility: String,
  allowedFollowers: [String],
  isPrivate: Boolean,
  views: [String],
  likes: [String],
  comments: { type: [storyCommentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: { expires: 0 } }
});

storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ createdAt: -1 });
// Compound index for the active-stories feed: match expiresAt > now, sort by createdAt
storySchema.index({ expiresAt: 1, createdAt: -1 });

module.exports = mongoose.models.Story || mongoose.model('Story', storySchema);
