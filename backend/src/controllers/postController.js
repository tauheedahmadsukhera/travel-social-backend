const Post = require('../models/Post');
const mongoose = require('mongoose');

// Create post
exports.createPost = async (req, res) => {
  try {
    const { userId, caption, imageUrls, hashtags, mentions, location } = req.body;

    if (!userId || !caption) {
      return res.status(400).json({ success: false, error: 'userId and caption required' });
    }

    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');

    const newPost = {
      userId,
      caption,
      imageUrls: imageUrls || [],
      likes: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0,
      hashtags: hashtags || [],
      mentions: mentions || [],
      location: location || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await postsCollection.insertOne(newPost);

    res.status(201).json({
      success: true,
      data: { ...newPost, _id: result.insertedId }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get all posts
exports.getAllPosts = async (req, res) => {
  try {
    // Query the posts collection directly from MongoDB
    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');
    const posts = await postsCollection.find({}).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ success: true, data: posts || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
};

// Get post by ID
exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Post ID required' });

    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');

    // 1. Try finding by _id (ObjectId)
    let post = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      post = await postsCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    }

    // 2. If not found, try finding by custom 'id' field
    if (!post) {
      post = await postsCollection.findOne({ id: id });
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

    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');

    // 1. Find the post first to check ownership
    let post = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      post = await postsCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    if (!post) {
      post = await postsCollection.findOne({ id: id });
    }

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // 2. Check ownership if currentUserId is provided
    if (currentUserId && String(post.userId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only delete your own posts' });
    }

    // 3. Delete the post
    let deleteResult;
    if (mongoose.Types.ObjectId.isValid(id)) {
      deleteResult = await postsCollection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    } else {
      deleteResult = await postsCollection.deleteOne({ id: id });
    }

    if (deleteResult.deletedCount === 0) {
      return res.status(500).json({ success: false, error: 'Failed to delete post' });
    }

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error(`[deletePost] Error deleting post ${req.params.id}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
};
