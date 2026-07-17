const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { notificationQueue } = require('../services/queue');
const { verifyToken, optionalAuth } = require('../src/middleware/authMiddleware');
const validate = require('../src/middleware/validateMiddleware');
const { createCommentSchema } = require('../src/validations/commentValidation');


const Comment = require('../src/models/Comment');

// Helper to convert string to ObjectId safely
const toObjectId = (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
};

// --- Post Comments ---

// GET /api/posts/:postId/comments - Get all comments for a post (with visibility check)
router.get('/:postId/comments', optionalAuth, async (req, res) => {
  try {
    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const postId = cleanPostId;
    const viewerId = req.userId || null;
    
    // 1. Resolve Post (Handle both ObjectId and String ID)
    const Post = mongoose.model('Post');
    const postQuery = {
      $or: [
        { id: postId },
        { _id: mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : null }
      ].filter(q => q._id !== null || q.id)
    };

    let postObj = await Post.findOne(postQuery).lean();
    
    if (!postObj) {
      // It might be a deleted story that still exists in a Highlight snapshot.
      // We will skip visibility check and just return the comments from the collection.
    } else {
      // 2. SECURITY: Check visibility for private posts
      // We manually fetch the owner because Post.userId is a String (not a ref)
      const User = mongoose.model('User');
      const postOwnerId = postObj.userId;
      const postOwner = await User.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(postOwnerId) ? new mongoose.Types.ObjectId(postOwnerId) : null },
          { firebaseUid: postOwnerId },
          { uid: postOwnerId }
        ].filter(q => q._id !== null || q.firebaseUid || q.uid)
      }).select('isPrivate firebaseUid uid _id').lean();

      if (postOwner?.isPrivate || postObj.isPrivate) {
        if (!viewerId) {
          return res.status(403).json({ success: false, error: 'Private content: Please log in to view comments', data: [] });
        }

        const viewer = await resolveUserIdentifiers(viewerId);
        
        const isSelf = viewer.candidates.some(c => 
          [String(postOwner?._id), postOwner?.firebaseUid, postOwner?.uid].filter(Boolean).includes(String(c))
        );

        if (!isSelf) {
          const Follow = mongoose.model('Follow');
          const isFollowing = await Follow.findOne({
            followerId: { $in: viewer.candidates },
            followingId: { $in: [String(postOwner?._id), postOwner?.firebaseUid, postOwner?.uid].filter(Boolean) }
          }).lean();

          if (!isFollowing) {
            return res.status(403).json({ success: false, error: 'Private content: You must follow this user to view comments', data: [] });
          }
        }
      }
    }
    
    // 2. Fetch comments from dedicated collection using aggregation for author data
    const postIdCandidates = [postId];
    if (postObj?.id) postIdCandidates.push(String(postObj.id));
    if (postObj?._id) postIdCandidates.push(String(postObj._id));
    
    // Fetch comments directly using the index on postId and createdAt
    const comments = await Comment.find({ postId: { $in: postIdCandidates } })
      .sort({ createdAt: -1 })
      .lean();

    // Extract all unique user IDs from comments and replies
    const userIds = new Set();
    comments.forEach(c => {
      if (c.userId) userIds.add(String(c.userId));
      if (Array.isArray(c.replies)) {
        c.replies.forEach(r => {
          if (r.userId) userIds.add(String(r.userId));
        });
      }
    });

    // Also extract user IDs from legacy inline comments to map them
    const inlineComments = Array.isArray(postObj?.comments) ? postObj.comments : 
                         (Array.isArray(postObj?.post_comments) ? postObj.post_comments : 
                         (Array.isArray(postObj?.replies) ? postObj.replies : []));
    inlineComments.forEach(c => {
      if (c.userId) userIds.add(String(c.userId));
      if (Array.isArray(c.replies)) {
        c.replies.forEach(r => {
          if (r.userId) userIds.add(String(r.userId));
        });
      }
    });

    // Early exit optimization: save queries if there are no comments
    if (comments.length === 0 && inlineComments.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Bulk resolve all user details using Redis cache first
    const cache = require('../src/utils/redis');
    const userMap = new Map();
    const missingIds = [];

    for (const id of userIds) {
      try {
        const cached = await cache.get(`user:profile:${id}`);
        if (cached) {
          userMap.set(id, cached);
        } else {
          missingIds.push(id);
        }
      } catch (e) {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0) {
      const objectIds = [];
      const stringIds = [];
      missingIds.forEach(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          objectIds.push(new mongoose.Types.ObjectId(id));
        }
        stringIds.push(id);
      });

      const User = mongoose.model('User');
      const users = await User.find({
        $or: [
          { _id: { $in: objectIds } },
          { firebaseUid: { $in: stringIds } },
          { uid: { $in: stringIds } }
        ]
      }).select('displayName name username email avatar photoURL profilePicture firebaseUid uid isVerified').lean();

      users.forEach(user => {
        const avatarUrl = user.avatar || user.photoURL || user.profilePicture || null;
        
        const displayName = (user.displayName || '').trim();
        const name = (user.name || '').trim();
        const username = (user.username || '').trim();
        const email = (user.email || '').trim();
        
        let resolvedName = displayName || name || username;
        const isPlaceholder = !resolvedName || 
                              resolvedName.toLowerCase() === 'user' || 
                              resolvedName.toLowerCase() === 'unknown';
        if (isPlaceholder) {
          if (email && email.includes('@')) {
            resolvedName = email.split('@')[0];
          } else if (username) {
            resolvedName = username;
          } else {
            resolvedName = 'User';
          }
        }
        
        const profile = {
          userName: resolvedName,
          userAvatar: avatarUrl,
          verified: user.isVerified || false
        };
        
        // Cache user profile details for 5 minutes (300 seconds)
        cache.set(`user:profile:${String(user._id)}`, profile, 300).catch(() => {});
        if (user.firebaseUid) cache.set(`user:profile:${String(user.firebaseUid)}`, profile, 300).catch(() => {});
        if (user.uid) cache.set(`user:profile:${String(user.uid)}`, profile, 300).catch(() => {});

        userMap.set(String(user._id), profile);
        if (user.firebaseUid) userMap.set(String(user.firebaseUid), profile);
        if (user.uid) userMap.set(String(user.uid), profile);
      });
    }

    // Helper to enrich a single comment object
    const enrichComment = (c) => {
      const uId = String(c.userId || '');
      const profile = userMap.get(uId);
      const enriched = {
        ...c,
        id: String(c._id || c.id),
        userName: profile?.userName || c.userName || 'User',
        userAvatar: profile?.userAvatar || c.userAvatar || null,
        verified: profile?.verified || false
      };

      if (Array.isArray(c.replies)) {
        enriched.replies = c.replies.map(r => {
          const ruId = String(r.userId || '');
          const rProfile = userMap.get(ruId);
          return {
            ...r,
            id: String(r._id || r.id),
            userName: rProfile?.userName || r.userName || 'User',
            userAvatar: rProfile?.userAvatar || r.userAvatar || null,
            verified: rProfile?.verified || false
          };
        });
      }
      return enriched;
    };

    const enrichedComments = comments.map(enrichComment);

    console.log(`[GET comments] Found ${enrichedComments.length} collection comments.`);

    // 3. Attempt to extract inline comments (Legacy fallback)
    if (inlineComments.length > 0) {
      // Merge logic if there are inline comments
      const commentMap = new Map();
      inlineComments.forEach((c, index) => {
        const id = String(c._id || c.id || `legacy-${index}`);
        commentMap.set(id, {
          ...c,
          _id: id,
          id: id,
          text: c.text || c.content || c.message || c.comment || ""
        });
      });
      enrichedComments.forEach(c => commentMap.set(String(c._id), c));
      
      const finalComments = Array.from(commentMap.values())
        .filter(c => (c.text || "").trim().length > 0)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      
      return res.json({ success: true, data: finalComments });
    }

    res.json({ success: true, data: enrichedComments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/comments/:commentId/like - Like a comment
router.post('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const { commentId } = req.params;
    const postId = cleanPostId;
    
    // 1. Try finding in Comment collection first
    let comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });
    
    if (comment) {
      if (!comment.likes) comment.likes = [];
      if (!comment.likes.includes(userId)) {
        comment.likes.push(userId);
        comment.likesCount = comment.likes.length;
        await comment.save();

        // Notify comment author
        if (comment.userId && String(comment.userId) !== String(userId)) {
          try {
            const User = mongoose.model('User');
            const sender = await User.findById(userId).select('displayName name').lean();
            const senderName = sender?.displayName || sender?.name || 'Someone';

            notificationQueue.add('commentLike', {
              userId: comment.userId,
              senderId: userId,
              title: 'Comment Liked! ❤️',
              body: `${senderName} liked your comment: "${comment.text.substring(0, 40)}${comment.text.length > 40 ? '...' : ''}"`,
              data: { postId, type: 'COMMENT_LIKE', screen: 'home' }
            }).catch(() => {});
          } catch (notiErr) {
            console.warn('Comment like notification warning:', notiErr.message);
          }
        }
      }
      return res.json({ success: true, likesCount: comment.likesCount });
    }

    // 2. Fallback: Try finding and updating in Post document (Legacy inline comments)
    const Post = mongoose.model('Post');
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Look for legacy fields
    const fields = ['comments', 'post_comments', 'replies'];
    let updated = false;
    let newLikesCount = 0;

    for (const field of fields) {
      if (Array.isArray(post[field])) {
        const idx = post[field].findIndex(c => String(c._id || c.id) === String(commentId));
        if (idx > -1) {
          const c = post[field][idx];
          if (!c.likes) c.likes = [];
          if (!c.likes.includes(userId)) {
            c.likes.push(userId);
            c.likesCount = c.likes.length;

            // Notify comment author (Legacy inline)
            if (c.userId && String(c.userId) !== String(userId)) {
              try {
                const User = mongoose.model('User');
                const sender = await User.findById(userId).select('displayName name').lean();
                const senderName = sender?.displayName || sender?.name || 'Someone';

                notificationQueue.add('commentLike', {
                  userId: c.userId,
                  senderId: userId,
                  title: 'Comment Liked! ❤️',
                  body: `${senderName} liked your comment: "${(c.text || c.content || '').substring(0, 40)}"`,
                  data: { postId, type: 'COMMENT_LIKE', screen: 'home' }
                }).catch(() => {});
              } catch (notiErr) {
                console.warn('Comment like notification warning:', notiErr.message);
              }
            }
          }
          newLikesCount = c.likesCount;
          post.markModified(field);
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      await post.save();
      return res.json({ success: true, likesCount: newLikesCount });
    }

    res.status(404).json({ success: false, error: 'Comment not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/like - Unlike a comment
router.delete('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const { commentId } = req.params;
    const postId = cleanPostId;

    // 1. Try Comment collection
    let comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });

    if (comment) {
      if (comment.likes) {
        comment.likes = comment.likes.filter(id => String(id) !== String(userId));
        comment.likesCount = comment.likes.length;
        await comment.save();
      }
      return res.json({ success: true, likesCount: comment.likesCount });
    }

    // 2. Try Post document (Legacy)
    const Post = mongoose.model('Post');
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const fields = ['comments', 'post_comments', 'replies'];
    let updated = false;
    let newLikesCount = 0;

    for (const field of fields) {
      if (Array.isArray(post[field])) {
        const idx = post[field].findIndex(c => String(c._id || c.id) === String(commentId));
        if (idx > -1) {
          const c = post[field][idx];
          if (c.likes) {
            c.likes = c.likes.filter(id => String(id) !== String(userId));
            c.likesCount = c.likes.length;
          }
          newLikesCount = c.likesCount;
          post.markModified(field);
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      await post.save();
      return res.json({ success: true, likesCount: newLikesCount });
    }

    res.status(404).json({ success: false, error: 'Comment not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/comments - Add a comment to a post
router.post('/:postId/comments', verifyToken, validate(createCommentSchema), async (req, res) => {
  try {
    const { text, userName, userAvatar } = req.body;
    const userId = req.userId; // Securely take from token
    if (!text) return res.status(400).json({ success: false, error: 'Missing comment text' });

    const cleanPostId = String(req.params.postId).split('-loop')[0];

    // Fetch user details from database to avoid placeholder/incorrect usernames
    const User = mongoose.model('User');
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    }).lean();

    const displayName = (user?.displayName || '').trim();
    const name = (user?.name || '').trim();
    const username = (user?.username || '').trim();
    const email = (user?.email || '').trim();

    let resolvedName = displayName || name || username || userName;
    const isPlaceholder = !resolvedName || 
                          resolvedName.toLowerCase() === 'user' || 
                          resolvedName.toLowerCase() === 'unknown';
    if (isPlaceholder) {
      if (email && email.includes('@')) {
        resolvedName = email.split('@')[0];
      } else if (username) {
        resolvedName = username;
      } else {
        resolvedName = 'User';
      }
    }

    const finalUserName = resolvedName || 'Anonymous';
    const finalUserAvatar = user?.avatar || user?.photoURL || user?.profilePicture || userAvatar || null;

    const newComment = new Comment({
      postId: cleanPostId,
      userId,
      userName: finalUserName,
      userAvatar: finalUserAvatar,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {},
      replies: []
    });
    await newComment.save();

    try {
      const Post = mongoose.model('Post');
      const post = await Post.findOne({
        $or: [
          { id: cleanPostId },
          ...(mongoose.Types.ObjectId.isValid(cleanPostId) ? [{ _id: cleanPostId }] : [])
        ]
      });
      if (post) {
        post.commentsCount = (post.commentsCount || 0) + 1;
        post.commentCount = (post.commentCount || 0) + 1;
        await post.save();
      }
      
      if (post && String(post.userId) !== String(userId)) {
        const User = mongoose.model('User');
        const sender = await User.findById(userId).select('displayName name').lean();
        const senderName = sender?.displayName || sender?.name || 'Someone';

        notificationQueue.add('postComment', {
          userId: post.userId,
          senderId: userId,
          title: 'New Comment! 💬',
          body: `${senderName} commented: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          data: { postId: post._id, type: 'COMMENT', screen: 'home' }
        }).catch(() => {});
      }

      // Scan for @mentions in comment text
      try {
        const { handleMentionsAndTags } = require('../src/utils/mentionHelper');
        await handleMentionsAndTags(text, userId, cleanPostId, newComment._id);
      } catch (mentionErr) {
        console.warn('Comment mentions resolution warning:', mentionErr.message);
      }
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.status(201).json({ success: true, id: newComment._id, data: newComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/posts/:postId/comments/:commentId - Edit a comment
router.patch('/:postId/comments/:commentId', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);
    
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    
    // Check if any of the user's ID candidates matches the comment author's ID
    const isAuthor = candidates.some(id => String(id) === String(comment.userId));
    if (!isAuthor) return res.status(403).json({ success: false, error: 'Unauthorized' });

    comment.text = text;
    comment.editedAt = new Date();
    await comment.save();
    res.json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId - Delete a comment
router.delete('/:postId/comments/:commentId', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    
    // Check if requester is either the comment author or the post owner
    const Post = mongoose.model('Post');
    const post = await Post.findOne({
      $or: [
        { id: req.params.postId },
        ...(mongoose.Types.ObjectId.isValid(req.params.postId) ? [{ _id: req.params.postId }] : [])
      ]
    }).lean();

    const isPostOwner = post && candidates.some(id => String(id) === String(post.userId));
    const isAuthor = candidates.some(id => String(id) === String(comment.userId));
    
    if (!isAuthor && !isPostOwner) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only the comment author or post owner can delete comments' });
    }

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
router.post('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId } = req.params;
    
    // Find comment by multiple ID variants
    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });
    
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    if (!comment.likes) comment.likes = [];
    if (comment.likes.includes(userId)) {
      return res.json({ success: true, likesCount: comment.likes.length, message: 'Already liked' });
    }

    comment.likes.push(userId);
    comment.likesCount = comment.likes.length;
    await comment.save();

    // Notify comment author
    if (comment.userId && String(comment.userId) !== String(userId)) {
      try {
        const User = mongoose.model('User');
        const sender = await User.findById(userId).select('displayName name').lean();
        const senderName = sender?.displayName || sender?.name || 'Someone';

        notificationQueue.add('commentLike', {
          userId: comment.userId,
          senderId: userId,
          title: 'Comment Liked! ❤️',
          body: `${senderName} liked your comment: "${comment.text.substring(0, 40)}${comment.text.length > 40 ? '...' : ''}"`,
          data: { postId: req.params.postId, type: 'COMMENT_LIKE', screen: 'home' }
        }).catch(() => {});
      } catch (notiErr) {
        console.warn('Comment like notification warning:', notiErr.message);
      }
    }

    res.json({ success: true, likesCount: comment.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// DELETE /api/posts/:postId/comments/:commentId/like - Unlike a comment
router.delete('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId } = req.params;

    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });

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


// POST /api/posts/:postId/comments/:commentId/replies/:replyId/like - Like a reply
router.post('/:postId/comments/:commentId/replies/:replyId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId, replyId } = req.params;
    
    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });
    
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyIndex = comment.replies.findIndex(r => String(r._id || r.id) === String(replyId));
    if (replyIndex === -1) return res.status(404).json({ success: false, error: 'Reply not found' });

    const reply = comment.replies[replyIndex];
    if (!reply.likes) reply.likes = [];
    
    if (!reply.likes.includes(userId)) {
      reply.likes.push(userId);
      reply.likesCount = reply.likes.length;
      comment.markModified('replies');
      await comment.save();

      // Notify reply author
      if (reply.userId && String(reply.userId) !== String(userId)) {
        try {
          const User = mongoose.model('User');
          const sender = await User.findById(userId).select('displayName name').lean();
          const senderName = sender?.displayName || sender?.name || 'Someone';

          notificationQueue.add('replyLike', {
            userId: reply.userId,
            senderId: userId,
            title: 'Reply Liked! ❤️',
            body: `${senderName} liked your reply: "${reply.text.substring(0, 40)}${reply.text.length > 40 ? '...' : ''}"`,
            data: { postId: req.params.postId, type: 'REPLY_LIKE', screen: 'home' }
          }).catch(() => {});
        } catch (notiErr) {
          console.warn('Reply like notification warning:', notiErr.message);
        }
      }
    }

    res.json({ success: true, likesCount: reply.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId/like - Unlike a reply
router.delete('/:postId/comments/:commentId/replies/:replyId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId, replyId } = req.params;

    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });

    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyIndex = comment.replies.findIndex(r => String(r._id || r.id) === String(replyId));
    if (replyIndex === -1) return res.status(404).json({ success: false, error: 'Reply not found' });

    const reply = comment.replies[replyIndex];
    if (reply.likes) {
      const originalCount = reply.likes.length;
      reply.likes = reply.likes.filter(id => String(id) !== String(userId));
      reply.likesCount = reply.likes.length;
      
      if (originalCount !== reply.likes.length) {
        comment.markModified('replies');
        await comment.save();
      }
    }

    res.json({ success: true, likesCount: reply.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// --- Comment Replies ---

// POST /api/posts/:postId/comments/:commentId/replies - Add reply
router.post('/:postId/comments/:commentId/replies', verifyToken, async (req, res) => {
  try {
    const { text, userName, userAvatar } = req.body;
    const userId = req.userId;
    const { commentId } = req.params;

    // Fetch user details from database to avoid placeholder/incorrect usernames
    const User = mongoose.model('User');
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    }).lean();

    const displayName = (user?.displayName || '').trim();
    const name = (user?.name || '').trim();
    const username = (user?.username || '').trim();
    const email = (user?.email || '').trim();

    let resolvedName = displayName || name || username || userName;
    const isPlaceholder = !resolvedName || 
                          resolvedName.toLowerCase() === 'user' || 
                          resolvedName.toLowerCase() === 'unknown';
    if (isPlaceholder) {
      if (email && email.includes('@')) {
        resolvedName = email.split('@')[0];
      } else if (username) {
        resolvedName = username;
      } else {
        resolvedName = 'User';
      }
    }

    const finalUserName = resolvedName || 'Anonymous';
    const finalUserAvatar = user?.avatar || user?.photoURL || user?.profilePicture || userAvatar || null;

    const reply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      userName: finalUserName,
      userAvatar: finalUserAvatar,
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

    if (result && result.userId && String(result.userId) !== String(userId)) {
      try {
        const User = mongoose.model('User');
        const sender = await User.findById(userId).select('displayName name').lean();
        const senderName = sender?.displayName || sender?.name || 'Someone';

        notificationQueue.add('commentReply', {
          userId: result.userId,
          senderId: userId,
          title: 'New Reply! 💬',
          body: `${senderName} replied to your comment: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
          data: { postId: req.params.postId, type: 'COMMENT_REPLY', screen: 'home' }
        }).catch(() => {});
      } catch (notiErr) {
        console.warn('Comment reply notification warning:', notiErr.message);
      }
    }

    // Scan for @mentions in reply text
    try {
      const { handleMentionsAndTags } = require('../src/utils/mentionHelper');
      await handleMentionsAndTags(text, userId, req.params.postId, reply._id);
    } catch (mentionErr) {
      console.warn('Reply mentions resolution warning:', mentionErr.message);
    }

    res.status(201).json({ success: true, id: reply._id, data: reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId - Delete reply
router.delete('/:postId/comments/:commentId/replies/:replyId', verifyToken, async (req, res) => {
  try {
    const { commentId, replyId, postId } = req.params;
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const reply = comment.replies.find(r => String(r._id) === String(replyId));
    if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

    // Check if requester is reply author, parent comment owner, or post owner
    const Post = mongoose.model('Post');
    const post = await Post.findOne({
      $or: [
        { id: postId },
        ...(mongoose.Types.ObjectId.isValid(postId) ? [{ _id: postId }] : [])
      ]
    }).lean();

    const isPostOwner = post && candidates.some(id => String(id) === String(post.userId));
    const isCommentOwner = candidates.some(id => String(id) === String(comment.userId));
    const isAuthor = candidates.some(id => String(id) === String(reply.userId));

    if (!isAuthor && !isCommentOwner && !isPostOwner) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only the reply author, comment owner, or post owner can delete replies' });
    }

    comment.replies = comment.replies.filter(r => String(r._id) !== String(replyId));
    await comment.save();

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

// PATCH /api/posts/:postId/comments/:commentId/replies/:replyId - Edit reply
router.patch('/:postId/comments/:commentId/replies/:replyId', verifyToken, async (req, res) => {
  try {
    const { commentId, replyId } = req.params;
    const { text } = req.body;
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyIndex = comment.replies.findIndex(r => String(r._id) === String(replyId));
    if (replyIndex === -1) return res.status(404).json({ success: false, error: 'Reply not found' });

    // Check ownership
    const isAuthor = candidates.some(id => String(id) === String(comment.replies[replyIndex].userId));
    if (!isAuthor) return res.status(403).json({ success: false, error: 'Unauthorized' });

    comment.replies[replyIndex].text = text;
    comment.replies[replyIndex].editedAt = new Date();
    comment.markModified('replies');
    await comment.save();

    res.json({ success: true, data: comment.replies[replyIndex] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
