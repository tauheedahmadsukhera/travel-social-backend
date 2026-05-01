const express = require('express');
const router = express.Router();
const Group = require('../models/Group');

// POST /api/groups - create group
router.post('/', async (req, res, next) => {
  try {
    const { userId, name, type = 'custom', members = [] } = req.body;
    if (!userId || !name) return res.status(400).json({ success: false, error: 'userId and name required' });
    const group = await Group.create({ userId, name, type, members });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// GET /api/groups?userId= - list groups for user
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const groups = await Group.find({ userId }).sort({ createdAt: 1 });
    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:groupId - update name/type/members
router.put('/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { name, type, members } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (type !== undefined) update.type = type;
    if (Array.isArray(members)) update.members = [...new Set(members)];
    const group = await Group.findByIdAndUpdate(groupId, update, { new: true });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:groupId/members/add
router.put('/:groupId/members/add', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ success: false, error: 'memberId required' });
    const group = await Group.findByIdAndUpdate(groupId, { $addToSet: { members: memberId } }, { new: true });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:groupId/members/remove
router.put('/:groupId/members/remove', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ success: false, error: 'memberId required' });
    const group = await Group.findByIdAndUpdate(groupId, { $pull: { members: memberId } }, { new: true });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/groups/:groupId
router.delete('/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findByIdAndDelete(groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
