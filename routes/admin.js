const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');

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

    const [totalUsers, totalPosts, activeReports, engagementData] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      // Aggregate for growth chart (last 7 days)
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Format engagement data for chart
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const dayName = labels[d.getDay()];
      const dayData = engagementData.find(item => item._id === dateStr);
      return { name: dayName, users: dayData ? dayData.count : 0, posts: 0 }; // We can add post growth too if needed
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalPosts,
        activeReports,
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
 * @route   POST /api/admin/users/:uid/ban
 */
router.post('/users/:uid/ban', verifyToken, async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { reason } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const targetUser = await User.findOne({ $or: [{ firebaseUid: uid }, { _id: mongoose.Types.ObjectId.isValid(uid) ? uid : null }] });
    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    targetUser.status = 'banned';
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_BANNED',
      targetId: targetUser._id,
      targetType: 'User',
      details: { reason },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User banned successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:uid/unban
 */
router.post('/users/:uid/unban', verifyToken, async (req, res, next) => {
  try {
    const { uid } = req.params;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const targetUser = await User.findOne({ $or: [{ firebaseUid: uid }, { _id: mongoose.Types.ObjectId.isValid(uid) ? uid : null }] });
    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    targetUser.status = 'active';
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_UNBANNED',
      targetId: targetUser._id,
      targetType: 'User',
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User unbanned successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:uid/role
 */
router.post('/users/:uid/role', verifyToken, async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { role } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const targetUser = await User.findOne({ $or: [{ firebaseUid: uid }, { _id: mongoose.Types.ObjectId.isValid(uid) ? uid : null }] });
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
 * @route   GET /api/admin/activity
 * @desc    Get recent admin logs/activity
 * @access  Private/Admin
 */
router.get('/activity', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const logs = await AdminLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('adminId', 'displayName avatar username');

    res.json({ success: true, data: logs });
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

router.post('/categories', verifyToken, async (req, res, next) => {
  try {
    const { name, image } = req.body;
    const Category = mongoose.model('Category');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const category = new Category({ name, image });
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

router.post('/regions', verifyToken, async (req, res, next) => {
  try {
    const { name, image, countryCode, type } = req.body;
    const Region = mongoose.model('Region');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const region = new Region({ name, image, countryCode, type });
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
