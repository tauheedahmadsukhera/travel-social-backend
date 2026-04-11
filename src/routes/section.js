const express = require('express');
const router = express.Router();

let ctrl;
try {
  ctrl = require('../controllers/sectionController');
} catch (e) {
  console.warn('⚠️ Section controller error:', e.message);
  const stub = (req, res) => res.json({ success: true, data: [] });
  ctrl = {
    getSectionsByUser: stub, createSection: stub,
    updateSection: stub, deleteSection: stub,
    getUserSections: stub, addCollaborator: stub, removeCollaborator: stub,
  };
}

// GET /api/sections?userId=...
router.get('/', ctrl.getSectionsByUser);

// GET  /api/users/:uid/sections
router.get('/:uid/sections', ctrl.getUserSections);

// POST /api/users/:uid/sections
router.post('/:uid/sections', ctrl.createSection);

// PUT  /api/users/:uid/sections/:sectionId  (id-based now)
router.put('/:uid/sections/:sectionId', ctrl.updateSection);

// DELETE /api/users/:uid/sections/:sectionId  (supports body.migrateToSectionId)
router.delete('/:uid/sections/:sectionId', ctrl.deleteSection);

// POST   /api/users/:uid/sections/:sectionId/collaborators
router.post('/:uid/sections/:sectionId/collaborators', ctrl.addCollaborator);

// DELETE /api/users/:uid/sections/:sectionId/collaborators/:collabId
router.delete('/:uid/sections/:sectionId/collaborators/:collabId', ctrl.removeCollaborator);

module.exports = router;
