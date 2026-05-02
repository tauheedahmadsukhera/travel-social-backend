const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Comment = mongoose.model('Comment');

// Helper to convert string to ObjectId safely
const toObjectId = (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
};

// --- Post Comments ---

// GET /api/posts/:postId/comments - Get all comments for a post
router.get('/posts/:postId/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.postId }).sort({ createdAt: -1 }).lean();
    
    // Enrich with latest user data
    const userIds = [...new Set(comments.map(c => c.userId).filter(Boolean))];
    const User = mongoose.model('User');
    const users = await User.find({
      $or: [
        { _id: { $in: userIds.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
        { firebaseUid: { $in: userIds } },
        { uid: { $in: userIds } }
      ]
    }).lean();

    const userMap = {};
    users.forEach(u => {
      const id = u._id.toString();
      const fuid = u.firebaseUid || u.uid;
      const avatar = u.avatar || u.photoURL || u.profilePicture || null;
      const name = u.displayName || u.name || 'User';
      if (id) userMap[id] = { avatar, name };
      if (fuid) userMap[fuid] = { avatar, name };
    });

    const enrichedComments = comments.map(c => ({
      ...c,
      userName: userMap[c.userId]?.name || c.userName || 'User',
      userAvatar: userMap[c.userId]?.avatar || c.userAvatar || null
    }));

    res.json({ success: true, data: enrichedComments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/comments - Add a comment to a post
router.post('/posts/:postId/comments', async (req, res) => {
  try {
    const { userId, userName, userAvatar, text } = req.body;
    if (!userId || !text) return res.status(400).json({ success: false, error: 'Missing userId or text' });

    const newComment = new Comment({
      postId: req.params.postId,
      userId,
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {},
      replies: []
    });
    await newComment.save();

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(req.params.postId, { $inc: { commentsCount: 1, commentCount: 1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.status(201).json({ success: true, id: newComment._id, data: newComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/posts/:postId/comments/:commentId - Edit a comment
router.patch('/posts/:postId/comments/:commentId', async (req, res) => {
  try {
    const { userId, text } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (String(comment.userId) !== String(userId)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    comment.text = text;
    comment.editedAt = new Date();
    await comment.save();
    res.json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId - Delete a comment
router.delete('/posts/:postId/comments/:commentId', async (req, res) => {
  try {
    const { userId } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (String(comment.userId) !== String(userId)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    await Comment.deleteOne({ _id: req.params.commentId });

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(req.params.postId, { $inc: { commentsCount: -1, commentCount: -1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Comment Reactions & Likes ---

// POST /api/posts/:postId/comments/:commentId/like - Like a comment
router.post('/posts/:postId/comments/:commentId/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    if (!comment.likes) comment.likes = [];
    if (comment.likes.includes(userId)) {
      return res.json({ success: false, error: 'Already liked' });
    }

    comment.likes.push(userId);
    comment.likesCount = comment.likes.length;
    await comment.save();
    res.json({ success: true, likesCount: comment.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/like - Unlike a comment
router.delete('/posts/:postId/comments/:commentId/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    if (comment.likes) {
      comment.likes = comment.likes.filter(id => String(id) !== String(userId));
      comment.likesCount = comment.likes.length;
      await comment.save();
    }
    res.json({ success: true, likesCount: comment.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/comments/:commentId/react - React to a comment
router.post('/posts/:postId/comments/:commentId/react', async (req, res) => {
  try {
    const { userId, emoji } = req.body;
    if (!userId || !emoji) return res.status(400).json({ success: false, error: 'userId and emoji required' });

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    if (!comment.reactions) comment.reactions = {};
    if (!comment.reactions[emoji]) comment.reactions[emoji] = [];

    const idx = comment.reactions[emoji].indexOf(userId);
    if (idx > -1) {
      comment.reactions[emoji].splice(idx, 1);
      if (comment.reactions[emoji].length === 0) delete comment.reactions[emoji];
    } else {
      comment.reactions[emoji].push(userId);
    }

    comment.markModified('reactions');
    await comment.save();
    res.json({ success: true, reactions: comment.reactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Comment Replies ---

// POST /api/posts/:postId/comments/:commentId/replies - Add reply
router.post('/posts/:postId/comments/:commentId/replies', async (req, res) => {
  try {
    const { userId, text, userName, userAvatar } = req.body;
    const { commentId } = req.params;

    const reply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {}
    };

    const result = await Comment.findByIdAndUpdate(
      commentId,
      { $push: { replies: reply }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    if (!result) return res.status(404).json({ success: false, error: 'Comment not found' });

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(req.params.postId, { $inc: { commentsCount: 1, commentCount: 1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.status(201).json({ success: true, id: reply._id, data: reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId - Delete reply
router.delete('/posts/:postId/comments/:commentId/replies/:replyId', async (req, res) => {
  try {
    const { commentId, replyId, postId } = req.params;
    const { userId } = req.body;

    const updated = await Comment.findByIdAndUpdate(
      commentId,
      { $pull: { replies: { _id: toObjectId(replyId) } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Comment not found' });

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: -1, commentCount: -1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.json({ success: true, message: 'Reply deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
