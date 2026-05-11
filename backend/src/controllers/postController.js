const Post = require('../models/Post');
const mongoose = require('mongoose');

// Create post
exports.createPost = async (req, res) => {
  try {
    const { userId, caption, imageUrls, hashtags, mentions, location } = req.body;

    if (!userId || !caption) {
      return res.status(400).json({ success: false, error: 'userId and caption required' });
    }

    const newPost = new Post({
      userId,
      caption,
      mediaUrls: imageUrls || [], // Model uses mediaUrls
      hashtags: hashtags || [],
      mentions: mentions || [],
      location: location || null,
    });

    await newPost.save();

    res.status(201).json({
      success: true,
      data: newPost
    });
  } catch (err) {
    console.error('[createPost] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get all posts
exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(); // Faster for read-only
      
    res.json({ success: true, data: posts || [] });
  } catch (err) {
    console.error('[getAllPosts] Error:', err);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
};

// Get post by ID
exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Post ID required' });

    // Try finding by _id first, then by custom 'id' field if available
    let post = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      post = await Post.findById(id).lean();
    }

    if (!post) {
      post = await Post.findOne({ id: id }).lean();
    }

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, data: post });
  } catch (err) {
    console.error(`[getPostById] Error fetching post ${req.params.id}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete post
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentUserId } = req.body;

    if (!id) return res.status(400).json({ success: false, error: 'Post ID required' });

    // 1. Find the post first to check ownership
    let post = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      post = await Post.findById(id);
    }
    
    if (!post) {
      post = await Post.findOne({ id: id });
    }

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // 2. Check ownership if currentUserId is provided
    if (currentUserId && String(post.userId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only delete your own posts' });
    }

    // 3. Delete the post
    await post.deleteOne();

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error(`[deletePost] Error deleting post ${req.params.id}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
};
