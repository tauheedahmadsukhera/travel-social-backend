const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const logger = require('../src/utils/logger');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const s3Service = require('../src/utils/s3Service');

// Helper for Cloudinary Upload
async function uploadToCloudinary(fileBuffer, folder, originalName = 'image.jpg') {
  if (process.env.STORAGE_PROVIDER === 's3') {
    const result = await s3Service.uploadMedia(fileBuffer, folder, 'admin', 'image', originalName);
    return result.secure_url;
  }
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

/**
 * @route   POST /api/admin/login
 * @desc    Admin login with role verification
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const User = mongoose.model('User');
    const bcrypt = require('bcryptjs');
    const { generateToken } = require('../src/middleware/authMiddleware');

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Role verification
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied: Not an administrator' });
    }

    const token = generateToken(user._id, user.email);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/admin/stats
 * @desc    Get dashboard statistics
 * @access  Private/Admin
 */
router.get('/stats', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const Report = mongoose.model('Report');

    // Admin check
    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, totalPosts, activeReports,
      usersLast7, usersPrev7,
      postsLast7, postsPrev7,
      activeUsers30Days,
      engagementData, postGrowthData
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      // Trend: users last 7 days vs previous 7 days
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      // Post trend
      Post.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Post.countDocuments({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      // Active users (users who posted or signed up in last 30 days)
      User.countDocuments({ updatedAt: { $gte: thirtyDaysAgo } }),
      // User growth chart (last 7 days)
      User.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      // Post growth chart (last 7 days)
      Post.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Calculate trend percentages
    const calcTrend = (current, previous) => {
      if (previous === 0) return current > 0 ? '+100%' : '0%';
      const pct = (((current - previous) / previous) * 100).toFixed(1);
      return pct >= 0 ? `+${pct}%` : `${pct}%`;
    };

    const userTrend = calcTrend(usersLast7, usersPrev7);
    const postTrend = calcTrend(postsLast7, postsPrev7);
    const activeUserRate = totalUsers > 0 ? `${Math.round((activeUsers30Days / totalUsers) * 100)}%` : '0%';

    // Format chart data (last 7 days)
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const dayName = labels[d.getDay()];
      const userDay = engagementData.find(item => item._id === dateStr);
      const postDay = postGrowthData.find(item => item._id === dateStr);
      return { name: dayName, users: userDay ? userDay.count : 0, posts: postDay ? postDay.count : 0 };
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalPosts,
        activeReports,
        userTrend,
        postTrend,
        activeUserRate,
        activeUserRateTrend: '+0.0%',
        growthData: last7Days
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filtering and pagination
 * @access  Private/Admin
 */
router.get('/users', verifyToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
    const User = mongoose.model('User');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const query = {};
    if (search) {
      query.$or = [
        { displayName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    if (role) query.role = role;
    if (status) query.status = status;

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    // Map uid for frontend compatibility
    const mappedUsers = users.map(u => ({
      ...u.toObject(),
      uid: u.firebaseUid || u._id.toString()
    }));

    res.json({ success: true, data: mappedUsers, total });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/ban
 */
router.post('/users/:id/ban', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    // Find by _id OR firebaseUid for maximum compatibility
    const targetUser = await User.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    targetUser.status = 'suspended'; // Sync with frontend status name
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_SUSPENDED',
      targetId: targetUser._id,
      targetType: 'User',
      details: { reason },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User suspended successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/unban
 */
router.post('/users/:id/unban', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const targetUser = await User.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    targetUser.status = 'active';
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_ACTIVATED',
      targetId: targetUser._id,
      targetType: 'User',
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User activated successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/role
 */
router.post('/users/:id/role', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const targetUser = await User.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    const oldRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'ROLE_UPDATE',
      targetId: targetUser._id,
      targetType: 'User',
      details: { oldRole, newRole: role },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User role updated' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Permanently delete a user and all their data
 */
router.delete('/users/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const targetUser = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });
    if (String(targetUser._id) === String(req.userId)) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own admin account' });
    }

    const deletedUserId = targetUser._id;
    const deletedEmail = targetUser.email;

    // Delete user and their posts
    await Promise.all([
      User.deleteOne({ _id: deletedUserId }),
      Post.deleteMany({ userId: deletedUserId })
    ]);

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_DELETED',
      targetId: deletedUserId,
      targetType: 'User',
      details: { email: deletedEmail },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User and their posts deleted permanently' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/broadcast
 * @desc    Send a push notification/announcement to all users
 */
router.post('/broadcast', verifyToken, async (req, res, next) => {
  try {
    const { title, message, type = 'announcement' } = req.body;
    const User = mongoose.model('User');
    const Notification = mongoose.model('Notification');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    if (!title || !message) return res.status(400).json({ success: false, error: 'Title and message are required' });

    // Fetch all user IDs
    const users = await User.find({ status: { $ne: 'suspended' } }).select('_id').lean();
    const userIds = users.map(u => u._id);

    // Bulk insert notifications
    const notifications = userIds.map(uid => ({
      userId: uid,
      type,
      title,
      message,
      senderId: req.userId,
      isRead: false,
      createdAt: new Date()
    }));

    await Notification.insertMany(notifications, { ordered: false });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'BROADCAST_SENT',
      targetType: 'AllUsers',
      details: { title, message, recipientCount: userIds.length },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: `Broadcast sent to ${userIds.length} users`, recipientCount: userIds.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/posts
 * @desc    Get all posts with pagination for moderation
 */
router.get('/posts', verifyToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', flagged = '' } = req.query;
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const Report = mongoose.model('Report');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    let query = {};
    if (search) {
      query.$or = [
        { caption: new RegExp(search, 'i') },
        { 'location.name': new RegExp(search, 'i') }
      ];
    }

    // If flagged=true, only show reported posts
    let postIds = null;
    if (flagged === 'true') {
      const reportedPosts = await Report.find({ targetType: 'Post', status: 'pending' }).distinct('targetId');
      postIds = reportedPosts;
      query._id = { $in: postIds };
    }

    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Post.countDocuments(query)
    ]);

    res.json({ success: true, data: posts, total });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/admin/posts/:id
 * @desc    Admin delete any post
 */
router.delete('/posts/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const post = await Post.findByIdAndDelete(id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'POST_DELETED',
      targetId: id,
      targetType: 'Post',
      details: { caption: post.caption?.slice(0, 100) },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/logs
 */
router.get('/logs', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { page = 1, limit = 50 } = req.query;
    const logs = await AdminLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('adminId', 'displayName email');

    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/reports
 */
router.get('/reports', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const Report = mongoose.model('Report');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { status = 'pending' } = req.query;
    const reports = await Report.find({ status })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const Post = mongoose.model('Post');
    const Comment = mongoose.model('Comment');
    const Story = mongoose.model('Story');

    const reportsWithTargets = await Promise.all(reports.map(async (report) => {
      let targetContent = null;
      try {
        if (report.targetType === 'post' || report.targetType === 'Post') {
          targetContent = await Post.findById(report.targetId).populate('userId', 'displayName email avatar').lean();
        } else if (report.targetType === 'user' || report.targetType === 'User') {
          targetContent = await User.findById(report.targetId, 'displayName email avatar role status').lean();
        } else if (report.targetType === 'comment' || report.targetType === 'Comment') {
          targetContent = await Comment.findById(report.targetId).lean();
        } else if (report.targetType === 'story' || report.targetType === 'Story') {
          targetContent = await Story.findById(report.targetId).lean();
        }
      } catch (e) {
        logger.warn(`Failed to fetch report target: ${e.message}`);
      }
      return {
        ...report,
        targetContent
      };
    }));

    res.json({ success: true, data: reportsWithTargets });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/reports/:id/resolve
 */
router.post('/reports/:id/resolve', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const User = mongoose.model('User');
    const Report = mongoose.model('Report');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    report.status = status; // 'resolved' or 'dismissed'
    report.adminNote = note;
    report.resolvedAt = new Date();
    report.resolvedBy = req.userId;
    await report.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'REPORT_RESOLVED',
      targetId: id,
      targetType: 'Report',
      details: { status, note },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: `Report ${status}` });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/comments
 * @desc    Get all comments with pagination/search for moderation
 */
router.get('/comments', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const Comment = mongoose.model('Comment');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { page = 1, limit = 20, search = '' } = req.query;
    let query = {};
    if (search) {
      query.text = new RegExp(search, 'i');
    }

    const [comments, total] = await Promise.all([
      Comment.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Comment.countDocuments(query)
    ]);

    res.json({ success: true, data: comments, total });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/admin/comments/:id
 * @desc    Admin delete any comment
 */
router.delete('/comments/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const Comment = mongoose.model('Comment');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const comment = await Comment.findByIdAndDelete(id);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'COMMENT_DELETED',
      targetId: id,
      targetType: 'Comment',
      details: { text: comment.text?.slice(0, 100) },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/stories
 * @desc    Get active/all stories for moderation
 */
router.get('/stories', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const Story = mongoose.model('Story');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { page = 1, limit = 20 } = req.query;

    const [stories, total] = await Promise.all([
      Story.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Story.countDocuments()
    ]);

    res.json({ success: true, data: stories, total });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/admin/stories/:id
 * @desc    Admin delete any story
 */
router.delete('/stories/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const Story = mongoose.model('Story');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const story = await Story.findByIdAndDelete(id);
    if (!story) return res.status(404).json({ success: false, error: 'Story not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'STORY_DELETED',
      targetId: id,
      targetType: 'Story',
      details: { caption: story.caption?.slice(0, 100) },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/verify
 * @desc    Toggle verified status for user
 */
router.post('/users/:id/verify', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.isVerified = isVerified;
    await user.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: isVerified ? 'USER_VERIFIED' : 'USER_UNVERIFIED',
      targetId: id,
      targetType: 'User',
      details: { displayName: user.displayName },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/streams
 * @desc    Get all active or past streams for moderation
 */
router.get('/streams', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const LiveStream = mongoose.model('LiveStream');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { page = 1, limit = 20 } = req.query;

    const [streams, total] = await Promise.all([
      LiveStream.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      LiveStream.countDocuments()
    ]);

    res.json({ success: true, data: streams, total });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/streams/:id/end
 * @desc    Admin force end a live stream
 */
router.post('/streams/:id/end', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const LiveStream = mongoose.model('LiveStream');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const stream = await LiveStream.findById(id);
    if (!stream) return res.status(404).json({ success: false, error: 'Live stream not found' });

    stream.isActive = false;
    await stream.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'STREAM_ENDED_BY_ADMIN',
      targetId: id,
      targetType: 'LiveStream',
      details: { title: stream.title },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Live stream force-ended successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * CATEGORIES MANAGEMENT
 */
router.get('/categories', verifyToken, async (req, res, next) => {
  try {
    const Category = mongoose.model('Category');
    const categories = await Category.find().sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/categories - Create with DIRECT IMAGE UPLOAD
router.post('/categories', verifyToken, upload.single('image'), async (req, res, next) => {
  try {
    const { name } = req.body;
    const Category = mongoose.model('Category');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    let imageUrl = req.body.image; // Fallback to URL if provided
    
    // If a file is uploaded, use it
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, 'admin/categories', req.file.originalname);
    }

    if (!name || !imageUrl) {
      return res.status(400).json({ success: false, error: 'Name and image are required' });
    }

    const category = new Category({ name, image: imageUrl });
    await category.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'CATEGORY_ADDED',
      targetId: category._id,
      targetType: 'Category',
      details: { name },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const Category = mongoose.model('Category');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'CATEGORY_DELETED',
      targetId: id,
      targetType: 'Category',
      details: { name: category.name },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * REGIONS MANAGEMENT
 */
router.get('/regions', verifyToken, async (req, res, next) => {
  try {
    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    res.json({ success: true, data: regions });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/regions - Create with DIRECT IMAGE UPLOAD
router.post('/regions', verifyToken, upload.single('image'), async (req, res, next) => {
  try {
    const { name, countryCode, type } = req.body;
    const Region = mongoose.model('Region');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    let imageUrl = req.body.image;
    
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, 'admin/regions', req.file.originalname);
    }

    if (!name || !imageUrl) {
      return res.status(400).json({ success: false, error: 'Name and image are required' });
    }

    const region = new Region({ name, image: imageUrl, countryCode, type });
    await region.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'REGION_ADDED',
      targetId: region._id,
      targetType: 'Region',
      details: { name, type },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, data: region });
  } catch (err) {
    next(err);
  }
});

router.delete('/regions/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const Region = mongoose.model('Region');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const region = await Region.findByIdAndDelete(id);
    if (!region) return res.status(404).json({ success: false, error: 'Region not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'REGION_DELETED',
      targetId: id,
      targetType: 'Region',
      details: { name: region.name },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Region deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
