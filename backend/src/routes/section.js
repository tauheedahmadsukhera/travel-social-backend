const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');

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

// GET /api/sections?userId=... (public — reading sections is unrestricted)
router.get('/', ctrl.getSectionsByUser);

// GET /api/users/:uid/sections (public)
router.get('/:uid/sections', ctrl.getUserSections);

// POST /api/users/:uid/sections (JWT required)
router.post('/:uid/sections', verifyToken, ctrl.createSection);

// PUT /api/users/:uid/sections/:sectionId (JWT required)
router.put('/:uid/sections/:sectionId', verifyToken, ctrl.updateSection);

// DELETE /api/users/:uid/sections/:sectionId (JWT required)
router.delete('/:uid/sections/:sectionId', verifyToken, ctrl.deleteSection);

// POST /api/users/:uid/sections/:sectionId/collaborators (JWT required)
router.post('/:uid/sections/:sectionId/collaborators', verifyToken, ctrl.addCollaborator);

// DELETE /api/users/:uid/sections/:sectionId/collaborators/:collabId (JWT required)
router.delete('/:uid/sections/:sectionId/collaborators/:collabId', verifyToken, ctrl.removeCollaborator);

module.exports = router;
