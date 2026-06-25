const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const { verifyToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { createGroupSchema, updateGroupSchema, manageMemberSchema } = require('../validations/groupValidation');

// POST /api/groups - create group
router.post('/', verifyToken, validate(createGroupSchema), async (req, res, next) => {
  try {
    const userId = req.userId;
    const { name, type = 'custom', members = [] } = req.body;
    const group = await Group.create({ userId, name, type, members });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// GET /api/groups - list groups for authenticated user
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const groups = await Group.find({ userId }).sort({ createdAt: 1 });
    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:groupId - update name/type/members
router.put('/:groupId', verifyToken, validate(updateGroupSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const { name, type, members } = req.body;

    const group = await Group.findOne({ _id: groupId, userId });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found or unauthorized' });

    if (name !== undefined) group.name = name;
    if (type !== undefined) group.type = type;
    if (Array.isArray(members)) group.members = [...new Set(members)];

    await group.save();
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:groupId/members/add
router.put('/:groupId/members/add', verifyToken, validate(manageMemberSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const { memberId } = req.body;

    const group = await Group.findOneAndUpdate(
      { _id: groupId, userId },
      { $addToSet: { members: memberId } },
      { new: true }
    );
    if (!group) return res.status(404).json({ success: false, error: 'Group not found or unauthorized' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:groupId/members/remove
router.put('/:groupId/members/remove', verifyToken, validate(manageMemberSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const { memberId } = req.body;

    const group = await Group.findOneAndUpdate(
      { _id: groupId, userId },
      { $pull: { members: memberId } },
      { new: true }
    );
    if (!group) return res.status(404).json({ success: false, error: 'Group not found or unauthorized' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/groups/:groupId
router.delete('/:groupId', verifyToken, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const group = await Group.findOneAndDelete({ _id: groupId, userId });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found or unauthorized' });
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
