const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Story model
const Story = require('../src/models/Story');

// Delete story
router.delete('/stories/:storyId', async (req, res) => {
  try {
    await Story.deleteOne({ _id: req.params.storyId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
