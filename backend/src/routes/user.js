const express = require('express');
const router = express.Router();
const { verifyToken, optionalAuth, requireOwnership } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// ─────────────────────────────────────────────
// PUBLIC READ-ONLY ROUTES (require auth so we can at least identify the caller,
// but data is not user-specific enough to hard-block)
// ─────────────────────────────────────────────

// Search users (GET /api/users/search?q=query) — requires auth to prevent scraping
router.get('/search', verifyToken, userController.searchUsers);

// ─────────────────────────────────────────────
// PROTECTED WRITE ROUTES (verifyToken + ownership check)
// ─────────────────────────────────────────────

// Create or update user — must be authenticated (own record only)
router.post('/', verifyToken, userController.createOrUpdateUser);

// Section management routes (MUST be before other :uid routes)
// Create section (POST /api/users/:uid/sections)
router.post('/:uid/sections', verifyToken, requireOwnership('uid'), userController.createSection);

// Update section (PUT /api/users/:uid/sections/:sectionName)
router.put('/:uid/sections/:sectionName', verifyToken, requireOwnership('uid'), userController.updateSection);

// Delete section (DELETE /api/users/:uid/sections/:sectionName)
router.delete('/:uid/sections/:sectionName', verifyToken, requireOwnership('uid'), userController.deleteSection);

// Get user posts (GET /api/users/:uid/posts) — optionalAuth: public profiles are viewable
router.get('/:uid/posts', optionalAuth, userController.getUserPosts);

// Get user highlights (GET /api/users/:uid/highlights)
router.get('/:uid/highlights', optionalAuth, userController.getUserHighlights);

// Get user sections (GET /api/users/:uid/sections)
router.get('/:uid/sections', optionalAuth, userController.getUserSections);

// Get user stories (GET /api/users/:uid/stories)
router.get('/:uid/stories', optionalAuth, userController.getUserStories);

// Update user profile (PUT or PATCH /api/users/:uid) — own profile only
router.put('/:uid', verifyToken, requireOwnership('uid'), userController.updateUserProfile);
router.patch('/:uid', verifyToken, requireOwnership('uid'), userController.updateUserProfile);

// Get user profile (GET /api/users/:uid) — optionalAuth: public profiles viewable
router.get('/:uid', optionalAuth, userController.getUserProfile);

// Update push token (PUT /api/users/:uid/push-token) — own token only
router.put('/:uid/push-token', verifyToken, requireOwnership('uid'), userController.updatePushToken);

// Moderation routes — must be authenticated; block/unblock are own-user actions
router.post('/:uid/block/:targetUid', verifyToken, requireOwnership('uid'), userController.blockUser);
router.delete('/:uid/block/:targetUid', verifyToken, requireOwnership('uid'), userController.unblockUser);
router.get('/:uid/blocked', verifyToken, requireOwnership('uid'), userController.getBlockedUsers);

// Report user — must be authenticated (any user can report)
router.post('/:uid/report', verifyToken, userController.reportUser);

// Profile URL — public
router.get('/:uid/profile-url', optionalAuth, userController.getProfileUrl);

// List all users (GET /api/users) — ADMIN ONLY — prevents full user data harvest
router.get('/', verifyToken, userController.listUsers);

module.exports = router;
