const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { createCommentSchema } = require('../validations/commentValidation');

// Add comment to post (JWT required)
router.post('/:postId', verifyToken, validate(createCommentSchema), async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.userId; // Securely take from token

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const objectId = mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : postId;
    const Post = mongoose.model('Post');

    const comment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      text,
      createdAt: new Date()
    };

    const result = await Post.findOneAndUpdate(
      { _id: objectId },
      {
        $push: { comments: comment },
        $inc: { commentsCount: 1 }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get comments for post (public read — no auth needed)
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const objectId = mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : postId;
    const Post = mongoose.model('Post');
    const post = await Post.findOne({ _id: objectId });

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, data: post.comments || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete comment from post (JWT required + ownership enforced)
router.delete('/:postId/:commentId', verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const callerId = req.userId;

    const postObjectId = mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : postId;
    const commentObjectId = mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : commentId;

    const Post = mongoose.model('Post');

    // Verify caller owns the comment OR owns the post
    const post = await Post.findOne({ _id: postObjectId });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const comment = post.comments?.find(c => String(c._id) === String(commentObjectId));
    const postOwnerId = String(post.userId || '');
    const commentOwnerId = comment ? String(comment.userId || '') : '';

    if (commentOwnerId !== callerId && postOwnerId !== callerId) {
      return res.status(403).json({ success: false, error: 'Forbidden: not your comment' });
    }

    const result = await Post.findOneAndUpdate(
      { _id: postObjectId },
      {
        $pull: { comments: { _id: commentObjectId } },
        $inc: { commentsCount: -1 }
      },
      { new: true }
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
