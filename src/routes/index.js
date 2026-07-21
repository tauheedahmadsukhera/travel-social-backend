const express = require('express');
const router = express.Router();

// =============================================================================
// ROUTING ARCHITECTURE — READ THIS BEFORE ADDING ROUTES
// =============================================================================
//
// This codebase has two route directories. This is intentional, not a bug.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  LEGACY-ACTIVE routes  →  backend/routes/  (root-level)                │
// │  These are the PRODUCTION handlers. They are large, battle-tested files │
// │  that contain the full feature set (auth, pagination, validation, etc.) │
// │  They are imported HERE via require('../../routes/...')                 │
// │                                                                          │
// │  ✅ backend/routes/posts.js         →  /api/posts                       │
// │  ✅ backend/routes/comments.js      →  /api/posts (shared prefix)       │
// │  ✅ backend/routes/users.js         →  /api/users                       │
// │  ✅ backend/routes/stories.js       →  /api/stories                     │
// │  ✅ backend/routes/sections.js      →  /api/users (sections sub-routes) │
// │  ✅ backend/routes/notification.js  →  /api/notifications               │
// │  ✅ backend/routes/admin.js         →  /api/admin                       │
// │  ✅ backend/routes/saved.js         →  /api/users/:uid/saved (sub-mount) │
// │  ✅ backend/routes/categories.js    →  /api/categories                  │
// │  ✅ backend/routes/locations.js     →  /api/locations                   │
// │  ✅ backend/routes/moderation.js    →  /api/moderation                  │
// │  ✅ backend/routes/gdpr.js          →  /api/gdpr                        │
// │  ✅ backend/routes/livestream.js    →  /api/live-streams                │
// │  ✅ backend/routes/verification.js  →  /api/users/verification          │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  MVC-ACTIVE routes  →  backend/src/routes/  (this directory)           │
// │  Newer, structured route files registered directly here.                │
// │  These REPLACE legacy files when they are ready.                        │
// │                                                                          │
// │  ✅ src/routes/auth.js          →  /api/auth                           │
// │  ✅ src/routes/upload.js        →  /api/upload                         │
// │  ✅ src/routes/follow.js        →  /api/follow                         │
// │  ✅ src/routes/highlight.js     →  /api/highlights                     │
// │  ✅ src/routes/conversations.js →  /api/conversations                  │
// │  ✅ src/routes/groups.js        →  /api/groups                         │
// │  ✅ src/routes/passport.js      →  /api/passport                       │
// │  ✅ src/routes/presence.js      →  /api/presence                       │
// │  ✅ src/routes/media.js         →  /api/media                          │
// │  ✅ src/routes/public.js        →  /api/public                         │
// │  ✅ src/routes/branding.js      →  /api/branding                       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// To add a new route:
//   - Prefer adding it as a new file under src/routes/ (MVC pattern)
//   - Register it below using router.use('/your-path', require('./your-file'))
//   - Do NOT add new handlers to the legacy root/routes files
//
// Future work: Migrate remaining legacy-active routes to src/routes/ one-by-one,
//              with full test coverage per file, then delete the legacy file.
// =============================================================================

// ─── LEGACY-ACTIVE: root/routes/ directory ───────────────────────────────────
const postRoutes      = require('../../routes/posts');        // Full-featured posts
const commentRoutes   = require('../../routes/comments');     // Full-featured comments
const livestreamRoutes= require('../../routes/livestream');
const notificationRoutes = require('../../routes/notification');
// NOTE: routes/saved.js is a DEAD FILE — it defines /:userId/saved endpoints but
//       these are implemented DIRECTLY inside routes/users.js (lines ~1521-1766).
//       routes/saved.js was never used in production (no router.use() for it existed
//       in the original code either). It remains on disk but is never loaded.
const sectionRoutes   = require('../../routes/sections');
const storyRoutes     = require('../../routes/stories');      // Full-featured stories
const userRoutes      = require('../../routes/users');        // Full-featured users
const categoriesRoutes= require('../../routes/categories');
const adminRoutes     = require('../../routes/admin');
const locationRoutes  = require('../../routes/locations');
const moderationRoutes= require('../../routes/moderation');
const gdprRoutes      = require('../../routes/gdpr');

// ─── MVC-ACTIVE: src/routes/ directory ───────────────────────────────────────
const brandingRoutes      = require('./branding');
const presenceRoutes      = require('./presence');
const conversationRoutes  = require('./conversations');

// ─── Register Legacy-Active routes ───────────────────────────────────────────
router.use('/conversations', conversationRoutes);
router.use('/posts', commentRoutes);
router.use('/posts', postRoutes);
router.use('/live-streams', livestreamRoutes);
router.use('/notifications', notificationRoutes);
router.use('/stories', storyRoutes);
router.use('/users/verification', require('../../routes/verification'));
router.use('/users', userRoutes);
router.use('/users', sectionRoutes);
router.use('/categories', categoriesRoutes);
router.use('/admin', adminRoutes);
router.use('/locations', locationRoutes);
router.use('/moderation', moderationRoutes);
router.use('/gdpr', gdprRoutes);

// ─── Register MVC-Active routes ──────────────────────────────────────────────
router.use('/auth',       require('./auth'));
router.use('/upload',     require('./upload'));
router.use('/groups',     require('./groups'));
router.use('/passport',   require('./passport'));
router.use('/public',     require('./public'));
router.use('/follow',     require('./follow'));
router.use('/highlights', require('./highlight'));
router.use('/media',      require('./media'));
router.use('/branding',   brandingRoutes);
router.use('/presence',   presenceRoutes);

// ─── Inline utility routes ────────────────────────────────────────────────────
router.get('/all-regions', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    const mapped = regions.map(r => ({
      id: r._id,
      name: r.name,
      image: r.image,
      section: r.type || 'country',
      countryCode: r.countryCode,
      order: r.order || 0,
      regionKey: r.regionKey
    }));
    res.json({ success: true, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch regions' });
  }
});

// Health check endpoints for uptime monitoring / frontend wakeup service
router.get('/status', (req, res) => res.json({ status: 'online', timestamp: new Date() }));
router.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));

module.exports = router;
