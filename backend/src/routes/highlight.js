const express = require('express');
const router = express.Router();
const highlightController = require('../controllers/highlightController');

// GET /api/highlights?userId=...
router.get('/', highlightController.getHighlightsByUser);

// POST /api/highlights
router.post('/', highlightController.createHighlight);

// POST /api/highlights/:id/stories
router.post('/:id/stories', highlightController.addStoryToHighlight);

// DELETE /api/highlights/:id/stories/:storyId
router.delete('/:id/stories/:storyId', highlightController.removeStoryFromHighlight);

// PATCH /api/highlights/:id
router.patch('/:id', highlightController.updateHighlight);

// DELETE /api/highlights/:id
router.delete('/:id', highlightController.deleteHighlight);

module.exports = router;
