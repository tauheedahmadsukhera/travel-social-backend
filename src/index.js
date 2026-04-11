require('dotenv').config();
console.log('🚀 [INDEX.JS] LOADED AT:', new Date().toISOString());

// CRITICAL DEPLOY: 2026-01-03T02:30:00Z - Conversation creation logic
const express = require('express');
const compression = require('compression');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const { Server } = require('socket.io');
const { validateEnv } = require('./config/validateEnv');

// Fail fast on missing env *before* loading modules that read secrets at require-time.
validateEnv();

const { verifyToken } = require('./middleware/authMiddleware');
const { resolveUserIdentifiers } = require('./utils/userUtils');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log('✅ Cloudinary configured');

// ====== AUTO-REQUIRE ALL MODELS (ROOT) ======
require('../models/User');
require('../models/Post');
require('../models/Category');
require('../models/LiveStream');
require('../models/Conversation');
require('../models/Section');
require('../models/Story');
require('../models/Highlight');
// Require src-specific models
require('./models/Notification');
require('./models/Report');
if (!mongoose.models.Follow) {
  mongoose.model('Follow', new mongoose.Schema({
    followerId: String,
    followingId: String,
    createdAt: { type: Date, default: Date.now }
  }));
}
if (!mongoose.models.Block) {
  mongoose.model('Block', new mongoose.Schema({
    blockerId: mongoose.Schema.Types.ObjectId,
    blockedId: mongoose.Schema.Types.ObjectId,
    createdAt: { type: Date, default: Date.now }
  }));
}
if (!mongoose.models.Comment) {
  mongoose.model('Comment', new mongoose.Schema({}, { strict: false, collection: 'comments' }));
}
if (!mongoose.models.Message) {
  mongoose.model('Message', new mongoose.Schema({}, { strict: false, collection: 'messages' }));
}

const isProduction = process.env.NODE_ENV === 'production';
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '80mb';
const JWT_SECRET = process.env.JWT_SECRET;
const ENABLE_POSTS_DEBUG_LOGS = process.env.ENABLE_POSTS_DEBUG_LOGS === 'true';
const ENABLE_NOTIFICATION_ROUTE_LOGS = process.env.ENABLE_NOTIFICATION_ROUTE_LOGS === 'true';
if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
if (!JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set. Development auth may fail.');
}

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5000,http://localhost:8081,http://10.0.2.2:5000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOriginMatcher = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (!isProduction || corsOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'));
};

// ============= MULTER SETUP FOR FILE UPLOADS =============
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for videos
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Baseline production hardening for proxy-based deployments (Render/Nginx/etc.)
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ============= SOCKET.IO SETUP =============
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST'],
    credentials: true,
    allowEIO3: true
  },
  transports: ['websocket', 'polling'], // Support both transports
  pingTimeout: 120000, // Increased from 60s to 120s
  pingInterval: 25000,
  serveClient: true,
  cookie: false // Disable cookie to avoid CORS issues
});

console.log('✅ Socket.IO server initialized');

// Make io accessible to routes
app.set('io', io);
console.log('✅ Socket.IO attached to Express app');

// ============= HELPER FUNCTIONS =============
// Helper function to convert string to ObjectId (using mongoose.Types.ObjectId to avoid BSON version conflicts)
const toObjectId = (id) => {
  if (typeof id === 'object' && (id instanceof mongoose.Types.ObjectId || id._bsontype === 'ObjectId')) return id;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (err) {
    console.error('Invalid ObjectId:', id, err.message);
    return null;
  }
};

// ============= FIREBASE INITIALIZATION =============
try {
  let serviceAccount;
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

  if (require('fs').existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
    console.log('✅ Firebase Admin initializing from file');
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('✅ Firebase Admin initializing from environment variable');
    } catch (e) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', e.message);
    }
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.warn('⚠️ No Firebase service account found (file or environment variable)');
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization warning:', error.message);
}

// ============= MIDDLEWARE =============
// Compress all responses for massive size reduction
app.use(compression());
// CORS with explicit options for Render + mobile
app.use(cors({
  origin: corsOriginMatcher,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
console.log(`✅ Request body limit configured: ${REQUEST_BODY_LIMIT}`);

// Minimal security headers (kept lightweight to avoid behavior regressions)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const shouldWriteRequestLogs = process.env.ENABLE_REQUEST_LOGS === 'true';
  if (shouldWriteRequestLogs && req.url.includes('posts')) {
    const logsDir = path.join(__dirname, '../logs');
    const logPath = path.join(logsDir, 'posts-requests.log');
    const log = `[${new Date().toISOString()}] ${req.method} ${req.url} - ${JSON.stringify(req.headers['user-agent'])}\n`;
    try {
      fs.mkdirSync(logsDir, { recursive: true });
      fs.appendFile(logPath, log, () => {});
    } catch (e) {
      console.error('❌ Failed to write log:', e.message);
    }
    console.log(`[DEBUG LOG] ${req.method} ${req.url}`);
  }
  next();
});

// Health check endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date(),
    port: PORT
  });
});

// ============= STATIC ASSETS =============
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/stamps', express.static(path.join(__dirname, '../stamps')));
app.use('/assests', express.static(path.join(__dirname, '../assests')));
console.log('✅ Static assets (/uploads, /stamps, /assests) configured');

// ======================================================
// CRITICAL: HIGH-PRIORITY POST ACTIONS (LIKE/UNLIKE/REACT)
// Move these here to avoid any routing conflicts with messy catch-alls
// ======================================================

// [DEBUG] Wildcard catcher for /api/posts
app.all('/api/posts/*', (req, res, next) => {
  if (ENABLE_POSTS_DEBUG_LOGS) {
    console.log(`[POSTS-DEBUG] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// [API-TOP] LIKE
app.post(['/api/posts/:postId/like', '/posts/:postId/like'], async (req, res, next) => {
  console.log('🎯 [LIKE-TRACE] POST /posts/:postId/like -', req.originalUrl);
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const Post = mongoose.model('Post');
    let post = null;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId);
    }
    if (!post) {
      post = await Post.findOne({ id: String(postId) });
    }
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    if (!post.likes) post.likes = [];
    const isAlreadyLiked = post.likes.some(id => String(id) === String(userId));
    if (!isAlreadyLiked) {
      post = await Post.findOneAndUpdate(
        { _id: post._id },
        { $addToSet: { likes: userId }, $inc: { likesCount: 1 } },
        { new: true }
      );
      if (post) console.log(`🎯 [LIKE-TRACE] liked post=${postId} user=${userId} likes=${post.likesCount}`);
    }
    res.json({ success: true, data: post });
  } catch (err) {
    console.error('❌ [API-TOP] Like error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [API-TOP] UNLIKE
app.delete(['/api/posts/:postId/like', '/posts/:postId/like'], async (req, res, next) => {
  console.log('🎯 [LIKE-TRACE] DELETE /posts/:postId/like -', req.originalUrl);
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const Post = mongoose.model('Post');
    let post = null;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId);
    }
    if (!post) {
      post = await Post.findOne({ id: String(postId) });
    }
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    const isLiked = post.likes && post.likes.some(id => String(id) === String(userId));
    if (isLiked) {
      post = await Post.findOneAndUpdate(
        { _id: post._id },
        { $pull: { likes: userId }, $inc: { likesCount: -1 } },
        { new: true }
      );
      if (post) {
        if (post.likesCount < 0) post.likesCount = 0;
        await post.save();
        console.log(`🎯 [LIKE-TRACE] unliked post=${postId} user=${userId} likes=${post.likesCount}`);
      }
    }
    res.json({ success: true, data: post });
  } catch (err) {
    console.error('❌ [API-TOP] Unlike error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [API-TOP] REACT
app.post('/api/posts/:postId/react', async (req, res, next) => {
  console.log('📬 [API-TOP] POST /api/posts/:postId/react - Called');
  try {
    const { postId } = req.params;
    const { userId, emoji, userName, userAvatar } = req.body;
    if (!userId || !emoji) return res.status(400).json({ success: false, error: 'userId/emoji required' });
    const Post = mongoose.model('Post');
    let post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    if (!post.reactions) post.reactions = [];
    const existingIndex = post.reactions.findIndex(r => r.userId === userId);
    if (existingIndex >= 0) {
      if (post.reactions[existingIndex].emoji === emoji) post.reactions.splice(existingIndex, 1);
      else {
        post.reactions[existingIndex].emoji = emoji;
        post.reactions[existingIndex].userName = userName || post.reactions[existingIndex].userName;
        post.reactions[existingIndex].userAvatar = userAvatar || post.reactions[existingIndex].userAvatar;
        post.reactions[existingIndex].createdAt = new Date();
      }
    } else {
      post.reactions.push({ userId, emoji, userName: userName || 'User', userAvatar: userAvatar || '', createdAt: new Date() });
    }
    post.markModified('reactions');
    await post.save();
    console.log(`   ✅ Post ${postId} reacted with ${emoji}. Count: ${post.reactions.length}`);
    res.json({ success: true, data: post });
  } catch (err) {
    console.error('❌ [API-TOP] React error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================================================

// ============= DATABASE CONNECTION =============
const mongoUri = process.env.MONGO_URI;
if (mongoUri) {
  mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000 // Give it 15 seconds
  })
    .then(() => {
      console.log('✅ MongoDB connected');
    })
    .catch(err => {
      console.error('❌ MongoDB Connection Error:', err.message);
      console.warn('⚠️ Server running but database disconnected. Check IP whitelist!');
    });
} else {
  console.warn('⚠️ MONGO_URI not set in .env');
}

// ============= MIDDLEWARE =============
// Check database connectivity for all /api routes except health
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();

  if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
    console.warn(`⚠️ [API] ${req.method} ${req.path} - Database not connected (readyState: ${mongoose.connection.readyState})`);
    return res.status(503).json({
      success: false,
      error: 'Database connection pending. Please check your MongoDB IP whitelist.',
      readyState: mongoose.connection.readyState
    });
  }
  next();
});

// ============= ROUTES =============
// CRITICAL: Register router-based routes FIRST before inline routes to avoid conflicts
console.log('🔧 Loading router-based routes first...');

// Passport routes - MUST be registered before /api/users to avoid conflicts
try {
  app.use('/api', require('../routes/passport'));
  console.log('  ✅ /api/passport loaded - REGISTERED FIRST');
} catch (err) {
  console.warn('  ⚠️ /api/passport error:', err.message);
}

// User routes - REGISTER FIRST for nested routes like /api/users/:userId/posts
try {
  app.use('/api/users', require('../routes/users'));
  console.log('  ✅ /api/users (router) loaded - REGISTERED FIRST');
} catch (err) {
  console.warn('  ⚠️ /api/users (router) error:', err.message);
}

// Conversations routes - MUST be registered before inline /api/conversations handler below
try {
  app.use('/api/conversations', require('../routes/conversations'));
  console.log('  ✅ /api/conversations (router) loaded - REGISTERED FIRST');
} catch (err) {
  console.warn('  ⚠️ /api/conversations (router) error:', err.message);
}
/**
 * Helper to enrich posts with latest user data (for reactions and comments)
 * Fixes "de-normalization" issues where stale avatars are stored in reactions/comments
 */

async function enrichPostsWithUserData(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return posts;

  try {
    const User = mongoose.model('User');
    const isBadAvatar = (value) => {
      if (typeof value !== 'string') return true;
      const v = value.trim().toLowerCase();
      if (!v || v === 'null' || v === 'undefined' || v === 'n/a' || v === 'na') return true;
      if (v.includes('via.placeholder.com/200x200.png?text=profile')) return true;
      if (v.includes('/default%2fdefault-pic.jpg') || v.includes('/default/default-pic.jpg')) return true;
      if (v.includes('avatardefault.webp')) return true;
      return false;
    };
    
    // Collect all unique user IDs from reactions and inline comments
    const userIds = new Set();
    posts.forEach(post => {
      const p = post.toObject ? post.toObject() : post;
      const authorRef = String(p.userId?._id || p.userId || '');
      if (authorRef) userIds.add(authorRef);
      if (Array.isArray(p.reactions)) {
        p.reactions.forEach(r => { if (r.userId) userIds.add(String(r.userId)); });
      }
      if (Array.isArray(p.comments)) {
        p.comments.forEach(c => { if (c.userId) userIds.add(String(c.userId)); });
      }
    });

    if (userIds.size === 0) return posts;

    const userIdsArray = Array.from(userIds);
    const users = await User.find({
      $or: [
        { _id: { $in: userIdsArray.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
        { firebaseUid: { $in: userIdsArray } },
        { uid: { $in: userIdsArray } }
      ]
    }).lean();

    const userMap = {};
    users.forEach(u => {
      const id = u._id.toString();
      const fuid = u.firebaseUid || u.uid;
      const avatar = u.avatar || u.photoURL || u.profilePicture || null;
      const name = u.displayName || u.name || 'User';
      const profile = {
        avatar,
        photoURL: u.photoURL || avatar || null,
        profilePicture: u.profilePicture || avatar || null,
        name,
        displayName: u.displayName || name
      };
      
      if (id) userMap[id] = profile;
      if (fuid) userMap[fuid] = profile;
    });

    return posts.map(post => {
      const p = post.toObject ? post.toObject() : post;
      const authorRef = String(p.userId?._id || p.userId || '');
      const author = userMap[authorRef];

      if (author) {
        if (p.userId && typeof p.userId === 'object') {
          p.userId = {
            ...p.userId,
            avatar: author.avatar || p.userId.avatar || p.userId.photoURL || p.userId.profilePicture || null,
            photoURL: author.photoURL || p.userId.photoURL || p.userId.avatar || p.userId.profilePicture || null,
            profilePicture: author.profilePicture || p.userId.profilePicture || p.userId.avatar || p.userId.photoURL || null,
            displayName: p.userId.displayName || author.displayName || author.name,
            name: p.userId.name || author.name || author.displayName
          };
        }

        if (isBadAvatar(p.userAvatar)) {
          p.userAvatar = author.avatar || author.photoURL || author.profilePicture || p.userAvatar || null;
        }
        if (!p.userName) {
          p.userName = author.name || author.displayName || 'User';
        }
      }
      
      // Enrich reactions
      if (Array.isArray(p.reactions)) {
        p.reactions = p.reactions.map(r => ({
          ...r,
          userName: userMap[String(r.userId)]?.name || r.userName || 'User',
          userAvatar: userMap[String(r.userId)]?.avatar || userMap[String(r.userId)]?.photoURL || userMap[String(r.userId)]?.profilePicture || r.userAvatar || null
        }));
      }

      // Enrich inline comments (if any)
      if (Array.isArray(p.comments)) {
        p.comments = p.comments.map(c => ({
          ...c,
          userName: userMap[String(c.userId)]?.name || c.userName || 'User',
          userAvatar: userMap[String(c.userId)]?.avatar || userMap[String(c.userId)]?.photoURL || userMap[String(c.userId)]?.profilePicture || c.userAvatar || null
        }));
      }

      return p;
    });
  } catch (err) {
    console.warn('[enrichPostsWithUserData] Warning:', err.message);
    return posts;
  }
}



// GET /api/posts/location-count - Get location count (MUST be before /:postId)
app.get('/api/posts/location-count', async (req, res, next) => {
  try {
    const Post = mongoose.model('Post');
    const locations = await Post.aggregate([
      { $match: { location: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$location', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]).catch(() => []);

    return res.json({
      success: true,
      hasData: locations && locations.length > 0,
      data: locations || []
    });
  } catch (err) {
    console.error('[GET] /api/posts/location-count error:', err.message);
    return res.json({ success: true, hasData: false, data: [] });
  }
});
console.log('  ✅ /api/posts/location-count loaded');

// GET /api/posts/by-location (MUST be before /:postId)
app.get('/api/posts/by-location', async (req, res, next) => {
  try {
    const locationRaw = typeof req.query.location === 'string' ? req.query.location : '';
    const location = locationRaw.trim();
    const viewerId = req.headers.userid || req.query.viewerId || req.query.requesterUserId || null;

    const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    if (!location) {
      return res.status(200).json({ success: true, data: [] });
    }

    const Post = mongoose.model('Post');
    const exact = new RegExp(`^${escapeRegExp(location)}$`, 'i');
    const contains = new RegExp(escapeRegExp(location), 'i');
    const locationParts = String(location).split(',').map((p) => p.trim()).filter(Boolean);
    const primaryPart = locationParts[0] || location;
    const keys = uniqueLocationKeys([location, primaryPart]);
    const query = {
      $or: [
        { locationKeys: { $in: keys } },
        { 'locationData.name': { $regex: exact } },
        { 'locationData.name': { $regex: contains } },
        { location: { $regex: exact } },
        { location: { $regex: contains } },
        { 'locationData.address': { $regex: contains } },
        { 'locationData.city': { $regex: exact } },
        { 'locationData.country': { $regex: exact } },
        { 'locationData.countryCode': { $regex: exact } }
      ]
    };

    // Over-fetch, then apply visibility filter and final pagination.
    const rawPosts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.max(skip + limit, limit) * 3)
      .catch(() => []);

    // Resolve viewer variants for robust ID matching
    const viewerVariants = viewerId ? (await resolveUserIdentifiers(viewerId)).candidates : [];

    const authorIds = [...new Set((Array.isArray(rawPosts) ? rawPosts : []).map(p => {
      const obj = p && p.toObject ? p.toObject() : p;
      return String(obj?.userId?._id || obj?.userId || '');
    }).filter(Boolean))];

    const authorGroupsMap = {};
    if (authorIds.length > 0) {
      try {
        const GroupModel = mongoose.model('Group');
        const allAuthorGroups = await GroupModel.find({ userId: { $in: authorIds } });
        for (const g of allAuthorGroups) {
          if (!authorGroupsMap[g.userId]) authorGroupsMap[g.userId] = { friendIds: [], familyMemberIds: [] };
          if (g.type === 'friends') authorGroupsMap[g.userId].friendIds = [...authorGroupsMap[g.userId].friendIds, ...g.members];
          if (g.type === 'family') authorGroupsMap[g.userId].familyMemberIds = [...authorGroupsMap[g.userId].familyMemberIds, ...g.members];
        }
      } catch (e) {
        console.warn('[/api/posts/by-location] Could not load author groups:', e.message);
      }
    }

    const enriched = (Array.isArray(rawPosts) ? rawPosts : [])
      .map(p => (p && p.toObject ? p.toObject() : p))
      .map(postObj => {
        let likesCount = postObj.likesCount;
        const likesArray = postObj.likes || [];
        const calculatedCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'object' ? Object.keys(likesArray).length : 0);
        if (!likesCount || likesCount === undefined || likesCount === 0) likesCount = calculatedCount;

        let commentCount = postObj.commentCount !== undefined ? postObj.commentCount : postObj.commentsCount;
        if (commentCount === undefined || commentCount === null) commentCount = 0;

        return {
          ...postObj,
          likesCount,
          commentCount,
          location: postObj.location || normalizePostLocation(postObj),
          isPrivate: postObj.isPrivate || false,
          allowedFollowers: postObj.allowedFollowers || []
        };
      })
      .filter(postObj => {
        const authorId = String(postObj.userId?._id || postObj.userId || '');
        const authorGroups = authorGroupsMap[authorId] || { friendIds: [], familyMemberIds: [] };
        return isPostVisibleToViewer(postObj, viewerVariants, authorGroups.friendIds, authorGroups.familyMemberIds);
      })
      .slice(skip, skip + limit);

    const finalPosts = await enrichPostsWithUserData(enriched);
    return res.status(200).json({ success: true, data: finalPosts });
  } catch (err) {
    console.error('[GET] /api/posts/by-location error:', err.message);
    return res.status(200).json({ success: true, data: [] });
  }
});
console.log('  ✅ /api/posts/by-location loaded');

// GET /api/posts/:postId - Get single post detail
app.get('/api/posts/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    if (!postId) return res.status(400).json({ success: false, error: 'Post ID required' });

    const Post = mongoose.model('Post');

    // 1. Try finding by _id (ObjectId)
    let post = null;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId).populate('userId', 'displayName name avatar profilePicture photoURL isPrivate followers');
    }

    // 2. If not found, try finding by custom 'id' field
    if (!post) {
      post = await Post.findOne({ id: postId }).populate('userId', 'displayName name avatar profilePicture photoURL isPrivate followers');
    }

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const postObj = post.toObject ? post.toObject() : post;

    // Visibility Check
    const currentUserId = req.headers.userid || req.query.viewerId || null;
    let friendIdList = [];
    let familyMemberIdList = [];
    
    // If the post is not public, check if the viewer/author relationship allows viewing
    if (currentUserId && (postObj.visibility !== 'Everyone' || postObj.isPrivate)) {
       try {
         const Group = mongoose.model('Group');
         const authorId = String(postObj.userId?._id || postObj.userId || '');
         // Get author's groups to see if viewer is in them
         const authorGroups = await Group.find({ userId: authorId });
         for (const g of authorGroups) {
           if (g.type === 'friends') friendIdList = [...friendIdList, ...g.members];
           if (g.type === 'family') familyMemberIdList = [...familyMemberIdList, ...g.members];
         }
       } catch (e) {
         console.warn('[/api/posts/:postId] Group check error:', e.message);
       }
    }

    if (!isPostVisibleToViewer(postObj, currentUserId, friendIdList, familyMemberIdList)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to view this post' });
    }

    // Enrich with counts
    let likesCount = postObj.likesCount;
    const likesArray = postObj.likes || [];
    const calculatedCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'object' ? Object.keys(likesArray).length : 0);
    if (!likesCount || likesCount === 0) likesCount = calculatedCount;

    let commentCount = postObj.commentCount !== undefined ? postObj.commentCount : postObj.commentsCount;
    if (commentCount === undefined || commentCount === null) commentCount = 0;

    const enrichedPost = (await enrichPostsWithUserData([post]))[0];

    res.json({
      success: true,
      data: {
        ...enrichedPost,
        likesCount,
        commentCount
      }
    });
  } catch (err) {
    next(err);
  }
});


// DELETE /api/posts/:postId - Delete a post
app.delete('/api/posts/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { currentUserId } = req.body;

    if (!postId) return res.status(400).json({ success: false, error: 'Post ID required' });

    const Post = mongoose.model('Post');

    // 1. Find the post first to check ownership
    let post = null;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId);
    }
    if (!post) {
      post = await Post.findOne({ id: postId });
    }

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // 2. Check ownership if currentUserId is provided
    // Ensure we compare strings as IDs might be ObjectIds or strings
    if (currentUserId && String(post.userId) !== String(currentUserId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only delete your own posts' });
    }

    // 3. Delete the post
    let result;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      result = await Post.deleteOne({ _id: new mongoose.Types.ObjectId(postId) });
    } else {
      result = await Post.deleteOne({ id: postId });
    }

    if (result.deletedCount === 0) {
      return res.status(503).json({ success: false, error: 'Failed to delete post' });
    }

    console.log(`✅ [API] Post ${postId} deleted by user ${currentUserId}`);
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Comments routes
try {
  // Correctly mount on /api so that internal routes like /posts/:postId/comments resolve correctly
  app.use('/api', require('../routes/comments'));
  console.log('  ✅ /api/comments (router) loaded on /api');
} catch (err) {
  console.warn('  ⚠️ /api/comments (router) error:', err.message);
}

// ============= GROUPS =============
// Group Schema (define once, guard against OverwriteModelError)
let Group;
try {
  Group = mongoose.model('Group');
} catch {
  const groupSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['friends', 'family', 'custom'], default: 'custom' },
    members: [{ type: String }],   // array of user IDs
    createdAt: { type: Date, default: Date.now }
  });
  Group = mongoose.model('Group', groupSchema);
}

// POST /api/groups - create group
app.post('/api/groups', async (req, res, next) => {
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
app.get('/api/groups', async (req, res, next) => {
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
app.put('/api/groups/:groupId', async (req, res, next) => {
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
app.put('/api/groups/:groupId/members/add', async (req, res, next) => {
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
app.put('/api/groups/:groupId/members/remove', async (req, res, next) => {
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
app.delete('/api/groups/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findByIdAndDelete(groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

console.log('  ✅ /api/groups routes registered');
// ============= END GROUPS =============

// Then load inline routes
console.log('🔧 Loading critical inline GET routes...');

app.get('/api/live-streams', async (req, res, next) => {
  console.log('  → GET /api/live-streams called');
  try {
    const LiveStream = mongoose.model('LiveStream');
    const streams = await LiveStream.find({ isActive: true }).sort({ createdAt: -1 });

    // Convert to plane objects if they are mongoose docs
    const rawStreams = streams.map(s => s.toObject ? s.toObject() : s);

    const normalized = rawStreams.map(s => {
      const id = s?._id ? String(s._id) : (s?.id ? String(s.id) : undefined);
      const isActive = typeof s?.isActive === 'boolean'
        ? s.isActive
        : (typeof s?.isLive === 'boolean' ? s.isLive : true);

      const viewerCount = typeof s?.viewerCount === 'number'
        ? s.viewerCount
        : (Array.isArray(s?.viewers) ? s.viewers.length : 0);

      const roomId = (typeof s?.roomId === 'string' && s.roomId)
        ? s.roomId
        : ((typeof s?.channelName === 'string' && s.channelName) ? s.channelName : undefined);

      return {
        ...s,
        id,
        _id: s?._id,
        isActive,
        isLive: typeof s?.isLive === 'boolean' ? s.isLive : isActive,
        startedAt: s?.startedAt || s?.createdAt,
        viewerCount,
        roomId,
        channelName: roomId || s?.channelName,
      };
    });

    return res.status(200).json({ success: true, streams: normalized });
  } catch (err) {
    console.warn('[GET] /api/live-streams error:', err.message);
    return res.status(200).json({ success: true, streams: [] });
  }
});
console.log('  ✅ /api/live-streams loaded');

// GET /api/live-streams/:streamId - Get single live stream detail
app.get('/api/live-streams/:streamId', async (req, res, next) => {
  try {
    const { streamId } = req.params;
    const LiveStream = mongoose.model('LiveStream');
    const stream = await LiveStream.findById(streamId);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    const id = stream?._id ? String(stream._id) : (stream?.id ? String(stream.id) : undefined);
    const isActive = typeof stream?.isActive === 'boolean'
      ? stream.isActive
      : (typeof stream?.isLive === 'boolean' ? stream.isLive : true);
    const viewerCount = typeof stream?.viewerCount === 'number'
      ? stream.viewerCount
      : (Array.isArray(stream?.viewers) ? stream.viewers.length : 0);
    const roomId = (typeof stream?.roomId === 'string' && stream.roomId)
      ? stream.roomId
      : ((typeof stream?.channelName === 'string' && stream.channelName) ? stream.channelName : undefined);

    const streamObj = stream.toObject ? stream.toObject() : stream;

    return res.json({
      success: true,
      data: {
        ...streamObj,
        id,
        _id: streamObj?._id,
        isActive,
        isLive: typeof streamObj?.isLive === 'boolean' ? streamObj.isLive : isActive,
        startedAt: streamObj?.startedAt || streamObj?.createdAt,
        viewerCount,
        roomId,
        channelName: roomId || streamObj?.channelName,
      }
    });
  } catch (err) {
    next(err);
  }
});

// Health check endpoint for monitoring and cold start detection
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
  };

  res.status(200).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      readyState: dbStatus,
      status: statusMap[dbStatus] || 'unknown'
    }
  });
});

app.get('/api/posts', async (req, res, next) => {
  if (ENABLE_POSTS_DEBUG_LOGS) {
    console.log('🟢 [INLINE] GET /api/posts CALLED with query:', req.query);
  }
  try {
    const { skip = 0, limit = 50 } = req.query;
    const currentUserId = req.headers.userid || req.query.viewerId || req.query.requesterUserId || null;
    const viewerVariants = currentUserId ? (await resolveUserIdentifiers(currentUserId)).candidates : [];

    // Fetch viewer's friend IDs and family member IDs (for visibility filtering)
    let friendIds = [];
    let familyMemberIds = [];
    if (viewerVariants.length > 0) {
      try {
        const viewerGroups = await Group.find({ userId: { $in: viewerVariants } });
        for (const g of viewerGroups) {
          if (g.type === 'friends') friendIds = [...friendIds, ...g.members];
          if (g.type === 'family') familyMemberIds = [...familyMemberIds, ...g.members];
        }
      } catch (e) {
        console.warn('[/api/posts] Could not load viewer groups:', e.message);
      }
    }

    // INITIAL QUERY: Expand to include posts shared with viewer via allowedFollowers
    const baseQuery = (viewerVariants.length > 0) 
      ? { $or: [ { isPrivate: { $ne: true } }, { userId: { $in: viewerVariants } }, { allowedFollowers: { $in: viewerVariants } } ] }
      : { isPrivate: { $ne: true } };

    const posts = await mongoose.model('Post').find(baseQuery)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate followers')
      .catch(() => []);

    // For each post, fetch the author's groups to check if viewer is in them
    // We gather unique authorIds to batch fetch
    const authorIds = [...new Set(posts.map(p => {
      const obj = p.toObject ? p.toObject() : p;
      return String(obj.userId?._id || obj.userId || '');
    }).filter(Boolean))];

    // Build a map of authorId -> { friendIds, familyMemberIds }
    const authorGroupsMap = {};
    if (authorIds.length > 0) {
      try {
        const allAuthorGroups = await Group.find({ userId: { $in: authorIds } });
        for (const g of allAuthorGroups) {
          if (!authorGroupsMap[g.userId]) authorGroupsMap[g.userId] = { friendIds: [], familyMemberIds: [] };
          if (g.type === 'friends') authorGroupsMap[g.userId].friendIds = [...authorGroupsMap[g.userId].friendIds, ...g.members];
          if (g.type === 'family') authorGroupsMap[g.userId].familyMemberIds = [...authorGroupsMap[g.userId].familyMemberIds, ...g.members];
        }
      } catch (e) {
        console.warn('[/api/posts] Could not load author groups:', e.message);
      }
    }

    // Enrich posts and apply visibility filter
    const enrichedPosts = posts
      .map(post => {
        const postObj = post.toObject ? post.toObject() : post;

        let likesCount = postObj.likesCount;
        const likesArray = postObj.likes || [];
        const calculatedCount = Array.isArray(likesArray) ? likesArray.length : (typeof likesArray === 'object' ? Object.keys(likesArray).length : 0);
        if (!likesCount || likesCount === undefined || likesCount === 0) {
          likesCount = calculatedCount;
        }

        let commentCount = postObj.commentCount !== undefined ? postObj.commentCount : postObj.commentsCount;
        if (commentCount === undefined || commentCount === null) {
          commentCount = 0;
        }

        return {
          ...postObj,
          likesCount,
          commentCount,
          isPrivate: postObj.isPrivate || false,
          allowedFollowers: postObj.allowedFollowers || []
        };
      })
      .filter(postObj => {
        const authorId = String(postObj.userId?._id || postObj.userId || '');
        const authorGroups = authorGroupsMap[authorId] || { friendIds: [], familyMemberIds: [] };
        return isPostVisibleToViewer(postObj, viewerVariants, authorGroups.friendIds, authorGroups.familyMemberIds);
      });

    // Enrich reactions and comments with latest user data
    const finalPosts = await enrichPostsWithUserData(enrichedPosts);

    if (ENABLE_POSTS_DEBUG_LOGS) {
      console.log('🟢 [INLINE] /api/posts SUCCESS - returning', finalPosts.length, 'posts (visibility filtered)');
    }
    res.status(200).json({ success: true, data: finalPosts });
  } catch (err) {
    console.log('🟢 [INLINE] /api/posts ERROR:', err.message);
    res.status(200).json({ success: true, data: [] });
  }
});

// GET /api/posts/feed - Get feed posts (MUST be before /:postId)
app.get('/api/posts/feed', async (req, res, next) => {
  try {
    const currentUserId = req.headers.userid || req.query.viewerId || req.query.requesterUserId || null;
    const viewerVariants = currentUserId ? (await resolveUserIdentifiers(currentUserId)).candidates : [];

    // Load author groups for visibility check
    // INITIAL QUERY: Expand for the feed as well
    const feedQuery = (viewerVariants.length > 0)
      ? { $or: [ { isPrivate: { $ne: true } }, { userId: { $in: viewerVariants } }, { allowedFollowers: { $in: viewerVariants } } ] }
      : { isPrivate: { $ne: true } };

    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const skip = parseInt(String(req.query.skip || '0'), 10) || 0;

    const posts = await mongoose.model('Post').find(feedQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'displayName name avatar profilePicture photoURL');

    const authorIds = [...new Set(posts.map(p => {
      const obj = p.toObject ? p.toObject() : p;
      return String(obj.userId?._id || obj.userId || '');
    }).filter(Boolean))];

    const authorGroupsMap = {};
    if (authorIds.length > 0) {
      try {
        const allAuthorGroups = await Group.find({ userId: { $in: authorIds } });
        for (const g of allAuthorGroups) {
          if (!authorGroupsMap[g.userId]) authorGroupsMap[g.userId] = { friendIds: [], familyMemberIds: [] };
          if (g.type === 'friends') authorGroupsMap[g.userId].friendIds = [...authorGroupsMap[g.userId].friendIds, ...g.members];
          if (g.type === 'family') authorGroupsMap[g.userId].familyMemberIds = [...authorGroupsMap[g.userId].familyMemberIds, ...g.members];
        }
      } catch (e) {
        console.warn('[/api/posts/feed] Could not load author groups:', e.message);
      }
    }

    const enrichedPosts = (Array.isArray(posts) ? posts : [])
      .map(p => {
        const postObj = p.toObject ? p.toObject() : p;
        return {
          ...postObj,
          isPrivate: postObj.isPrivate || false,
          allowedFollowers: postObj.allowedFollowers || []
        };
      })
      .filter(postObj => {
        const authorId = String(postObj.userId?._id || postObj.userId || '');
        const authorGroups = authorGroupsMap[authorId] || { friendIds: [], familyMemberIds: [] };
        return isPostVisibleToViewer(postObj, viewerVariants, authorGroups.friendIds, authorGroups.familyMemberIds);
      });

    const finalPosts = await enrichPostsWithUserData(enrichedPosts);
    res.status(200).json({ success: true, data: finalPosts });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});
console.log('  ✅ /api/posts/feed loaded');


function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePostLocation(postObj) {
  const loc = (postObj && postObj.locationData && postObj.locationData.name) ? postObj.locationData.name : postObj.location;
  return (typeof loc === 'string') ? loc.trim() : '';
}

function normalizeLocationKey(val) {
  return String(val || '').trim().toLowerCase();
}

function uniqueLocationKeys(keys) {
  const out = [];
  const seen = new Set();
  for (const k of Array.isArray(keys) ? keys : []) {
    const n = normalizeLocationKey(k);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function buildLocationKeysFromPayload(location, locationData, explicitKeys) {
  const keys = [];

  if (Array.isArray(explicitKeys)) {
    keys.push(...explicitKeys);
  }

  if (locationData && typeof locationData === 'object') {
    keys.push(locationData.name);
    keys.push(locationData.neighborhood);
    keys.push(locationData.city);
    keys.push(locationData.country);
    keys.push(locationData.countryCode);

    const addr = typeof locationData.address === 'string' ? locationData.address : '';
    if (addr) {
      const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 1) keys.push(parts[0]);
      if (parts.length >= 2) keys.push(parts[1]);
      if (parts.length >= 1) keys.push(parts[parts.length - 1]);
    }
  }

  keys.push(location);

  const normalized = uniqueLocationKeys(keys);

  const countryCode = normalizeLocationKey(locationData && locationData.countryCode);
  const country = normalizeLocationKey(locationData && locationData.country);
  if (countryCode === 'gb' || country === 'uk' || country === 'united kingdom') {
    if (!normalized.includes('uk')) normalized.push('uk');
    if (!normalized.includes('united kingdom')) normalized.push('united kingdom');
  }

  return uniqueLocationKeys(normalized);
}

function formatLocationLabel(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'uk') return 'UK';
  if (lower === 'united kingdom') return 'United Kingdom';
  if (/[A-Z]/.test(raw)) return raw;
  return lower
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isPostVisibleToViewer(postObj, viewerIdOrVariants, friendIds, familyMemberIds) {
  if (!postObj) return false;

  // 1. Resolve Identities
  const authorId = String(postObj.userId?._id || postObj.userId || '');
  const viewerVariants = Array.isArray(viewerIdOrVariants) ? viewerIdOrVariants : (viewerIdOrVariants ? [String(viewerIdOrVariants)] : []);
  const isOwner = (authorId && viewerVariants.includes(authorId));

  // Author always sees their own post
  if (isOwner) return true;

  // 2. Resolve Visibility Data
  const visibility = postObj.visibility || (postObj.audience === 'everyone' ? 'Everyone' : (postObj.isPrivate ? 'Friends' : 'Everyone'));
  const allowed = Array.isArray(postObj.allowedFollowers) ? postObj.allowedFollowers.map(String) : [];
  const isTargeted = allowed.some(id => viewerVariants.includes(String(id)));

  // If explicitly allowed (e.g. via group membership during creation), show it immediately
  if (isTargeted) return true;

  // 3. Public/Private Account Logic
  if (visibility === 'Everyone') {
    // Note: If account is private, we usually expect follows check here, 
    // but this helper often handles post-level visibility. 
    // If the account-level privacy is the only thing, we check if Everyone is true.
    return true; 
  }

  // From here on, viewer must be logged in for non-public posts
  if (viewerVariants.length === 0) return false;

  // 4. Semantic checks for Friends/Family groups
  const visLower = visibility.toLowerCase();
  const viewerInFriends = Array.isArray(friendIds) && friendIds.some(id => viewerVariants.includes(String(id)));
  const viewerInFamily = Array.isArray(familyMemberIds) && familyMemberIds.some(id => viewerVariants.includes(String(id)));
  
  if (visLower === 'friends' && viewerInFriends) return true;
  if (visLower === 'family' && viewerInFamily) return true;

  return false;
}

app.get('/api/locations/suggest', async (req, res, next) => {
  try {
    const qRaw = typeof req.query.q === 'string' ? req.query.q : '';
    const q = qRaw.trim();
    const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 25);

    if (!q) return res.json({ success: true, data: [] });

    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(q), 'i');

    const results = await Post.aggregate([
      {
        $facet: {
          keys: [
            { $match: { locationKeys: { $exists: true, $ne: [] } } },
            { $unwind: '$locationKeys' },
            { $match: { locationKeys: { $regex: regex } } },
            {
              $group: {
                _id: '$locationKeys',
                count: { $sum: 1 },
                verifiedCount: {
                  $sum: {
                    $cond: [{ $eq: ['$locationData.verified', true] }, 1, 0]
                  }
                }
              }
            },
            { $sort: { count: -1 } },
            { $limit: limit }
          ],
          names: [
            {
              $addFields: {
                _locName: {
                  $ifNull: ['$locationData.name', '$location']
                }
              }
            },
            {
              $match: {
                $and: [
                  { _locName: { $ne: null } },
                  { _locName: { $ne: '' } },
                  { _locName: { $regex: regex } }
                ]
              }
            },
            {
              $group: {
                _id: '$_locName',
                count: { $sum: 1 },
                verifiedCount: {
                  $sum: {
                    $cond: [{ $eq: ['$locationData.verified', true] }, 1, 0]
                  }
                }
              }
            },
            { $sort: { count: -1 } },
            { $limit: limit }
          ]
        }
      }
    ]).catch(() => []);

    const facet = Array.isArray(results) && results.length > 0 ? results[0] : { keys: [], names: [] };
    const merged = [...(Array.isArray(facet.keys) ? facet.keys : []), ...(Array.isArray(facet.names) ? facet.names : [])];
    const byName = new Map();
    for (const r of merged) {
      const name = typeof r?._id === 'string' ? r._id : String(r?._id || '');
      if (!name) continue;
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          count: typeof r?.count === 'number' ? r.count : 0,
          verifiedCount: typeof r?.verifiedCount === 'number' ? r.verifiedCount : 0,
        });
      } else {
        const prev = byName.get(name);
        prev.count = Math.max(prev.count, typeof r?.count === 'number' ? r.count : 0);
        prev.verifiedCount = Math.max(prev.verifiedCount, typeof r?.verifiedCount === 'number' ? r.verifiedCount : 0);
      }
    }

    const data = Array.from(byName.values())
      .map((r) => ({
        ...r,
        name: formatLocationLabel(r.name),
      }))
      .filter((r) => r.name)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, limit);

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[GET] /api/locations/suggest error:', err.message);
    return res.status(200).json({ success: true, data: [] });
  }
});

app.get('/api/locations/meta', async (req, res, next) => {
  try {
    const locationRaw = typeof req.query.location === 'string' ? req.query.location : '';
    const location = locationRaw.trim();
    const viewerId = req.headers.userid || req.query.viewerId || null;

    if (!location) return res.status(400).json({ success: false, error: 'location query parameter required' });

    const Post = mongoose.model('Post');
    const exact = new RegExp(`^${escapeRegExp(location)}$`, 'i');
    const contains = new RegExp(escapeRegExp(location), 'i');
    const locationParts = String(location).split(',').map((p) => p.trim()).filter(Boolean);
    const primaryPart = locationParts[0] || location;
    const keys = uniqueLocationKeys([location, primaryPart]);
    const query = {
      $or: [
        { locationKeys: { $in: keys } },
        { 'locationData.name': { $regex: exact } },
        { 'locationData.name': { $regex: contains } },
        { location: { $regex: exact } },
        { location: { $regex: contains } },
        { 'locationData.address': { $regex: contains } },
        { 'locationData.city': { $regex: exact } },
        { 'locationData.country': { $regex: exact } },
        { 'locationData.countryCode': { $regex: exact } }
      ]
    };

    const posts = await Post.find(query)
      .select('userId isPrivate allowedFollowers location locationData')
      .limit(5000)
      .catch(() => []);

    const visible = (Array.isArray(posts) ? posts : [])
      .map(p => (p && p.toObject ? p.toObject() : p))
      .filter(p => isPostVisibleToViewer(p, viewerId));

    const postCount = visible.length;
    const verifiedVisits = visible.filter(p => p?.locationData?.verified).length;

    return res.status(200).json({
      success: true,
      data: {
        location,
        postCount,
        visits: postCount,
        verifiedVisits,
      }
    });
  } catch (err) {
    console.error('[GET] /api/locations/meta error:', err.message);
    return res.status(200).json({ success: true, data: { postCount: 0, visits: 0, verifiedVisits: 0 } });
  }
});



// POST /api/posts - Create new post
app.post('/api/posts', async (req, res, next) => {
  try {
    const { userId, content, caption, mediaUrls, imageUrls, location, locationData, locationKeys, mediaType, category, hashtags, mentions, taggedUserIds, visibility, allowedFollowers: bodyAllowedFollowers } = req.body;

    // Accept both 'content' and 'caption' for compatibility
    const finalContent = content || caption || '';

    // Handle both single imageUrl and mediaUrls array
    const images = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (imageUrls ? imageUrls : []);

    // Validation: Either content or media is required
    if (!userId || (!finalContent && (!images || images.length === 0))) {
      return res.status(400).json({ success: false, error: 'userId and either caption or media required' });
    }

    const Post = mongoose.model('Post');
    const User = mongoose.model('User');

    // Get user's privacy setting as a fallback
    const user = await User.findById(userId).catch(() => null);
    
    // Determine post-level privacy
    // If visibility is explicitly provided (not Everyone), it's private.
    // Otherwise fallback to user's account privacy.
    const vis = visibility || 'Everyone';
    const isPrivate = (vis !== 'Everyone') || (user?.isPrivate || false);
    
    // allowedFollowers: use body value if provided (e.g. group members),
    // otherwise if it's a private account post, use all followers.
    const allowedFollowers = (Array.isArray(bodyAllowedFollowers) && bodyAllowedFollowers.length > 0)
      ? bodyAllowedFollowers 
      : (isPrivate ? (user?.followers || []) : []);

    const newPost = new Post({
      userId,
      content: finalContent,
      caption: finalContent,
      imageUrl: images[0] || null,
      mediaUrls: images || [],
      location: location || null,
      locationData: locationData || {},
      locationKeys: buildLocationKeysFromPayload(location || '', locationData || {}, locationKeys),
      mediaType: mediaType || 'image',
      category: category || null,
      hashtags: hashtags || [],
      mentions: mentions || [],
      taggedUserIds: taggedUserIds || [],
      likes: [],
      likesCount: 0,
      comments: 0,
      commentsCount: 0,
      isPrivate,
      visibility: vis,
      allowedFollowers,
      createdAt: new Date(),
    });

    const saved = await newPost.save();

    try {
      const Notification = mongoose.model('Notification');
      const mentioned = Array.isArray(mentions) ? mentions.map(String) : [];
      const tagged = Array.isArray(taggedUserIds) ? taggedUserIds.map(String) : [];

      const docs = [];

      for (const m of mentioned) {
        if (!m || m === String(userId)) continue;
        docs.push({
          recipientId: String(m),
          senderId: String(userId),
          type: 'mention',
          postId: String(saved._id),
          message: 'mentioned you in a post',
          read: false,
          createdAt: new Date()
        });
      }

      for (const t of tagged) {
        if (!t || t === String(userId)) continue;
        docs.push({
          recipientId: String(t),
          senderId: String(userId),
          type: 'tag',
          postId: String(saved._id),
          message: 'tagged you in a post',
          read: false,
          createdAt: new Date()
        });
      }

      if (docs.length > 0) {
        await Notification.insertMany(docs);
      }
    } catch (e) {
      console.warn('[POST] /api/posts - Mention/tag notifications skipped:', e.message);
    }

    // Populate user data
    const populated = await Post.findById(saved._id)
      .populate('userId', 'displayName name avatar profilePicture photoURL');

    console.log('[POST] /api/posts - Created post:', populated._id);
    return res.status(201).json({ success: true, data: populated, postId: populated._id });
  } catch (err) {
    next(err);
  }
});

// POST /api/live-streams - Start new live stream
app.post('/api/live-streams', async (req, res, next) => {
  try {
    const { userId, title, roomId, channelName, userName, userAvatar } = req.body;
    if (!userId || !title) {
      return res.status(400).json({ success: false, error: 'userId and title required' });
    }

    const LiveStream = mongoose.model('LiveStream');

    const resolvedRoomId = (typeof roomId === 'string' && roomId)
      ? roomId
      : ((typeof channelName === 'string' && channelName) ? channelName : null);

    const newStream = {
      userId,
      title,
      roomId: resolvedRoomId,
      channelName: resolvedRoomId,
      userName: typeof userName === 'string' ? userName : null,
      userAvatar: typeof userAvatar === 'string' ? userAvatar : null,
      isActive: true,
      isLive: true,
      viewers: [],
      viewerCount: 0,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const savedStream = await new LiveStream(newStream).save();
    const result = { insertedId: savedStream._id };

    // Best-effort: notify followers that user started live
    try {
      const Follow = mongoose.model('Follow');
      const Notification = mongoose.model('Notification');
      const follows = await Follow.find({ followingId: String(userId) }).lean();
      const followerIds = follows.map(f => String(f.followerId)).filter(Boolean);
      if (followerIds.length > 0) {
        const docs = followerIds
          .filter(fid => fid !== String(userId))
          .map(fid => ({
            recipientId: String(fid),
            senderId: String(userId),
            type: 'live',
            streamId: String(result.insertedId),
            message: 'started a live stream',
            read: false,
            createdAt: new Date()
          }));

        if (docs.length > 0) {
          await Notification.insertMany(docs);
        }
      }
    } catch (e) {
      console.warn('[POST] /api/live-streams - Live notifications skipped:', e.message);
    }

    console.log('[POST] /api/live-streams - Stream started:', result.insertedId);
    res.status(201).json({ success: true, id: result.insertedId, data: { ...newStream, id: String(result.insertedId) } });
  } catch (err) {
    next(err);
  }
});

// POST /api/live-streams/:streamId/join - User joins stream
app.post('/api/live-streams/:streamId/join', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { streamId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const LiveStream = mongoose.model('LiveStream');

    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    const viewers = Array.isArray(stream.viewers) ? stream.viewers : [];
    const updatedViewers = viewers.includes(userId) ? viewers : [...viewers, userId];

    const result = await LiveStream.findOneAndUpdate(
      { _id: toObjectId(streamId) },
      {
        $set: {
          viewers: updatedViewers,
          viewerCount: updatedViewers.length,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    console.log('[POST] /api/live-streams/:streamId/join - User', userId, 'joined stream');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/live-streams/:streamId/end - End live stream
app.patch('/api/live-streams/:streamId/end', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { streamId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const LiveStream = mongoose.model('LiveStream');

    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    if (stream.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Only stream owner can end the stream' });
    }

    const result = await LiveStream.findOneAndUpdate(
      { _id: streamId },
      { $set: { isActive: false, endedAt: new Date() } },
      { new: true }
    );

    console.log('[PATCH] /api/live-streams/:streamId/end - Stream ended:', streamId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
console.log('  /api/live-streams/:streamId/end (PATCH) loaded');

// POST /api/live-streams/:streamId/agora-token - Generate Agora token
app.post('/api/live-streams/:streamId/agora-token', async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    const { streamId } = req.params;

    if (!userId || !role) {
      return res.status(400).json({ success: false, error: 'userId and role required' });
    }

    const LiveStream = mongoose.model('LiveStream');

    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    // Generate Agora token (using RTC token v2 approach)
    // In production, use agora-token-builder package for proper token generation
    const agoraAppId = process.env.AGORA_APP_ID || 'demo-app-id';
    const agoraAppCertificate = process.env.AGORA_APP_CERTIFICATE || 'demo-app-certificate';

    // Simple token format (for demo - use proper agora-token-builder in production)
    const token = Buffer.from(
      JSON.stringify({
        appId: agoraAppId,
        channelName: streamId,
        userId: userId,
        role: role,
        expirationSeconds: 3600,
        timestamp: Math.floor(Date.now() / 1000)
      })
    ).toString('base64');

    // Add viewer to stream if subscriber
    if (role === 'subscriber') {
      const viewers = stream.viewers || [];
      if (!viewers.includes(userId)) {
        viewers.push(userId);
        await LiveStream.updateOne(
          { _id: toObjectId(streamId) },
          {
            $set: {
              viewers,
              viewerCount: viewers.length
            }
          }
        );
      }
    }

    console.log('[POST] /api/live-streams/:streamId/agora-token - Token generated for', userId, 'role:', role);
    res.json({
      success: true,
      token,
      agoraAppId,
      channelName: streamId,
      userId,
      role,
      expirationSeconds: 3600
    });
  } catch (err) {
    console.error('[POST] /api/live-streams/:streamId/agora-token error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/live-streams/:streamId/agora-token (POST) loaded');

// POST /api/live-streams/:streamId/leave - User leaves stream
app.post('/api/live-streams/:streamId/leave', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { streamId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const LiveStream = mongoose.model('LiveStream');

    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    const viewers = stream.viewers || [];
    const updatedViewers = viewers.filter(v => v !== userId);

    const updated = await LiveStream.findOneAndUpdate(
      { _id: toObjectId(streamId) },
      {
        $set: {
          viewers: updatedViewers,
          viewerCount: updatedViewers.length
        }
      },
      { new: true }
    );

    console.log('[POST] /api/live-streams/:streamId/leave - User', userId, 'left stream');
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[POST] /api/live-streams/:streamId/leave error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/live-streams/:streamId/leave (POST) loaded');

// POST /api/live-streams/:streamId/comments - Add comment to live stream
app.post('/api/live-streams/:streamId/comments', async (req, res, next) => {
  try {
    const { userId, text, userName, userAvatar } = req.body;
    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }

    const LiveStreamComment = mongoose.model('LiveStreamComment');

    const newComment = {
      streamId: req.params.streamId,
      userId,
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {}
    };

    const result = await LiveStreamComment.create(newComment);

    console.log('[POST] /api/live-streams/:streamId/comments - Comment added:', result._id);
    return res.status(201).json({ success: true, id: result._id, data: newComment });
  } catch (err) {
    console.error('[POST] /api/live-streams/:streamId/comments error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/live-streams/:streamId/comments (POST) loaded');

// GET /api/live-streams/:streamId/comments - Get all comments on live stream
app.get('/api/live-streams/:streamId/comments', async (req, res, next) => {
  try {
    const LiveStreamComment = mongoose.model('LiveStreamComment');

    const comments = await LiveStreamComment
      .find({ streamId: req.params.streamId })
      .sort({ createdAt: -1 })
      .lean();

    console.log('[GET] /api/live-streams/:streamId/comments - Found:', comments.length);
    res.json({ success: true, data: comments });
  } catch (err) {
    console.error('[GET] /api/live-streams/:streamId/comments error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/live-streams/:streamId/comments (GET) loaded');

// PATCH /api/live-streams/:streamId/comments/:commentId - Edit comment
app.patch('/api/live-streams/:streamId/comments/:commentId', async (req, res, next) => {
  try {
    const { userId, text } = req.body;
    const { streamId, commentId } = req.params;

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }

    const LiveStreamComment = mongoose.model('LiveStreamComment');

    const comment = await LiveStreamComment.findOne({
      _id: toObjectId(commentId),
      streamId: streamId
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized - can only edit own comments' });
    }

    const updated = await LiveStreamComment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { text, editedAt: new Date() } },
      { new: true }
    );

    console.log('[PATCH] /api/live-streams/:streamId/comments/:commentId - Updated:', commentId);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/live-streams/:streamId/comments/:commentId (PATCH) loaded');

// DELETE /api/live-streams/:streamId/comments/:commentId - Delete comment
app.delete('/api/live-streams/:streamId/comments/:commentId', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { streamId, commentId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const LiveStreamComment = mongoose.model('LiveStreamComment');

    const comment = await LiveStreamComment.findOne({
      _id: toObjectId(commentId),
      streamId: streamId
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized - can only delete own comments' });
    }

    await LiveStreamComment.deleteOne({ _id: toObjectId(commentId) });

    console.log('[DELETE] /api/live-streams/:streamId/comments/:commentId - Deleted:', commentId);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/live-streams/:streamId/comments/:commentId (DELETE) loaded');

// POST /api/live-streams/:streamId/comments/:commentId/like - Like comment
app.post('/api/live-streams/:streamId/comments/:commentId/like', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { streamId, commentId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const LiveStreamComment = mongoose.model('LiveStreamComment');

    const comment = await LiveStreamComment.findOne({
      _id: toObjectId(commentId)
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const likes = comment.likes || [];
    if (likes.includes(userId)) {
      return res.status(400).json({ success: false, error: 'Already liked' });
    }

    likes.push(userId);
    const updated = await LiveStreamComment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { likes, likesCount: likes.length } },
      { new: true }
    );

    console.log('[POST] /api/live-streams/:streamId/comments/:commentId/like - User', userId, 'liked');
    res.json({ success: true, data: { likes: updated.likes, likesCount: updated.likesCount } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/live-streams/:streamId/comments/:commentId/like (POST) loaded');

// POST /api/live-streams/:streamId/comments/:commentId/reactions - React to comment
app.post('/api/live-streams/:streamId/comments/:commentId/reactions', async (req, res, next) => {
  try {
    const { userId, reaction } = req.body;
    const { streamId, commentId } = req.params;

    if (!userId || !reaction) {
      return res.status(400).json({ success: false, error: 'userId and reaction required' });
    }

    const LiveStreamComment = mongoose.model('LiveStreamComment');

    const comment = await LiveStreamComment.findOne({
      _id: toObjectId(commentId)
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const reactions = comment.reactions || {};
    reactions[reaction] = reactions[reaction] || [];

    if (!reactions[reaction].includes(userId)) {
      reactions[reaction].push(userId);
    }

    const updated = await LiveStreamComment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { reactions } },
      { new: true }
    );

    console.log('[POST] /api/live-streams/:streamId/comments/:commentId/reactions - User', userId, 'reacted:', reaction);
    res.json({ success: true, data: { reactions: updated.reactions } });
  } catch (err) {
    console.error('[POST] /api/live-streams/:streamId/comments/:commentId/reactions error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/live-streams/:streamId/comments/:commentId/reactions (POST) loaded');

console.log('✅ Critical inline routes registered: /api/posts, /api/categories, /api/live-streams');

app.get('/', (req, res) => res.json({ status: 'ok', message: 'Trave Social Backend' }));
app.get('/api/status', (req, res) => res.json({ success: true, status: 'online' }));

// Media upload endpoint - supports both JSON base64 and multipart/form-data
app.post('/api/media/upload', upload.single('file'), async (req, res, next) => {
  try {
    const { file: fileBase64, fileName, image, path, mediaType } = req.body;

    // Support both { file, fileName } and { image, path } formats
    let mediaFile = fileBase64 || image;
    const mediaName = fileName || path || 'media';

    console.log('[POST] /api/media/upload - Received request');
    console.log('[POST] /api/media/upload - Content-Type:', req.headers['content-type']);
    console.log('[POST] /api/media/upload - mediaFile (base64) length:', mediaFile?.length || 0);
    console.log('[POST] /api/media/upload - mediaName:', mediaName);
    console.log('[POST] /api/media/upload - req.file exists:', !!req.file);

    const hasMultipartFile = !!req.file;

    if (!mediaFile && !hasMultipartFile) {
      console.error('[POST] /api/media/upload - No file/image provided');
      return res.status(400).json({ success: false, error: 'No file/image provided' });
    }

    let result;

    if (hasMultipartFile) {
      console.log('[POST] /api/media/upload - Using multipart file buffer, size:', req.file.size, 'bytes');
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'trave-social/uploads',
            resource_type: 'auto',
            quality: 'auto',
            fetch_format: 'auto'
          },
          (error, uploadResult) => {
            if (error) return reject(error);
            resolve(uploadResult);
          }
        );
        stream.end(req.file.buffer);
      });
    } else {
      // Ensure data URI format for Cloudinary (JSON base64 path)
      if (!mediaFile.startsWith('data:')) {
        const guessedPrefix = mediaType === 'video'
          ? 'data:video/mp4;base64,'
          : mediaType === 'audio'
            ? 'data:audio/mp4;base64,'
            : 'data:image/jpeg;base64,';
        mediaFile = `${guessedPrefix}${mediaFile}`;
        console.log('[POST] /api/media/upload - Added data URI prefix');
      }

      console.log('[POST] /api/media/upload - Attempting Cloudinary upload (base64)...');
      result = await cloudinary.uploader.upload(mediaFile, {
        folder: 'trave-social/uploads',
        resource_type: 'auto',
        quality: 'auto',
        fetch_format: 'auto'
      });
    }

    console.log('[POST] /api/media/upload - ✅ Cloudinary upload successful:', result.secure_url);
    return res.json({
      success: true,
      data: {
        url: result.secure_url,
        fileName: mediaName,
        secureUrl: result.secure_url
      },
      url: result.secure_url
    });
  } catch (err) {
    console.error('[POST] /api/media/upload - ❌ Error:', err.message);
    console.error('[POST] /api/media/upload - Stack:', err.stack);
    return res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
});
console.log('  ✅ /api/media/upload loaded (with Cloudinary)');

// ============= INLINE ROUTES FOR MISSING ENDPOINTS =============

const optionalVerifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return verifyToken(req, res, next);
  }
  return next();
};

// GET /api/conversations-legacy - Get conversations for current user
app.get('/api/conversations-legacy', verifyToken, async (req, res, next) => {
  try {
    const userIdFromToken = req.userId;
    const userId = userIdFromToken;

    console.log('[GET] /api/conversations - Query userId:', userId);

    // Return empty if no userId
    if (!userId) {
      console.warn('[GET] /api/conversations - No userId provided');
      return res.status(401).json({ success: false, error: 'Unauthorized', data: [] });
    }

    const db = mongoose.connection.db;

    // Resolve both Mongo _id and firebase uid for backward compatibility
    const User = mongoose.model('User');
    let mongoId = null;
    let firebaseUid = null;
    try {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const byId = await User.findById(userId).select('firebaseUid uid');
        if (byId) {
          mongoId = String(byId._id);
          firebaseUid = byId.firebaseUid || byId.uid || null;
        }
      }

      if (!mongoId) {
        const byAlt = await User.findOne({ $or: [{ firebaseUid: userId }, { uid: userId }] }).select('firebaseUid uid');
        if (byAlt) {
          mongoId = String(byAlt._id);
          firebaseUid = byAlt.firebaseUid || byAlt.uid || null;
        }
      }
    } catch (e) {
      console.warn('[GET] /api/conversations - Failed resolving user identifiers:', e.message);
    }

    const idsToMatch = [String(userId)];
    if (mongoId && !idsToMatch.includes(mongoId)) idsToMatch.push(mongoId);
    if (firebaseUid && !idsToMatch.includes(firebaseUid)) idsToMatch.push(String(firebaseUid));

    // Build query for conversations
    const query = {
      $or: [
        { userId1: { $in: idsToMatch } },
        { userId2: { $in: idsToMatch } },
        { participants: { $in: idsToMatch } }
      ]
    };

    console.log('[GET] /api/conversations - Query:', JSON.stringify(query));

    // Query with index optimization
    const Conversation = mongoose.model('Conversation');
    const conversations = await Conversation
      .find(query)
      .maxTimeMS(5000)
      .sort({ updatedAt: -1 })
      .limit(50);

    // Normalize participant IDs to Mongo _id when possible (prevents mixed-id DMs)
    try {
      const participantSet = new Set();
      for (const c of conversations) {
        for (const p of (c?.participants || [])) participantSet.add(String(p));
      }
      const participantIds = Array.from(participantSet);
      const objectIds = participantIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

      const User = mongoose.model('User');
      const users = await User.find({
        $or: [
          { firebaseUid: { $in: participantIds } },
          { uid: { $in: participantIds } },
          objectIds.length ? { _id: { $in: objectIds } } : null
        ].filter(Boolean)
      }).select({ _id: 1, firebaseUid: 1, uid: 1 }).lean();

      const mapToMongo = new Map();
      for (const u of users) {
        const idStr = String(u._id);
        mapToMongo.set(idStr, idStr);
        if (u.firebaseUid) mapToMongo.set(String(u.firebaseUid), idStr);
        if (u.uid) mapToMongo.set(String(u.uid), idStr);
      }

      for (const c of conversations) {
        if (Array.isArray(c.participants)) {
          c.participants = c.participants.map(p => mapToMongo.get(String(p)) || String(p));
        }
      }
    } catch (e) {
      console.warn('[GET] /api/conversations - Participant normalization skipped:', e.message);
    }

    const countUnreadForUser = (c) => {
      const msgs = Array.isArray(c?.messages) ? c.messages : [];
      let count = 0;
      for (const m of msgs) {
        const recipientId = m?.recipientId != null ? String(m.recipientId) : '';
        const isForMe = recipientId && idsToMatch.some(id => String(id) === recipientId);
        if (isForMe && m?.read === false) count += 1;
      }
      return count;
    };

    // Dedupe by participant pair so the same user only appears once in inbox
    const dedupedByPair = new Map();
    const getSortTime = (c) => {
      const t = c?.updatedAt || c?.lastMessageAt || c?.lastMessageTime || c?.createdAt;
      const d = t?.toDate ? t.toDate() : (t ? new Date(t) : null);
      return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
    };

    for (const conv of conversations) {
      const participants = Array.isArray(conv?.participants)
        ? conv.participants.map(p => String(p)).sort()
        : [];
      const key = participants.length > 0 ? participants.join('|') : String(conv?._id || Math.random());

      const unreadForThisDoc = countUnreadForUser(conv);

      if (participants.length === 2) {
        conv.conversationId = `${participants[0]}_${participants[1]}`;
        conv.participants = participants;
      }

      const existing = dedupedByPair.get(key);
      if (!existing) {
        conv.unreadCount = unreadForThisDoc;
        dedupedByPair.set(key, conv);
      } else {
        const aggregatedUnread = (existing?.unreadCount || 0) + unreadForThisDoc;
        const existingTime = getSortTime(existing);
        const currentTime = getSortTime(conv);
        if (currentTime >= existingTime) {
          conv.unreadCount = aggregatedUnread;
          dedupedByPair.set(key, conv);
        } else {
          existing.unreadCount = aggregatedUnread;
        }
      }
    }

    const dedupedConversations = Array.from(dedupedByPair.values());
    dedupedConversations.sort((a, b) => getSortTime(b) - getSortTime(a));

    console.log('[GET] /api/conversations - Found', dedupedConversations.length, 'conversations (deduped)');
    dedupedConversations.forEach((c, i) => {
      console.log(`  [${i}] participants:`, c.participants, '| lastMessage:', c.lastMessage?.substring(0, 30));
    });

    // Add currentUserId to each conversation for frontend compatibility
    const conversationsWithUserId = dedupedConversations.map(conv => ({
      ...conv,
      currentUserId: userId
    }));

    res.json({ success: true, data: conversationsWithUserId || [] });
  } catch (err) {
    console.error('[GET] /api/conversations - Error:', err.message);
    res.json({ success: true, data: [] });
  }
});
console.log('  ✅ /api/conversations-legacy loaded');

// DEBUG ENDPOINT: GET /api/debug/conversations-count - Check conversation count
app.get('/api/debug/conversations-count', async (req, res, next) => {
  try {
    const Conversation = mongoose.model('Conversation');
    const count = await Conversation.countDocuments({});
    const sample = await Conversation.find({}).limit(3).lean();

    res.json({
      success: true,
      'conversations total': count,
      'sample documents': sample
    });
  } catch (err) {
    next(err);
  }
});

// DEBUG ENDPOINT: GET /api/debug/messages-count - Check message count
app.get('/api/debug/messages-count', async (req, res, next) => {
  try {
    const Message = mongoose.model('Message');
    const count = await Message.countDocuments({});
    const sample = await Message.find({}).sort({ createdAt: -1 }).limit(3).lean();

    res.json({
      success: true,
      'total messages': count,
      'recent messages': sample.map(m => ({ ...m, text: m.text?.substring(0, 30) }))
    });
  } catch (err) {
    next(err);
  }
});

// DEBUG ENDPOINT: POST /api/test/create-conversation - Create test conversation
app.post('/api/test/create-conversation', async (req, res, next) => {
  try {
    const { userId1, userId2, lastMessage } = req.body;

    if (!userId1 || !userId2) {
      return res.status(400).json({ success: false, error: 'userId1 and userId2 required' });
    }

    const Conversation = mongoose.model('Conversation');
    const convo = {
      userId1,
      userId2,
      participants: [userId1, userId2],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: lastMessage || 'Hello!',
      lastMessageTime: new Date()
    };

    const result = await Conversation.create(convo);
    console.log('✅ TEST: Created conversation:', result._id);

    res.json({ success: true, data: { _id: result._id, ...convo } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/test/create-conversation loaded');

// GET /api/messages - Get messages (placeholder)
app.get('/api/messages', async (req, res, next) => {
  try {
    const Message = mongoose.model('Message');
    const messages = await Message.find({}).limit(50);
    res.json({ success: true, data: messages || [] });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});
console.log('  ✅ /api/messages loaded');

// POST /api/conversations/:conversationId/messages - Send message
// DISABLED: This inline handler was intercepting before the conversations router
// The conversations router (routes/conversations.js) has the proper implementation
// that saves messages to the Conversation.messages array
/*
app.post('/api/conversations/:conversationId/messages', async (req, res, next) => {
  try {
    const { senderId, text, recipientId } = req.body;
    console.log('[POST] /api/conversations - Received:', { senderId, text: text.substring(0, 50), recipientId });
    
    if (!senderId || !text) {
      return res.status(400).json({ success: false, error: 'senderId and text required' });
    }
    
    const db = mongoose.connection.db;
    const messagesCollection = db.collection('messages');
    const conversationsCollection = db.collection('conversations');
    
    let participants = [];
    if (req.params.conversationId.includes('_')) {
      participants = req.params.conversationId.split('_');
    } else if (recipientId && senderId) {
      participants = [senderId, recipientId];
    }
    
    console.log('[POST] Extracted participants:', participants);
    
    if (participants.length === 2) {
      participants = [participants[0], participants[1]].sort();
    }
    
    console.log('[POST] Sorted participants:', participants);
    
    const newMessage = {
      conversationId: req.params.conversationId,
      senderId,
      text,
      createdAt: new Date(),
      reactions: {},
      replies: []
    };
    
    const result = await messagesCollection.insertOne(newMessage);
    console.log('[POST] Message inserted:', result.insertedId);
    
    if (participants.length === 2) {
      console.log('[POST] Upserting conversation for:', participants);
      
      try {
        const existing = await conversationsCollection.findOne({
          participants: { $all: participants }
        });
        
        if (existing) {
          await conversationsCollection.updateOne(
            { _id: existing._id },
            {
              $set: {
                lastMessage: text,
                lastMessageAt: new Date(),
                updatedAt: new Date()
              }
            }
          );
          console.log('[POST] Updated existing conversation:', existing._id);
        } else {
          const insertResult = await conversationsCollection.insertOne({
            participants: participants,
            lastMessage: text,
            lastMessageAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log('[POST] Created new conversation:', insertResult.insertedId);
        }
      } catch (convErr) {
        console.error('[POST] Conversation creation error:', convErr.message);
      }
    } else {
      console.warn('[POST] Could not extract participants, skipping conversation creation');
    }
    
    return res.status(201).json({ success: true, id: result.insertedId, data: newMessage });
  } catch (err) {
    console.error('[POST] /api/conversations/:conversationId/messages error:', err.message);
    console.error('[POST] Error stack:', err.stack);
    return res.status(500).json({ success: false, error: err.message });
  }
});
*/
console.log('  ⏭️ /api/conversations/:conversationId/messages (POST) - Using router instead');

// DISABLED: Using the conversations router GET handler instead
/*
// GET /api/conversations/:conversationId/messages - Get messages in conversation
app.get('/api/conversations/:conversationId/messages', async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const messagesCollection = db.collection('messages');
    
    const messages = await messagesCollection
      .find({ conversationId: req.params.conversationId })
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log('[GET] /api/conversations/:conversationId/messages - Found:', messages.length);
    res.json({ success: true, data: messages });
  } catch (err) {
    console.error('[GET] /api/conversations/:conversationId/messages error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
*/
console.log('  ⏭️ /api/conversations/:conversationId/messages (GET) - Using router instead');

// GET /api/conversations/:conversationId/messages/:messageId - Get single message
app.get('/api/conversations/:conversationId/messages/:messageId', async (req, res, next) => {
  try {
    const Message = mongoose.model('Message');

    const message = await Message.findOne({
      _id: toObjectId(req.params.messageId)
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, data: message });
  } catch (err) {
    console.error('[GET] /api/conversations/:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/conversations/:conversationId/messages/:messageId (GET) loaded');

// PATCH /api/conversations/:conversationId/messages/:messageId - Edit message
app.patch('/api/conversations/:conversationId/messages/:messageId', async (req, res, next) => {
  try {
    const { userId, text } = req.body;
    const { conversationId, messageId } = req.params;

    console.log('[PATCH] /api/conversations/:conversationId/messages/:messageId - Request:', {
      conversationId,
      messageId,
      userId,
      text: text?.substring(0, 30)
    });

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }

    const Conversation = mongoose.model('Conversation');

    // Find conversation by conversationId string (not _id)
    const conversation = await Conversation.findOne({
      conversationId: conversationId
    });

    if (!conversation) {
      console.log('[PATCH] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in conversation.messages array
    const message = conversation.messages?.find(m => m.id === messageId);
    if (!message) {
      console.log('[PATCH] Message not found in conversation:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check authorization
    if (message.senderId !== userId) {
      console.log('[PATCH] Unauthorized - senderId:', message.senderId, 'userId:', userId);
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only edit your own messages' });
    }

    // Update message in array
    const updated = await Conversation.findOneAndUpdate(
      { conversationId: conversationId, 'messages.id': messageId },
      {
        $set: {
          'messages.$.text': text,
          'messages.$.editedAt': new Date()
        }
      },
      { new: true }
    );

    console.log('[PATCH] /api/conversations/:conversationId/messages/:messageId - Updated:', messageId);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PATCH] /api/conversations/:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/conversations/:conversationId/messages/:messageId (PATCH) loaded');

// DELETE /api/conversations/:conversationId/messages/:messageId - Delete message
app.delete('/api/conversations/:conversationId/messages/:messageId', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { conversationId, messageId } = req.params;

    console.log('[DELETE] /api/conversations/:conversationId/messages/:messageId - Request:', {
      conversationId,
      messageId,
      userId
    });

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const Conversation = mongoose.model('Conversation');

    // Find conversation by conversationId string (not _id)
    const conversation = await Conversation.findOne({
      conversationId: conversationId
    });

    if (!conversation) {
      console.log('[DELETE] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in conversation.messages array
    const message = conversation.messages?.find(m => m.id === messageId);
    if (!message) {
      console.log('[DELETE] Message not found in conversation:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check authorization
    if (message.senderId !== userId) {
      console.log('[DELETE] Unauthorized - senderId:', message.senderId, 'userId:', userId);
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only delete your own messages' });
    }

    // Remove message from array
    await Conversation.updateOne(
      { conversationId: conversationId },
      { $pull: { messages: { id: messageId } } }
    );

    console.log('[DELETE] /api/conversations/:conversationId/messages/:messageId - Deleted:', messageId);
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    console.error('[DELETE] /api/conversations/:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/conversations/:conversationId/messages/:messageId (DELETE) loaded');

// POST /api/conversations/:conversationId/messages/:messageId/reactions - React to message
app.post('/api/conversations/:conversationId/messages/:messageId/reactions', async (req, res, next) => {
  try {
    const { userId, reaction, emoji } = req.body;
    const { conversationId, messageId } = req.params;

    // Accept both 'reaction' and 'emoji' for compatibility
    const actualReaction = reaction || emoji;

    console.log('[POST] /api/conversations/:conversationId/messages/:messageId/reactions - Request:', {
      conversationId,
      messageId,
      userId,
      reaction: actualReaction
    });

    if (!userId || !actualReaction) {
      return res.status(400).json({ success: false, error: 'userId and reaction/emoji required' });
    }

    const Conversation = mongoose.model('Conversation');

    // Find conversation by conversationId string (not _id)
    const conversation = await Conversation.findOne({
      conversationId: conversationId
    });

    if (!conversation) {
      console.log('[POST] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in conversation.messages array
    const messageIndex = conversation.messages?.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === undefined) {
      console.log('[POST] Message not found in conversation:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const message = conversation.messages[messageIndex];
    const reactions = message.reactions || {};

    // Initialize reaction array if not exists
    if (!reactions[actualReaction]) {
      reactions[actualReaction] = [];
    }

    // Toggle reaction (Instagram style - add if not present, remove if present)
    const userIndex = reactions[actualReaction].indexOf(userId);
    if (userIndex === -1) {
      reactions[actualReaction].push(userId);
      console.log('[POST] Added reaction:', actualReaction, 'from user:', userId);
    } else {
      reactions[actualReaction].splice(userIndex, 1);
      console.log('[POST] Removed reaction:', actualReaction, 'from user:', userId);

      // Remove empty reaction arrays
      if (reactions[actualReaction].length === 0) {
        delete reactions[actualReaction];
      }
    }

    // Update message reactions in array
    const updated = await Conversation.findOneAndUpdate(
      { conversationId: conversationId, 'messages.id': messageId },
      { $set: { 'messages.$.reactions': reactions } },
      { new: true }
    );

    console.log('[POST] /api/conversations/:conversationId/messages/:messageId/reactions - Updated reactions');
    res.json({ success: true, data: { reactions } });
  } catch (err) {
    console.error('[POST] /api/conversations/:conversationId/messages/:messageId/reactions error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/conversations/:conversationId/messages/:messageId/reactions (POST) loaded');

// POST /api/conversations/:conversationId/messages/:messageId/replies - Reply to message
app.post('/api/conversations/:conversationId/messages/:messageId/replies', async (req, res, next) => {
  try {
    const { senderId, text } = req.body;
    const { messageId } = req.params;

    if (!senderId || !text) {
      return res.status(400).json({ success: false, error: 'senderId and text required' });
    }

    const Message = mongoose.model('Message');

    const parentMessage = await Message.findOne({ _id: toObjectId(messageId) });
    if (!parentMessage) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const reply = {
      _id: new mongoose.Types.ObjectId(),
      senderId,
      text,
      createdAt: new Date(),
      reactions: {}
    };

    const replies = parentMessage.replies || [];
    replies.push(reply);

    const updated = await Message.findOneAndUpdate(
      { _id: toObjectId(messageId) },
      { $set: { replies } },
      { new: true }
    );

    console.log('[POST] /api/conversations/:conversationId/messages/:messageId/replies - Added reply:', reply._id);
    res.status(201).json({ success: true, id: reply._id, data: reply });
  } catch (err) {
    console.error('[POST] /api/conversations/:conversationId/messages/:messageId/replies error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/conversations/:conversationId/messages/:messageId/replies (POST) loaded');

// GET /api/stories - DISABLED: Router-based stories routes handle this now
// app.get('/api/stories', async (req, res, next) => {
//   try {
//     const db = mongoose.connection.db;
//     const stories = await db.collection('stories').find({ expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
//     res.json({ success: true, data: stories || [] });
//   } catch (err) {
//     res.json({ success: true, data: [] });
//   }
// });
console.log('  ⚠️ /api/stories (inline) DISABLED - using router instead');

// DELETE /api/stories/:storyId - DISABLED: Router-based stories routes handle this now
// app.delete('/api/stories/:storyId', async (req, res, next) => {
//   try {
//     const { storyId } = req.params;
//     const { userId } = req.body;
//
//     console.log(`🗑️ DELETE /api/stories/${storyId} called with userId:`, userId);
//
//     if (!storyId) {
//       return res.status(400).json({ success: false, error: 'storyId required' });
//     }
//
//     const db = mongoose.connection.db;
//     const ObjectId = require('mongodb').ObjectId;
//
//     // Find the story
//     let storyId_obj;
//     try {
//       storyId_obj = new ObjectId(storyId);
//     } catch (e) {
//       return res.status(400).json({ success: false, error: 'Invalid storyId format' });
//     }
//
//     const story = await db.collection('stories').findOne({ _id: storyId_obj });
//     if (!story) {
//       return res.status(404).json({ success: false, error: 'Story not found' });
//     }
//
//     // Verify ownership (if userId provided)
//     if (userId && story.userId !== userId) {
//       return res.status(403).json({ success: false, error: 'Not authorized to delete this story' });
//     }
//
//     // Delete the story
//     const result = await db.collection('stories').deleteOne({ _id: storyId_obj });
//
//     if (result.deletedCount > 0) {
//       res.json({ success: true, message: 'Story deleted successfully' });
//     } else {
//       res.status(500).json({ success: false, error: 'Failed to delete story' });
//     }
//   } catch (err) {
//     console.error('❌ DELETE /api/stories error:', err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });
console.log('  ⚠️ /api/stories/:storyId (DELETE inline) DISABLED - using router instead');

// GET /api/highlights - Get highlights (placeholder)
app.get('/api/highlights', async (req, res, next) => {
  try {
    const Highlight = mongoose.model('Highlight');
    const highlights = await Highlight.find({}).limit(20);
    res.json({ success: true, data: highlights || [] });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});
console.log('  ✅ /api/highlights loaded');

// GET /api/sections - Get sections (placeholder)
app.get('/api/sections', async (req, res, next) => {
  try {
    const Section = mongoose.model('Section');
    const sections = await Section.find({}).sort({ order: 1 });
    res.json({ success: true, data: sections || [] });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});
console.log('  ✅ /api/sections loaded');

// GET /api/users/search - Search users OR return recommendations (MUST be before /api/users/:uid)
app.get('/api/users/search', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));

    const User = mongoose.model('User');

    // If q is empty, return a small list of recent users for recommendations
    const qStr = typeof q === 'string' ? q.trim() : '';
    if (!qStr) {
      const users = await User
        .find({})
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .select({
          _id: 1,
          firebaseUid: 1,
          uid: 1,
          email: 1,
          displayName: 1,
          name: 1,
          username: 1,
          avatar: 1,
          photoURL: 1,
          bio: 1,
          isPrivate: 1,
          createdAt: 1
        });

      return res.json({ success: true, data: Array.isArray(users) ? users : [] });
    }

    const regex = new RegExp(qStr, 'i');
    const users = await User
      .find({
        $or: [
          { displayName: regex },
          { name: regex },
          { username: regex },
          { email: regex },
        ]
      })
      .limit(parsedLimit)
      .select({
        _id: 1,
        firebaseUid: 1,
        uid: 1,
        email: 1,
        displayName: 1,
        name: 1,
        username: 1,
        avatar: 1,
        photoURL: 1,
        bio: 1,
        isPrivate: 1,
        createdAt: 1
      });

    return res.json({ success: true, data: Array.isArray(users) ? users : [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /api/users/:uid - Get user profile
app.get('/api/users/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;
    console.log('[GET] /api/users/:uid - Looking for user:', uid);

    const User = mongoose.model('User');

    // Build query - check firebaseUid first, then uid field, then try ObjectId if valid
    const query = { $or: [{ firebaseUid: uid }, { uid }] };

    // Only add _id if it's a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    console.log('[GET] /api/users/:uid - Query:', JSON.stringify(query));

    const user = await User.findOne(query);

    if (!user) {
      console.warn('[GET] /api/users/:uid - User not found for:', uid, ' - returning placeholder');
      // Return placeholder instead of 404
      return res.json({
        success: true,
        data: {
          _id: uid,
          uid: uid,
          firebaseUid: uid,
          displayName: 'User_' + uid.slice(-6),
          email: '',
          avatar: null,
          bio: '',
          isPrivate: false,
          followersCount: 0,
          followingCount: 0,
          postsCount: 0
        }
      });
    }

    // Ensure user has all expected fields
    // Compute follow counts from Follow collection (source of truth)
    let followersCount = 0;
    let followingCount = 0;
    try {
      const Follow = mongoose.model('Follow');
      const possibleIds = [
        user?._id ? String(user._id) : null,
        user?.firebaseUid ? String(user.firebaseUid) : null,
        user?.uid ? String(user.uid) : null,
      ].filter(Boolean);

      followersCount = await Follow.countDocuments({ followingId: { $in: possibleIds } });
      followingCount = await Follow.countDocuments({ followerId: { $in: possibleIds } });
    } catch (e) {
      // If Follow model isn't available for some reason, fall back to stored fields
      followersCount = typeof user.followersCount === 'number' ? user.followersCount : 0;
      followingCount = typeof user.followingCount === 'number' ? user.followingCount : 0;
    }

    const userData = {
      _id: user._id,
      uid: user.uid,
      firebaseUid: user.firebaseUid,
      displayName: user.displayName || user.name,
      name: user.name || user.displayName,
      username: user.username,
      email: user.email,
      avatar: user.avatar || user.photoURL,
      photoURL: user.photoURL || user.avatar,
      bio: user.bio,
      website: user.website,
      location: user.location,
      phone: user.phone,
      interests: user.interests,
      followersCount,
      followingCount,
      postsCount: user.postsCount || 0,
      followers: Array.isArray(user.followers) ? user.followers : [],
      following: Array.isArray(user.following) ? user.following : [],
      isPrivate: user.isPrivate || false,
      approvedFollowers: user.approvedFollowers || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    console.log('[GET] /api/users/:uid - Returning user data');
    return res.json({ success: true, data: userData });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:uid loaded');

// ============= INLINE USER-SCOPED ROUTES =============
// GET /api/users/:userId/posts - Get user's posts with privacy enforcement
app.get('/api/users/:userId/posts', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { requesterUserId } = req.query;

    const User = mongoose.model('User');
    const Follow = mongoose.model('Follow');
    const Post = mongoose.model('Post');

    // Get user to check privacy
    const target = await resolveUserIdentifiers(userId);
    const targetUser = await User.findById(target.canonicalId);

    // Check if user is private
    if (targetUser?.isPrivate) {
      if (!requesterUserId || requesterUserId === 'guest') {
        console.log('[GET] /api/users/:userId/posts - User is private, access denied');
        return res.json({ success: true, data: [], message: 'User profile is private' });
      }

      const requester = await resolveUserIdentifiers(requesterUserId);
      if (requester.canonicalId !== target.canonicalId) {
        const isFollower = await Follow.findOne({
          followerId: { $in: requester.candidates },
          followingId: { $in: target.candidates }
        });

        if (!isFollower) {
          console.log('[GET] /api/users/:userId/posts - User is private, requester not follower');
          return res.json({ success: true, data: [], message: 'User profile is private' });
        }
      }
    }

    const posts = await Post
      .find({ userId: { $in: target.candidates } })
      .sort({ createdAt: -1 });

    console.log('[GET] /api/users/:userId/posts - Returned', posts?.length || 0, 'posts');
    res.json({ success: true, data: posts || [] });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/posts loaded with privacy enforcement');

// GET /api/users/:userId/sections
app.get('/api/users/:userId/sections', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requesterUserId = req.query.requesterUserId || req.query.viewerId || req.query.requesterId;
    const requesterUserIdStr = requesterUserId ? String(requesterUserId) : '';

    console.log('[GET] /api/users/:userId/sections - userId:', userId, 'requesterUserId:', requesterUserId);

    const Section = mongoose.model('Section');
    const user = await resolveUserIdentifiers(userId);
    const requester = requesterUserIdStr ? await resolveUserIdentifiers(requesterUserIdStr) : null;
    
    // Use exhaustive candidates for userId (both String and ObjectId)
    const userIdCandidates = [...user.candidates];
    const canonicalObjectId = toObjectId(user.canonicalId);
    if (canonicalObjectId && !userIdCandidates.includes(canonicalObjectId)) {
      userIdCandidates.push(canonicalObjectId);
    }

    const userIdStringCandidates = [...new Set(userIdCandidates.map((v) => String(v)))];
    const userIdObjectCandidates = userIdStringCandidates
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const requesterCandidates = requester
      ? [...new Set(requester.candidates.map((v) => String(v)))]
      : [];

    const sections = await Section
      .find({
        $or: [
          { userId: { $in: userIdCandidates } },
          { userId: { $in: userIdStringCandidates } },
          { userId: { $in: userIdObjectCandidates } },
          { collaborators: { $in: userIdCandidates } },
          { collaborators: { $in: userIdStringCandidates } },
          { collaborators: { $in: userIdObjectCandidates } },
          { 'collaborators.userId': { $in: userIdStringCandidates } },
          { 'collaborators.userId': { $in: userIdObjectCandidates } }
        ]
      })
      .sort({ order: 1 });

    // FILTERING LOGIC
    const filteredSections = sections.filter(section => {
      const sectionOwnerId = String(section.userId || '');
      const collaboratorIds = Array.isArray(section.collaborators)
        ? section.collaborators
            .map((entry) => {
              if (entry && typeof entry === 'object') {
                return String(entry.userId || entry._id || entry.id || entry.uid || entry.firebaseUid || '');
              }
              return String(entry || '');
            })
            .filter(Boolean)
        : [];
      const allowedUserIds = Array.isArray(section.allowedUsers)
        ? section.allowedUsers.map((id) => String(id)).filter(Boolean)
        : [];

      // 1. Owners see everything
      const isOwner = requesterCandidates.length > 0 && requesterCandidates.includes(sectionOwnerId);
      if (isOwner) return true;

      // 2. Public is visible to all
      if (section.visibility === 'public') return true;

      // 3. Collaborators see private/specific
      if (requesterCandidates.length > 0 && collaboratorIds.some((id) => requesterCandidates.includes(String(id)))) {
        return true;
      }

      // 4. Specific visibility: explicitly allowed users
      if (section.visibility === 'specific' && requesterCandidates.length > 0 && allowedUserIds.some((id) => requesterCandidates.includes(String(id)))) {
        return true;
      }

      return false;
    });

    console.log('[GET] /api/users/:userId/sections - Found', sections.length, 'total, returning', filteredSections.length, 'filtered for user:', userId);
    res.json({ success: true, data: filteredSections || [] });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/sections loaded');

// GET /api/users/:userId/highlights
app.get('/api/users/:userId/highlights', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requesterUserId = req.query.requesterUserId || req.query.viewerId;

    const Highlight = mongoose.model('Highlight');
    const user = await resolveUserIdentifiers(userId);
    
    // Exhaustive candidates for userId
    const userIdCandidates = [...user.candidates];
    const canonicalObjectId = toObjectId(user.canonicalId);
    if (canonicalObjectId && !userIdCandidates.includes(canonicalObjectId)) {
      userIdCandidates.push(canonicalObjectId);
    }

    const highlights = await Highlight
      .find({ userId: { $in: userIdCandidates } })
      .sort({ createdAt: -1 });

    // FILTERING LOGIC
    const filteredHighlights = highlights.filter(h => {
      // Owner always sees
      const isOwner = requesterUserId && userIdCandidates.map(c => String(c)).includes(String(requesterUserId));
      if (isOwner) return true;

      // Highlights currently don't have explicit visibility/collaborators in schema,
      // but if we add them, we'd check here. For now, public default.
      return true; 
    });

    res.json({ success: true, data: filteredHighlights || [] });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/highlights loaded');

// GET /api/users/:userId/stories
app.get('/api/users/:userId/stories', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requesterUserId = req.query.requesterUserId || req.query.viewerId;

    const Story = mongoose.model('Story');
    const user = await resolveUserIdentifiers(userId);

    // Exhaustive candidates for userId
    const userIdCandidates = [...user.candidates];
    const canonicalObjectId = toObjectId(user.canonicalId);
    if (canonicalObjectId && !userIdCandidates.includes(canonicalObjectId)) {
      userIdCandidates.push(canonicalObjectId);
    }

    const stories = await Story
      .find({ userId: { $in: userIdCandidates } })
      .sort({ createdAt: -1 });

    // FILTERING LOGIC
    const filteredStories = stories.filter(s => {
      // Owner always sees
      const isOwner = requesterUserId && userIdCandidates.map(c => String(c)).includes(String(requesterUserId));
      if (isOwner) return true;

      // Stories currently use account-level privacy mostly, but if we add story-level:
      return true;
    });

    res.json({ success: true, data: filteredStories || [] });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/stories loaded');

// POST /api/users/:userId/sections - Create section for user
app.post('/api/users/:userId/sections', async (req, res, next) => {
  try {
    const { userId: rawUserId } = req.params;
    const requesterUserId = req.body.requesterUserId || req.body.viewerId || req.query.requesterUserId || req.query.viewerId;
    const { name, postIds, coverImage, visibility, collaborators, allowedUsers, allowedGroups } = req.body;

    console.log('[POST] /api/users/:userId/sections - Creating section for userId:', rawUserId, 'name:', name);

    if (!name) {
      return res.status(400).json({ success: false, error: 'Section name required' });
    }

    const user = await resolveUserIdentifiers(rawUserId);
    const userId = user.canonicalId;
    const requesterUserIdStr = requesterUserId ? String(requesterUserId) : '';

    // Authorization: ONLY OWNER can create a section
    const isOwner = requesterUserIdStr && user.candidates.map(c => String(c)).includes(requesterUserIdStr);
    if (!isOwner) {
      console.log('[POST] Unauthorized attempt to create section for user:', rawUserId, 'by:', requesterUserId);
      return res.status(403).json({ success: false, error: 'Unauthorized. Only the owner can create sections.' });
    }

    const Section = mongoose.model('Section');

    // Get max order
    const userIdCandidates = [...user.candidates];
    const lastSection = await Section
      .findOne({ userId: { $in: userIdCandidates } }, { sort: { order: -1 } });
    const nextOrder = (lastSection?.order || 0) + 1;

    const normalizedPostIds = Array.isArray(postIds)
      ? [...new Set(postIds.map((id) => String(id)).filter(Boolean))]
      : [];
    const normalizedCollaborators = Array.isArray(collaborators)
      ? [...new Set(collaborators.map((id) => String(id)).filter(Boolean))]
      : [];
    const normalizedAllowedUsers = Array.isArray(allowedUsers)
      ? [...new Set(allowedUsers.map((id) => String(id)).filter(Boolean))]
      : [];
    const normalizedAllowedGroups = Array.isArray(allowedGroups)
      ? [...new Set(allowedGroups.map((id) => String(id)).filter(Boolean))]
      : [];
    const normalizedVisibility = ['public', 'private', 'specific'].includes(String(visibility))
      ? String(visibility)
      : 'private';

    const sectionData = {
      userId,
      name,
      postIds: normalizedPostIds,
      coverImage: coverImage || null,
      visibility: normalizedVisibility,
      collaborators: normalizedCollaborators,
      allowedUsers: normalizedAllowedUsers,
      allowedGroups: normalizedAllowedGroups,
      order: nextOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await Section.create(sectionData);
    
    console.log('[POST] /api/users/:userId/sections - Created section:', result._id, 'for user:', userId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[POST] /api/users/:userId/sections error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/users/:userId/sections (POST) loaded');

// PUT /api/users/:userId/sections/:sectionId - Update section
app.put('/api/users/:userId/sections/:sectionId', async (req, res, next) => {
  try {
    const { userId: rawUserId, sectionId } = req.params;
    const requesterUserId = req.body.requesterUserId || req.body.viewerId || req.query.requesterUserId || req.query.viewerId;
    const { name, postIds, coverImage, visibility, collaborators, allowedUsers, allowedGroups, addPostId, removePostId } = req.body;

    const user = await resolveUserIdentifiers(rawUserId);
    const userId = user.canonicalId;

    const Section = mongoose.model('Section');

    // EXHAUSTIVE LOOKUP: Try both ObjectId and String _id, and both String and ObjectId userId
    const candidatesForId = [sectionId];
    const objectId = toObjectId(sectionId);
    if (objectId) candidatesForId.push(objectId);

    // Also look for userId variants (canonical Mongo ID or raw)
    const userIdCandidates = [...user.candidates];
    // If canonicalId is hex but not in candidates as ObjectId, add it
    const canonicalObjectId = toObjectId(user.canonicalId);
    let foundInCandidates = false;
    for (const c of userIdCandidates) {
      if (String(c) === String(canonicalObjectId)) { foundInCandidates = true; break; }
    }
    if (canonicalObjectId && !foundInCandidates) {
      userIdCandidates.push(canonicalObjectId);
    }

    const existing = await Section.findOne({ 
      _id: { $in: candidatesForId }, 
      userId: { $in: userIdCandidates } 
    });

    if (!existing) {
      console.log('[PUT] Section not found - EXHAUSTIVE DEBUG:', { 
        sectionId, 
        candidatesForId, 
        userIdCandidates,
        rawUserId,
        matchedByOnlyId: await Section.findOne({ _id: { $in: candidatesForId } }).select('_id userId').lean()
      });
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    // AUTHORIZATION CHECK
    const isOwner = requesterUserId && userIdCandidates.map(c => String(c)).includes(String(requesterUserId));
    const collaboratorIds = Array.isArray(existing.collaborators)
      ? existing.collaborators
          .map((entry) => {
            if (entry && typeof entry === 'object') {
              return String(entry.userId || entry._id || entry.id || entry.uid || entry.firebaseUid || '');
            }
            return String(entry || '');
          })
          .filter(Boolean)
      : [];
    const isCollaborator = requesterUserId && collaboratorIds.includes(String(requesterUserId));

    if (!isOwner && !isCollaborator) {
      console.log('[PUT] Unauthorized update attempt for section:', sectionId, 'by user:', requesterUserId);
      return res.status(403).json({ success: false, error: 'Unauthorized. Only owner or collaborators can update.' });
    }

    const updateData = { updatedAt: new Date() };
    
    // Only owner can update metadata
    if (isOwner) {
      if (name !== undefined) updateData.name = name;
      if (coverImage !== undefined) updateData.coverImage = coverImage;
      if (visibility !== undefined) updateData.visibility = visibility;
      if (collaborators !== undefined) updateData.collaborators = collaborators;
      if (allowedUsers !== undefined) updateData.allowedUsers = Array.isArray(allowedUsers)
        ? [...new Set(allowedUsers.map((id) => String(id)).filter(Boolean))]
        : [];
      if (allowedGroups !== undefined) updateData.allowedGroups = Array.isArray(allowedGroups)
        ? [...new Set(allowedGroups.map((id) => String(id)).filter(Boolean))]
        : [];
    } else if (isCollaborator) {
      // Collaborators cannot change metadata
      if (name !== undefined || coverImage !== undefined || visibility !== undefined || collaborators !== undefined || allowedUsers !== undefined || allowedGroups !== undefined) {
        return res.status(403).json({ success: false, error: 'Collaborators can only manage posts, not metadata.' });
      }
    }

    // Handle postIds array directly or incrementally
    let currentPosts = Array.isArray(existing.postIds) ? existing.postIds : (existing.posts || []);
    if (postIds !== undefined) {
      currentPosts = postIds;
    }
    if (addPostId) {
      if (!currentPosts.includes(addPostId)) currentPosts.push(addPostId);
    }
    if (removePostId) {
      currentPosts = currentPosts.filter(id => id !== removePostId);
    }
    updateData.postIds = currentPosts;

    const result = await Section.findOneAndUpdate(
      { _id: existing._id },
      { $set: updateData },
      { new: true }
    );

    console.log('[PUT] /api/users/:userId/sections/:sectionId - Updated:', sectionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[PUT] /api/users/:userId/sections/:sectionId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/users/:userId/sections/:sectionId (PUT) loaded');

// DELETE /api/users/:userId/sections/:sectionId - Delete section
app.delete('/api/users/:userId/sections/:sectionId', async (req, res, next) => {
  try {
    const { userId: rawUserId, sectionId } = req.params;
    const requesterUserId = req.body?.requesterUserId || req.body?.viewerId || req.query.requesterUserId || req.query.viewerId;
    const { migrateToSectionId } = req.body || {};

    const user = await resolveUserIdentifiers(rawUserId);
    const userId = user.canonicalId;

    const Section = mongoose.model('Section');

    // EXHAUSTIVE LOOKUP: Try both ObjectId and String _id, and both String and ObjectId userId
    const candidatesForId = [sectionId];
    const objectId = toObjectId(sectionId);
    if (objectId) candidatesForId.push(objectId);

    const userIdCandidates = [...user.candidates];
    const canonicalObjectId = toObjectId(user.canonicalId);
    let foundInCandidates = false;
    for (const c of userIdCandidates) {
      if (String(c) === String(canonicalObjectId)) { foundInCandidates = true; break; }
    }
    if (canonicalObjectId && !foundInCandidates) {
      userIdCandidates.push(canonicalObjectId);
    }

    const sectionToDelete = await Section.findOne({ 
      _id: { $in: candidatesForId }, 
      userId: { $in: userIdCandidates } 
    });

    if (!sectionToDelete) {
      console.log('[DELETE] Section not found - EXHAUSTIVE DEBUG:', { 
        sectionId, 
        candidatesForId, 
        userIdCandidates,
        rawUserId,
        matchedByOnlyId: await Section.findOne({ _id: { $in: candidatesForId } }).select('_id userId').lean()
      });
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    // Authorization: ONLY OWNER can delete a section
    const isOwner = requesterUserId && userIdCandidates.map(c => String(c)).includes(String(requesterUserId));
    if (!isOwner) {
      console.log('[DELETE] Unauthorized attempt to delete section:', sectionId, 'by:', requesterUserId);
      return res.status(403).json({ success: false, error: 'Unauthorized. Only the owner can delete sections.' });
    }

    // Handle migration if requested
    if (migrateToSectionId) {
      const targetSection = await Section.findOne({ _id: toObjectId(migrateToSectionId), userId: { $in: user.candidates } });
      if (targetSection) {
        const postsToMove = sectionToDelete.postIds || [];
        const existingPosts = targetSection.postIds || [];
        const combined = [...new Set([...existingPosts, ...postsToMove])];
        await Section.updateOne({ _id: targetSection._id }, { $set: { postIds: combined, updatedAt: new Date() } });
        console.log('[DELETE] Migrated', postsToMove.length, 'posts to', migrateToSectionId);
      }
    }

    await Section.deleteOne({ _id: sectionToDelete._id });

    console.log('[DELETE] /api/users/:userId/sections/:sectionId - Deleted:', sectionId);
    res.status(200).json({ success: true, message: 'Section deleted' });
  } catch (err) {
    console.error('[DELETE] /api/users/:userId/sections/:sectionId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/users/:userId/sections/:sectionId (DELETE) loaded');

const sendEmail = require('./utils/email');
const bcrypt = require('bcryptjs');

// --- Forgot Password ---
app.post('/api/auth/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const User = mongoose.model('User');
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = resetCode;
    user.resetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send Email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Travel Social - Password Reset Code',
        message: `Your password reset code is: ${resetCode}. It will expire in 10 minutes.`,
        html: `<h3>Travel Social</h3><p>Your password reset code is: <b>${resetCode}</b></p><p>It will expire in 10 minutes.</p>`,
      });
      res.json({ success: true, message: 'Reset code sent to email' });
    } catch (err) {
      console.error('Email error:', err);
      res.status(500).json({ success: false, error: 'Error sending email. Please check server logs.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Verify Reset Code ---
app.post('/api/auth/verify-reset-code', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, error: 'Email and code are required' });

    const User = mongoose.model('User');
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      resetCode: code,
      resetCodeExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ success: false, error: 'Invalid or expired code' });
    res.json({ success: true, message: 'Code verified' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Reset Password ---
app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ success: false, error: 'Missing fields' });

    const User = mongoose.model('User');
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      resetCode: code,
      resetCodeExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ success: false, error: 'Invalid or expired code' });

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    // Clear reset code
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    // --- SYNC WITH FIREBASE (CRITICAL) ---
    if (user.firebaseUid) {
      try {
        await admin.auth().updateUser(user.firebaseUid, {
          password: newPassword,
        });
        console.log(`[Auth] Firebase password updated for: ${user.email}`);
      } catch (fbErr) {
        console.error('[Auth] Error updating Firebase password:', fbErr.message);
        // We don't fail the whole request since DB is updated, but log it
      }
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inline fallback auth routes to avoid 404 if router fails to load
app.post('/api/auth/login-firebase', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
      return res.status(503).json({ success: false, error: 'Database not connected (MONGO_URI missing or unreachable)' });
    }

    const { firebaseUid, email, displayName, avatar } = req.body || {};
    if (!firebaseUid || !email) {
      return res.status(400).json({ success: false, error: 'Firebase UID and email required' });
    }

    const User = mongoose.model('User');
    const normalizedEmail = String(email).toLowerCase().trim();
    let user = await User.findOne({ $or: [{ firebaseUid }, { email: normalizedEmail }] });

    if (user?.firebaseUid && user.firebaseUid !== firebaseUid) {
      return res.status(409).json({ success: false, error: 'Email is already linked to another account' });
    }

    // iOS Fix: Sync all three avatar fields for consistency across platforms
    const avatarUrl = avatar && typeof avatar === 'string' && avatar.trim() ? avatar.trim() : null;

    if (!user) {
      user = new User({
        firebaseUid,
        email: normalizedEmail,
        displayName: displayName || normalizedEmail.split('@')[0],
        avatar: avatarUrl,
        photoURL: avatarUrl,  // iOS Fix: Also sync photoURL
        profilePicture: avatarUrl,  // iOS Fix: Also sync profilePicture
      });
      await user.save();
      console.log('[Auth] NEW user created with avatar:', {
        firebaseUid,
        email: normalizedEmail,
        avatar: avatarUrl ? avatarUrl.substring(0, 100) : 'NULL',
        saved: true
      });
    } else {
      user.firebaseUid = user.firebaseUid || firebaseUid;
      user.email = user.email || normalizedEmail;
      user.displayName = displayName || user.displayName;
      // iOS Fix: Sync all three avatar fields
      user.avatar = avatarUrl || user.avatar;
      user.photoURL = avatarUrl || user.photoURL;
      user.profilePicture = avatarUrl || user.profilePicture;
      user.updatedAt = new Date();
      await user.save();
    }

    const token = jwt.sign({ userId: user._id, firebaseUid, email: normalizedEmail }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        firebaseUid,
        email: normalizedEmail,
        displayName: user.displayName,
        avatar: user.avatar || user.photoURL || user.profilePicture,  // iOS Fix: Return best available avatar
        photoURL: user.photoURL || user.avatar || user.profilePicture,  // Return all variants
        profilePicture: user.profilePicture || user.avatar || user.photoURL,
      },
    });
  } catch (err) {
    console.error('[Inline Auth] login-firebase error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Login failed' });
  }
});

app.post('/api/auth/register-firebase', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
      return res.status(503).json({ success: false, error: 'Database not connected (MONGO_URI missing or unreachable)' });
    }

    const { firebaseUid, email, displayName, avatar } = req.body || {};
    if (!firebaseUid || !email) {
      return res.status(400).json({ success: false, error: 'Firebase UID and email required' });
    }

    const User = mongoose.model('User');
    const normalizedEmail = String(email).toLowerCase().trim();
    let user = await User.findOne({ $or: [{ firebaseUid }, { email: normalizedEmail }] });

    if (user?.firebaseUid && user.firebaseUid !== firebaseUid) {
      return res.status(409).json({ success: false, error: 'Email is already linked to another account' });
    }

    // iOS Fix: Sync all three avatar fields for consistency across platforms
    const avatarUrl = avatar && typeof avatar === 'string' && avatar.trim() ? avatar.trim() : null;

    if (!user) {
      user = new User({
        firebaseUid,
        email: normalizedEmail,
        displayName: displayName || normalizedEmail.split('@')[0],
        avatar: avatarUrl,
        photoURL: avatarUrl,  // iOS Fix: Also sync photoURL
        profilePicture: avatarUrl,  // iOS Fix: Also sync profilePicture
        followers: 0,
        following: 0,
      });
      await user.save();
      console.log('[Auth Register] NEW user created with avatar:', {
        firebaseUid,
        email: normalizedEmail,
        avatar: avatarUrl ? avatarUrl.substring(0, 100) : 'NULL',
        saved: true
      });
    } else {
      user.firebaseUid = user.firebaseUid || firebaseUid;
      user.email = user.email || normalizedEmail;
      user.displayName = displayName || user.displayName;
      // iOS Fix: Sync all three avatar fields
      user.avatar = avatarUrl || user.avatar;
      user.photoURL = avatarUrl || user.photoURL;
      user.profilePicture = avatarUrl || user.profilePicture;
      user.updatedAt = new Date();
      await user.save();
      console.log('[Auth Register] EXISTING user updated with avatar:', {
        firebaseUid,
        email: normalizedEmail,
        newAvatar: avatarUrl ? avatarUrl.substring(0, 100) : 'NULL',
        oldAvatar: user.avatar ? user.avatar.substring(0, 100) : 'NULL'
      });
    }

    const token = jwt.sign({ userId: user._id, firebaseUid, email: normalizedEmail }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        firebaseUid,
        email: normalizedEmail,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error('[Inline Auth] register-firebase error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Registration failed' });
  }
});

// Branding endpoint (logo, app name, etc.)
app.get('/api/branding', (req, res) => {
  res.json({
    success: true,
    data: {
      appName: 'Trave Social',
      logoUrl: 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1766418070/logo/logo.png',
      splashIcon: 'https://res.cloudinary.com/dinwxxnzm/image/upload/v1767485380/splash/splash-icon.png',
      primaryColor: '#007AFF',
      secondaryColor: '#5856D6'
    }
  });
});

// Auth routes (already handled inline above - commenting out missing route)
// try {
//   app.use('/api/auth', require('./routes/auth'));
//   console.log('✅ Auth routes loaded');
// } catch (err) {
//   console.warn('⚠️ Auth routes error:', err.message);
// }

// Posts routes (for like/unlike endpoints)
// DISABLED TO DEBUG - try {
//  app.use('/api/posts', require('../routes/post'));
//  console.log('  ✅ /api/posts routes (like/unlike) loaded');
// } catch (err) {
//   console.warn('  ⚠️ /api/posts routes error:', err.message);
// }

// DISABLED TO DEBUG
// try {
//   app.use('/api/comments', require('../routes/comments'));
//   console.log('  ✅ /api/comments loaded');
// } catch (err) {
//   console.warn('  ⚠️ /api/comments error:', err.message);
// }

// DISABLED TO DEBUG
// try {
//   app.use('/api/messages', require('../routes/messages'));
//   console.log('  ✅ /api/messages loaded');
// } catch (err) {
//   console.warn('  ⚠️ /api/messages error:', err.message);
// }

// Update user profile (PATCH and PUT for profile editing)
app.put('/api/users/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { displayName, name, bio, website, location, phone, interests, avatar, photoURL, isPrivate } = req.body;

    const User = mongoose.model('User');
    const query = { $or: [{ firebaseUid: uid }, { uid }] };

    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    const updateData = {
      displayName: displayName || name,
      name: name || displayName,
      bio: bio || null,
      website: website || null,
      location: location || null,
      phone: phone || null,
      interests: interests || [],
      avatar: avatar || photoURL || null,
      photoURL: photoURL || avatar || null,
      isPrivate: isPrivate !== undefined ? isPrivate : false,
      updatedAt: new Date(),
    };

    const user = await User.findOneAndUpdate(query, { $set: updateData }, { new: true });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[Inline] PUT /api/users/:uid error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Same handler for PATCH
app.patch('/api/users/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { displayName, name, bio, website, location, phone, interests, avatar, photoURL, isPrivate } = req.body;

    const User = mongoose.model('User');
    const query = { $or: [{ firebaseUid: uid }, { uid }] };

    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    const updateData = {
      displayName: displayName || name,
      name: name || displayName,
      bio: bio || null,
      website: website || null,
      location: location || null,
      phone: phone || null,
      interests: interests || [],
      avatar: avatar || photoURL || null,
      photoURL: photoURL || avatar || null,
      isPrivate: isPrivate !== undefined ? isPrivate : false,
      updatedAt: new Date(),
    };

    const user = await User.findOneAndUpdate(query, { $set: updateData }, { new: true });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[Inline] PATCH /api/users/:uid error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DISABLED ALL ROUTER REQUIRES TO DEBUG - MINIMAL SERVER ONLY
// NOW RESTORING ESSENTIAL ROUTES

// Posts routes (for like/unlike endpoints)
try {
  app.use('/api/posts', require('../routes/post'));
  console.log('  ✅ /api/posts routes (like/unlike) loaded');
} catch (err) {
  console.warn('  ⚠️ /api/posts routes error:', err.message);
}

// User routes - JUST USERS ROUTER, NOT duplicate PUT/PATCH
// ALREADY REGISTERED AT TOP - DO NOT DUPLICATE

// Messages routes
try {
  app.use('/api/messages', require('../routes/messages'));
  console.log('  ✅ /api/messages loaded');
} catch (err) {
  console.warn('  ⚠️ /api/messages error:', err.message);
}

// Feed routes  
try {
  app.use('/api/feed', require('../routes/feed'));
  console.log('  ✅ /api/feed loaded');
} catch (err) {
  console.warn('  ⚠️ /api/feed error:', err.message);
}

// Stories routes
try {
  app.use('/api/stories', require('../routes/stories'));
  console.log('  ✅ /api/stories loaded');
} catch (err) {
  console.warn('  ⚠️ /api/stories error:', err.message);
}

// Highlights routes
try {
  app.use('/api', require('../routes/highlights'));
  console.log('  ✅ /api/highlights loaded');
} catch (err) {
  console.warn('  ⚠️ /api/highlights error:', err.message);
}

// Sections routes
try {
  app.use('/api/sections', require('../routes/sections'));
  console.log('  ✅ /api/sections loaded');
} catch (err) {
  console.warn('  ⚠️ /api/sections error:', err.message);
}

// Comments routes
try {
  app.use('/api/comments', require('../routes/comments'));
  console.log('  ✅ /api/comments loaded');
} catch (err) {
  console.warn('  ⚠️ /api/comments error:', err.message);
}

// Follow routes
try {
  app.use('/api/follow', require('../routes/follow'));
  console.log('  ✅ /api/follow loaded');
} catch (err) {
  console.warn('  ⚠️ /api/follow error:', err.message);
}

// Saved posts routes (under /api/users to match frontend: /users/:userId/saved)
try {
  app.use('/api/users', require('../routes/saved'));
  console.log('  ✅ /api/users (saved routes) loaded');
} catch (err) {
  console.warn('  ⚠️ /api/users (saved routes) error:', err.message);
}

// Moderation routes
try {
  app.use('/api/moderation', require('../routes/moderation'));
  console.log('  ✅ /api/moderation loaded');
} catch (err) {
  console.warn('  ⚠️ /api/moderation error:', err.message);
}

// Notifications routes
try {
  app.use('/api/notifications-legacy', require('../routes/notification'));
  console.log('  ✅ /api/notifications-legacy loaded');
} catch (err) {
  console.warn('  ⚠️ /api/notifications-legacy error:', err.message);
}

// Upload routes
try {
  app.use('/api/upload', require('../routes/upload'));
  console.log('  ✅ /api/upload loaded');
} catch (err) {
  console.warn('  ⚠️ /api/upload error:', err.message);
}

// Categories routes
try {
  app.use('/api/categories', require('../routes/categories'));
  console.log('  ✅ /api/categories loaded');
} catch (err) {
  console.warn('  ⚠️ /api/categories error:', err.message);
}

console.log('✅ Routes loading complete');

// Get post comments
app.get('/api/posts/:postId/comments', async (req, res, next) => {
  try {
    const Comment = mongoose.model('Comment');
    const User = mongoose.model('User');

    // Convert postId to string for comparison (MongoDB stores IDs as strings in some cases)
    const postIdStr = req.params.postId;
    const postIdObj = toObjectId(postIdStr);

    const comments = await Comment
      .find({
        $or: [
          { postId: postIdStr },
          { postId: postIdObj }
        ]
      })
      .sort({ createdAt: -1 })
      .lean();

    // Enrich comments with latest user avatar/name so stale/default avatars are corrected on read.
    const userIds = Array.from(new Set((comments || []).map((c) => String(c?.userId || '')).filter(Boolean)));
    if (userIds.length > 0) {
      const users = await User.find({
        $or: [
          { _id: { $in: userIds.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
          { firebaseUid: { $in: userIds } },
          { uid: { $in: userIds } }
        ]
      }).lean();

      const userMap = {};
      users.forEach((u) => {
        const docId = u?._id ? String(u._id) : '';
        const fuid = String(u?.firebaseUid || u?.uid || '');
        const avatar = u?.avatar || u?.photoURL || u?.profilePicture || null;
        const name = u?.displayName || u?.name || 'User';
        if (docId) userMap[docId] = { avatar, name };
        if (fuid) userMap[fuid] = { avatar, name };
      });

      const enriched = comments.map((c) => {
        const key = String(c?.userId || '');
        return {
          ...c,
          userName: userMap[key]?.name || c?.userName || 'User',
          userAvatar: userMap[key]?.avatar || c?.userAvatar || null
        };
      });

      return res.json({ success: true, data: enriched });
    }

    res.json({ success: true, data: comments });
  } catch (err) {
    next(err);
  }
});

// Add comment to post
app.post('/api/posts/:postId/comments', async (req, res, next) => {
  try {
    const { userId, text, userName, userAvatar } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'Missing userId or text' });
    }

    const Comment = mongoose.model('Comment');
    const User = mongoose.model('User');

    const normalizeAvatar = (value) => {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      const lower = trimmed.toLowerCase();
      if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
      return trimmed;
    };
    const isGenericDefaultAvatar = (value) => {
      const v = String(value || '').toLowerCase();
      if (!v) return true;
      return (
        v.includes('via.placeholder.com/200x200.png?text=profile') ||
        v.includes('/default%2fdefault-pic.jpg') ||
        v.includes('/default/default-pic.jpg')
      );
    };

    let serverResolvedAvatar = normalizeAvatar(userAvatar);
    let serverResolvedName = userName || 'Anonymous';
    try {
      const lookupIds = [String(userId)].filter(Boolean);
      const byObjectIds = lookupIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      const author = await User.findOne({
        $or: [
          { _id: { $in: byObjectIds } },
          { firebaseUid: { $in: lookupIds } },
          { uid: { $in: lookupIds } }
        ]
      }).lean();

      if (author) {
        const authorAvatar = normalizeAvatar(author.avatar || author.photoURL || author.profilePicture);
        if (!serverResolvedAvatar || isGenericDefaultAvatar(serverResolvedAvatar)) {
          serverResolvedAvatar = authorAvatar || serverResolvedAvatar;
        }
        serverResolvedName = author.displayName || author.name || serverResolvedName;
      }
    } catch (e) {
      // best-effort only
    }

    const newComment = {
      postId: req.params.postId,  // Store as string, DB will handle it
      userId,
      userName: serverResolvedName || 'Anonymous',
      userAvatar: serverResolvedAvatar || null,
      text,
      createdAt: new Date(),
      updatedAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {},
      replies: []
    };

    const createdComment = await Comment.create(newComment);

    // Update post's commentCount
    let updatedCommentCount = 0;
    let postOwnerId = null;
    try {
      const Post = mongoose.model('Post');
      const post = await Post.findById(req.params.postId);
      if (post) {
        postOwnerId = post.userId ? String(post.userId) : null;
        post.commentsCount = (post.commentsCount || 0) + 1;
        post.commentCount = (post.commentCount || 0) + 1;
        await post.save();
        updatedCommentCount = post.commentCount;
        console.log('[POST] /api/posts/:postId/comments - Updated post commentCount to:', post.commentCount);
      }
    } catch (err) {
      console.error('[POST] /api/posts/:postId/comments - Could not update commentCount:', err.message);
    }

    // Best-effort: create comment notification for post owner
    try {
      if (postOwnerId && postOwnerId !== String(userId)) {
        const Notification = mongoose.model('Notification');
        await Notification.create({
          recipientId: String(postOwnerId),
          senderId: String(userId),
          type: 'comment',
          postId: String(req.params.postId),
          message: 'commented on your post',
          read: false,
          createdAt: new Date()
        });
      }
    } catch (e) {
      console.warn('[POST] /api/posts/:postId/comments - Skipped notification:', e.message);
    }

    const createdId = createdComment?._id ? String(createdComment._id) : null;
    console.log('[POST] /api/posts/:postId/comments - Created comment:', createdId);
    return res.status(201).json({
      success: true,
      id: createdId,
      data: { ...newComment, _id: createdId },
      commentCount: updatedCommentCount // Return updated count
    });
  } catch (err) {
    console.error('[POST] /api/posts/:postId/comments error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/posts/:postId/comments (POST) loaded');

// PATCH /api/posts/:postId/comments/:commentId - Edit comment
app.patch('/api/posts/:postId/comments/:commentId', async (req, res, next) => {
  try {
    const { userId, text } = req.body;
    const { postId, commentId } = req.params;

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'Missing userId or text' });
    }

    const Comment = mongoose.model('Comment');

    // Check if comment exists and belongs to user
    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [
        { postId: postId },
        { postId: toObjectId(postId) }
      ]
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only edit your own comments' });
    }

    const result = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      {
        $set: {
          text,
          editedAt: new Date()
        }
      },
      { new: true }
    );

    console.log('[PATCH] /api/posts/:postId/comments/:commentId - Updated:', commentId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId (PATCH) loaded');

// DELETE /api/posts/:postId/comments/:commentId - Delete comment
app.delete('/api/posts/:postId/comments/:commentId', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { postId, commentId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const Comment = mongoose.model('Comment');

    // Check if comment exists and belongs to user
    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [
        { postId: postId },
        { postId: toObjectId(postId) }
      ]
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    let isPostOwner = false;
    try {
      const Post = mongoose.model('Post');
      const post = await Post.findById(postId);
      const postOwnerId = post?.userId != null ? String(post.userId) : null;
      isPostOwner = postOwnerId != null && postOwnerId === String(userId);
    } catch (e) {
      isPostOwner = false;
    }

    if (comment.userId !== userId && !isPostOwner) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized - you can only delete your own comments (or the post owner can moderate)'
      });
    }

    await Comment.deleteOne({ _id: toObjectId(commentId) });

    let updatedCommentCount = 0;
    try {
      const Post = mongoose.model('Post');
      const post = await Post.findById(postId);
      if (post) {
        const nextCount = Math.max(0, Number(post.commentCount || post.commentsCount || 0) - 1);
        post.commentCount = nextCount;
        post.commentsCount = nextCount;
        await post.save();
        updatedCommentCount = nextCount;
      }
    } catch (e) {
      console.warn('[DELETE] /api/posts/:postId/comments/:commentId - Counter update skipped:', e.message);
    }

    console.log('[DELETE] /api/posts/:postId/comments/:commentId - Deleted:', commentId);
    res.json({ success: true, message: 'Comment deleted', commentCount: updatedCommentCount, commentsCount: updatedCommentCount });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId (DELETE) loaded');

// POST /api/posts/:postId/comments/:commentId/like - Like a comment
app.post('/api/posts/:postId/comments/:commentId/like', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { postId, commentId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const Comment = mongoose.model('Comment');

    const comment = await Comment.findOne({ _id: toObjectId(commentId) });
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const likes = comment.likes || [];
    if (likes.includes(userId)) {
      return res.status(400).json({ success: false, error: 'Already liked' });
    }

    likes.push(userId);
    const result = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { likes, likesCount: likes.length } },
      { new: true }
    );

    console.log('[POST] /api/posts/:postId/comments/:commentId/like - User', userId, 'liked comment');
    res.json({ success: true, data: { likes: result.likes, likesCount: result.likesCount } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/like (POST) loaded');

// POST /api/posts/:postId/comments/:commentId/like/toggle - Toggle like (Instagram style)
app.post('/api/posts/:postId/comments/:commentId/like/toggle', async (req, res, next) => {
  try {
    const { userId } = req.body;
    const { commentId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const Comment = mongoose.model('Comment');

    const comment = await Comment.findOne({ _id: toObjectId(commentId) });
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const likes = Array.isArray(comment.likes) ? [...comment.likes] : [];
    const idx = likes.indexOf(userId);

    let liked = false;
    if (idx >= 0) {
      likes.splice(idx, 1);
      liked = false;
    } else {
      likes.push(userId);
      liked = true;
    }

    const updated = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { likes, likesCount: likes.length } },
      { new: true }
    );

    return res.json({
      success: true,
      data: {
        liked,
        likes: updated?.likes || likes,
        likesCount: typeof updated?.likesCount === 'number' ? updated.likesCount : likes.length
      }
    });
  } catch (err) {
    console.error('[POST] /api/posts/:postId/comments/:commentId/like/toggle error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/like/toggle (POST) loaded');

// POST /api/posts/:postId/comments/:commentId/reactions - Add reaction to comment
app.post('/api/posts/:postId/comments/:commentId/reactions', async (req, res, next) => {
  try {
    const { userId, reaction, removeExisting } = req.body;
    const { postId, commentId } = req.params;

    if (!userId || !reaction) {
      return res.status(400).json({ success: false, error: 'userId and reaction required' });
    }

    const Comment = mongoose.model('Comment');

    const comment = await Comment.findOne({ _id: toObjectId(commentId) });
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const reactions = (comment.reactions && typeof comment.reactions === 'object' && !Array.isArray(comment.reactions))
      ? { ...comment.reactions }
      : {};

    const shouldRemoveExisting = removeExisting === true;
    if (shouldRemoveExisting) {
      for (const [emoji, users] of Object.entries(reactions)) {
        if (!Array.isArray(users)) continue;
        reactions[emoji] = users.filter(u => String(u) !== String(userId));
        if (Array.isArray(reactions[emoji]) && reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      }
    }

    reactions[reaction] = Array.isArray(reactions[reaction]) ? reactions[reaction] : [];
    if (!reactions[reaction].includes(userId)) {
      reactions[reaction].push(userId);
    }

    const result = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { reactions } },
      { new: true }
    );

    console.log('[POST] /api/posts/:postId/comments/:commentId/reactions - User', userId, 'reacted:', reaction);
    res.json({ success: true, data: { reactions: result.reactions } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/reactions (POST) loaded');

// DELETE /api/posts/:postId/comments/:commentId/reactions/:userId - Remove user's reaction
app.delete('/api/posts/:postId/comments/:commentId/reactions/:userId', async (req, res, next) => {
  try {
    const { commentId, userId } = req.params;

    const Comment = mongoose.model('Comment');

    const comment = await Comment.findOne({ _id: toObjectId(commentId) });
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const reactions = (comment.reactions && typeof comment.reactions === 'object' && !Array.isArray(comment.reactions))
      ? { ...comment.reactions }
      : {};

    for (const [emoji, users] of Object.entries(reactions)) {
      if (!Array.isArray(users)) continue;
      reactions[emoji] = users.filter(u => String(u) !== String(userId));
      if (Array.isArray(reactions[emoji]) && reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    const result = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { reactions } },
      { new: true }
    );

    return res.json({ success: true, data: { reactions: result.reactions } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/reactions/:userId (DELETE) loaded');

// POST /api/posts/:postId/comments/:commentId/replies - Add reply to comment
app.post('/api/posts/:postId/comments/:commentId/replies', async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const { userId, text, userName, userAvatar } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'Missing userId or text' });
    }

    const Comment = mongoose.model('Comment');

    const reply = {
      _id: new mongoose.Types.ObjectId(),
      userId: String(userId),
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      editedAt: null,
      likes: [],
      likesCount: 0,
      reactions: {}
    };

    const result = await Comment.findOneAndUpdate(
      {
        _id: toObjectId(commentId),
        $or: [
          { postId: postId },
          { postId: toObjectId(postId) }
        ]
      },
      {
        $push: { replies: reply },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    return res.status(201).json({ success: true, id: reply._id, data: reply });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/replies (POST) loaded');

// PATCH /api/posts/:postId/comments/:commentId/replies/:replyId - Edit reply
app.patch('/api/posts/:postId/comments/:commentId/replies/:replyId', async (req, res, next) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const { userId, text } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'Missing userId or text' });
    }

    const Comment = mongoose.model('Comment');

    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [
        { postId: postId },
        { postId: toObjectId(postId) }
      ]
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const replyObjId = toObjectId(replyId);
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const reply = replies.find(r => {
      if (replyObjId && r?._id) return String(r._id) === String(replyObjId);
      return String(r?._id) === String(replyId);
    });

    if (!reply) {
      return res.status(404).json({ success: false, error: 'Reply not found' });
    }

    if (String(reply.userId) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only edit your own replies' });
    }

    const result = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      {
        $set: {
          'replies.$[r].text': text,
          'replies.$[r].editedAt': new Date(),
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [{ 'r._id': replyObjId || replyId }],
        new: true
      }
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/replies/:replyId (PATCH) loaded');

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId - Delete reply (author OR post owner moderation)
app.delete('/api/posts/:postId/comments/:commentId/replies/:replyId', async (req, res, next) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const Comment = mongoose.model('Comment');

    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [
        { postId: postId },
        { postId: toObjectId(postId) }
      ]
    });

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const replyObjId = toObjectId(replyId);
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const reply = replies.find(r => {
      if (replyObjId && r?._id) return String(r._id) === String(replyObjId);
      return String(r?._id) === String(replyId);
    });

    if (!reply) {
      return res.status(404).json({ success: false, error: 'Reply not found' });
    }

    let isPostOwner = false;
    try {
      const Post = mongoose.model('Post');
      const post = await Post.findById(postId);
      const postOwnerId = post?.userId != null ? String(post.userId) : null;
      isPostOwner = postOwnerId != null && postOwnerId === String(userId);
    } catch (e) {
      isPostOwner = false;
    }

    if (String(reply.userId) !== String(userId) && !isPostOwner) {
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only delete your own replies (or post owner can moderate)' });
    }

    const pullQuery = replyObjId ? { _id: replyObjId } : { _id: replyId };
    const updated = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      {
        $pull: { replies: pullQuery },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/replies/:replyId (DELETE) loaded');

// POST /api/posts/:postId/comments/:commentId/replies/:replyId/like/toggle - Toggle like on reply
app.post('/api/posts/:postId/comments/:commentId/replies/:replyId/like/toggle', async (req, res, next) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const Comment = mongoose.model('Comment');
    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [{ postId: postId }, { postId: toObjectId(postId) }]
    });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyObjId = toObjectId(replyId);
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const reply = replies.find(r => (replyObjId && r?._id) ? String(r._id) === String(replyObjId) : String(r?._id) === String(replyId));
    if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

    const likes = Array.isArray(reply.likes) ? [...reply.likes] : [];
    const idx = likes.indexOf(String(userId));
    const liked = idx < 0;
    if (idx >= 0) likes.splice(idx, 1); else likes.push(String(userId));

    const updated = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { 'replies.$[r].likes': likes, 'replies.$[r].likesCount': likes.length, updatedAt: new Date() } },
      { arrayFilters: [{ 'r._id': replyObjId || replyId }], new: true }
    );

    return res.json({ success: true, data: { liked, likes, likesCount: likes.length, comment: updated } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/replies/:replyId/like/toggle (POST) loaded');

// POST /api/posts/:postId/comments/:commentId/replies/:replyId/reactions - Add reaction to reply
app.post('/api/posts/:postId/comments/:commentId/replies/:replyId/reactions', async (req, res, next) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const { userId, reaction, removeExisting } = req.body;
    if (!userId || !reaction) return res.status(400).json({ success: false, error: 'userId and reaction required' });

    const Comment = mongoose.model('Comment');
    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [{ postId: postId }, { postId: toObjectId(postId) }]
    });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyObjId = toObjectId(replyId);
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const reply = replies.find(r => (replyObjId && r?._id) ? String(r._id) === String(replyObjId) : String(r?._id) === String(replyId));
    if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

    const reactions = (reply.reactions && typeof reply.reactions === 'object' && !Array.isArray(reply.reactions)) ? { ...reply.reactions } : {};
    if (removeExisting === true) {
      for (const [emoji, users] of Object.entries(reactions)) {
        if (!Array.isArray(users)) continue;
        reactions[emoji] = users.filter(u => String(u) !== String(userId));
        if (reactions[emoji].length === 0) delete reactions[emoji];
      }
    }
    reactions[reaction] = Array.isArray(reactions[reaction]) ? reactions[reaction] : [];
    if (!reactions[reaction].includes(String(userId))) reactions[reaction].push(String(userId));

    const updated = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { 'replies.$[r].reactions': reactions, updatedAt: new Date() } },
      { arrayFilters: [{ 'r._id': replyObjId || replyId }], new: true }
    );
    return res.json({ success: true, data: { reactions, comment: updated } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/replies/:replyId/reactions (POST) loaded');

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId/reactions/:userId - Remove user's reaction from reply
app.delete('/api/posts/:postId/comments/:commentId/replies/:replyId/reactions/:userId', async (req, res, next) => {
  try {
    const { postId, commentId, replyId, userId } = req.params;
    const Comment = mongoose.model('Comment');
    const comment = await Comment.findOne({
      _id: toObjectId(commentId),
      $or: [{ postId: postId }, { postId: toObjectId(postId) }]
    });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyObjId = toObjectId(replyId);
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const reply = replies.find(r => (replyObjId && r?._id) ? String(r._id) === String(replyObjId) : String(r?._id) === String(replyId));
    if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

    const reactions = (reply.reactions && typeof reply.reactions === 'object' && !Array.isArray(reply.reactions)) ? { ...reply.reactions } : {};
    for (const [emoji, users] of Object.entries(reactions)) {
      if (!Array.isArray(users)) continue;
      reactions[emoji] = users.filter(u => String(u) !== String(userId));
      if (reactions[emoji].length === 0) delete reactions[emoji];
    }

    const updated = await Comment.findOneAndUpdate(
      { _id: toObjectId(commentId) },
      { $set: { 'replies.$[r].reactions': reactions, updatedAt: new Date() } },
      { arrayFilters: [{ 'r._id': replyObjId || replyId }], returnDocument: 'after' }
    );
    return res.json({ success: true, data: { reactions, comment: updated.value } });
  } catch (err) {
    console.error('[DELETE] /api/posts/:postId/comments/:commentId/replies/:replyId/reactions/:userId error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/posts/:postId/comments/:commentId/replies/:replyId/reactions/:userId (DELETE) loaded');

// DELETE /api/posts/:postId/like - Unlike a post
app.delete('/api/posts/:postId/like', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    console.log('[DELETE] /api/posts/:postId/like called - postId:', postId, 'userId:', userId);

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const Post = mongoose.model('Post');
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (!post.likes) post.likes = [];

    // Check if liked
    if (!post.likes.includes(userId)) {
      console.log('[DELETE] /api/posts/:postId/like - Not liked');
      return res.status(400).json({ success: false, error: 'Not liked' });
    }

    post.likes = post.likes.filter(id => id !== userId);
    const savedPost = await post.save();

    console.log('[DELETE] /api/posts/:postId/like - User', userId, 'unliked post', postId, 'new total:', savedPost.likes.length);
    return res.json({ success: true, data: { likes: savedPost.likes, total: savedPost.likes.length } });
  } catch (err) {
    console.error('[DELETE] /api/posts/:postId/like error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/posts/:postId/like (DELETE) loaded');

// Privacy toggle endpoint
app.patch('/api/users/:uid/privacy', async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { isPrivate } = req.body;

    if (isPrivate === undefined) {
      return res.status(400).json({ success: false, error: 'isPrivate is required' });
    }

    const User = mongoose.model('User');
    const query = { $or: [{ firebaseUid: uid }, { uid }] };

    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    const user = await User.findOneAndUpdate(
      query,
      { $set: { isPrivate, updatedAt: new Date() } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({ success: true, data: { isPrivate: user.isPrivate } });
  } catch (err) {
    console.error('[PATCH] /api/users/:uid/privacy error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
console.log('  ✅ /api/users/:uid/privacy loaded');

// POST /api/users/:userId/block/:blockUserId - Block a user
app.post('/api/users/:userId/block/:blockUserId', async (req, res, next) => {
  try {
    const { userId, blockUserId } = req.params;

    if (userId === blockUserId) {
      return res.status(400).json({ success: false, error: 'Cannot block yourself' });
    }

    const Block = mongoose.model('Block');

    // Check if already blocked
    const existing = await Block.findOne({
      blockerId: (userId),
      blockedId: (blockUserId)
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'User already blocked' });
    }

    // Add block
    const result = await new Block({
      blockerId: (userId),
      blockedId: (blockUserId),
      createdAt: new Date()
    }).save();

    console.log('[POST] /api/users/:userId/block/:blockUserId - Blocked user:', blockUserId);
    res.status(201).json({ success: true, data: { blockId: result._id } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/block/:blockUserId (POST) loaded');

// DELETE /api/users/:userId/block/:blockUserId - Unblock a user
app.delete('/api/users/:userId/block/:blockUserId', async (req, res, next) => {
  try {
    const { userId, blockUserId } = req.params;

    const User = mongoose.model('User');
    const result = await User.updateOne(
      { _id: toObjectId(userId) },
      { $pull: { blockedUsers: blockUserId } }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Block not found' });
    }

    console.log('[DELETE] /api/users/:userId/block/:blockUserId - Unblocked user:', blockUserId);
    res.status(200).json({ success: true, message: 'User unblocked' });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/block/:blockUserId (DELETE) loaded');

// POST /api/posts/:postId/report - Report a post
app.post('/api/posts/:postId/report', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { userId, reason, details } = req.body;

    if (!userId || !reason) {
      return res.status(400).json({ success: false, error: 'userId and reason required' });
    }

    const Report = mongoose.model('Report');
    // Check if already reported by this user
    const existing = await Report.findOne({
      reporterId: toObjectId(userId),
      postId: toObjectId(postId)
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Already reported' });
    }

    const result = await new Report({
      postId: toObjectId(postId),
      reporterId: toObjectId(userId),
      reason,
      details: details || '',
      status: 'pending',
      createdAt: new Date()
    });

    console.log('[POST] /api/posts/:postId/report - Report created:', result._id);
    res.status(201).json({ success: true, data: { reportId: result._id } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/posts/:postId/report (POST) loaded');

// POST /api/users/:userId/report - Report a user
app.post('/api/users/:userId/report', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reporterId, reason, details } = req.body;

    if (!reporterId || !reason) {
      return res.status(400).json({ success: false, error: 'reporterId and reason required' });
    }

    if (userId === reporterId) {
      return res.status(400).json({ success: false, error: 'Cannot report yourself' });
    }

    const Report = mongoose.model('Report');
    // Check if already reported
    const existing = await Report.findOne({
      reporterId: toObjectId(reporterId),
      userId: toObjectId(userId)
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Already reported' });
    }

    const report = new Report({
      userId: toObjectId(userId),
      reporterId: toObjectId(reporterId),
      reason,
      details: details || '',
      status: 'pending',
      createdAt: new Date()
    });

    await report.save();

    console.log('[POST] /api/users/:userId/report - User report created:', report._id);
    res.status(201).json({ success: true, data: { reportId: report._id } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/report (POST) loaded');

// GET /api/users/:userId/profile-url - Get shareable profile URL
app.get('/api/users/:userId/profile-url', async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Generate profile URL (assuming frontend domain)
    const profileUrl = `https://trave-social.expo.dev/profile/${userId}`;

    console.log('[GET] /api/users/:userId/profile-url - Generated:', profileUrl);
    res.json({ success: true, data: { profileUrl, userId } });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/profile-url (GET) loaded');

// GET /api/notifications/:userId - Get user notifications
app.get('/api/notifications/:userId', verifyToken, async (req, res, next) => {
  try {
    const userId = String(req.userId || '');
    const firebaseUidFromToken = req.user?.firebaseUid;

    const { limit = 50, skip = 0 } = req.query;

    if (ENABLE_NOTIFICATION_ROUTE_LOGS) {
      console.log('[GET] /api/notifications/:userId - userId(from token):', userId);
    }

    const recipientIds = [String(userId)];
    if (firebaseUidFromToken) recipientIds.push(String(firebaseUidFromToken));
    const recipientObjId = mongoose.Types.ObjectId.isValid(userId) ? toObjectId(userId) : null;

    const recipientQuery = {
      $in: [
        ...recipientIds,
        ...(recipientObjId ? [recipientObjId] : [])
      ]
    };

    const Notification = mongoose.model('Notification');
    const notifications = await Notification
      .find({ recipientId: recipientQuery })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip) || 0)
      .limit(parseInt(limit) || 50);

    const notificationsArray = Array.isArray(notifications) ? notifications.map(n => n.toObject ? n.toObject() : n) : [];

    const sanitized = notificationsArray.map(n => {
      const type = n?.type != null ? String(n.type) : '';
      const safe = { ...n };
      if (type === 'message' || type === 'dm') safe.message = 'messaged you';
      if (type === 'like') safe.message = 'liked your post';
      if (type === 'comment') safe.message = 'commented on your post';
      if (type === 'follow') safe.message = 'started following you';
      if (type === 'mention') safe.message = 'mentioned you in a post';
      if (type === 'tag') safe.message = 'tagged you in a post';
      if (type === 'live') safe.message = 'started a live stream';
      if (type === 'story' && !safe.message) safe.message = 'updated your story';
      return safe;
    });

    const total = await Notification.countDocuments({ recipientId: recipientQuery });

    if (ENABLE_NOTIFICATION_ROUTE_LOGS) {
      console.log('[GET] /api/notifications/:userId - Returned', sanitized?.length || 0, 'of', total);
    }
    res.json({ success: true, data: sanitized || [], total });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/notifications/:userId (GET) loaded');

app.patch('/api/notifications/read-all', verifyToken, async (req, res, next) => {
  try {
    const userId = String(req.userId || '');
    const firebaseUidFromToken = req.user?.firebaseUid;

    const Notification = mongoose.model('Notification');

    const recipientIds = [String(userId)];
    if (firebaseUidFromToken) recipientIds.push(String(firebaseUidFromToken));
    const recipientObjId = mongoose.Types.ObjectId.isValid(userId) ? toObjectId(userId) : null;

    const recipientQuery = {
      $in: [
        ...recipientIds,
        ...(recipientObjId ? [recipientObjId] : [])
      ]
    };

    const result = await Notification.updateMany(
      { recipientId: recipientQuery, read: { $ne: true } },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({ success: true, modifiedCount: result.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/notifications/read-all (PATCH) loaded');

app.post('/api/notifications', verifyToken, async (req, res, next) => {
  try {
    const { recipientId, type, postId, message, commentId, storyId, streamId, conversationId } = req.body;
    const senderId = String(req.userId || '');

    if (!recipientId || !senderId || !type) {
      return res.status(400).json({ success: false, error: 'recipientId, senderId, type required' });
    }

    // Don't create notification if recipient is sender
    if (recipientId === senderId) {
      return res.status(200).json({ success: true, message: 'Notification not created (self)' });
    }

    const Notification = mongoose.model('Notification');
    const User = mongoose.model('User');

    const senderUser = mongoose.Types.ObjectId.isValid(senderId)
      ? await User.findOne({ _id: toObjectId(senderId) })
      : null;
    const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
    const senderAvatar = senderUser?.avatar || senderUser?.photoURL || null;

    const safeType = type != null ? String(type) : '';
    let safeMessage = typeof message === 'string' ? message : '';
    if (safeType === 'message' || safeType === 'dm') safeMessage = 'messaged you';
    if (safeType === 'like') safeMessage = 'liked your post';
    if (safeType === 'comment') safeMessage = 'commented on your post';
    if (safeType === 'follow') safeMessage = 'started following you';
    if (safeType === 'mention') safeMessage = 'mentioned you in a post';
    if (safeType === 'tag') safeMessage = 'tagged you in a post';
    if (safeType === 'live') safeMessage = 'started a live stream';
    if (safeType === 'story' && !safeMessage) safeMessage = 'updated your story';

    const notification = {
      recipientId: String(recipientId),
      senderId: String(senderId),
      senderName,
      senderAvatar,
      type, // 'like', 'comment', 'follow', 'mention', 'tag', 'message', 'story', 'live'
      postId: postId ? String(postId) : null,
      commentId: commentId ? String(commentId) : null,
      storyId: storyId ? String(storyId) : null,
      streamId: streamId ? String(streamId) : null,
      conversationId: conversationId ? String(conversationId) : null,
      message: safeMessage || `${safeType} notification`,
      read: false,
      createdAt: new Date()
    };

    const newNotification = new Notification(notification);
    await newNotification.save();
    notification._id = newNotification._id;

    console.log('[POST] /api/notifications - Created:', type, 'for user:', recipientId);
    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/notifications (POST) loaded');

// PATCH /api/notifications/:notificationId/read - Mark notification as read
app.patch('/api/notifications/:notificationId/read', verifyToken, async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    const userId = String(req.userId || '');
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userId)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const Notification = mongoose.model('Notification');
    const existing = await Notification.findOne({ _id: toObjectId(notificationId) });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    const recipientId = existing?.recipientId != null ? String(existing.recipientId) : '';
    const allowed = idsToMatch.includes(recipientId);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const result = await Notification.findOneAndUpdate(
      { _id: toObjectId(notificationId) },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );

    console.log('[PATCH] /api/notifications/:notificationId/read - Marked read');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/notifications/:notificationId/read (PATCH) loaded');

// PUT /api/users/:userId/push-token - Save Expo push token for current user
app.put('/api/users/:userId/push-token', verifyToken, async (req, res, next) => {
  try {
    const { pushToken } = req.body;
    const userId = String(req.userId || '');

    if (!pushToken || typeof pushToken !== 'string') {
      return res.status(400).json({ success: false, error: 'pushToken required' });
    }

    const User = mongoose.model('User');
    const updated = await User.findOneAndUpdate(
      { $or: [{ _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }, { firebaseUid: userId }, { uid: userId }] },
      { $set: { pushToken, pushTokenUpdatedAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
console.log('  ✅ /api/users/:userId/push-token (PUT) loaded');

console.log('  ✅ Comments and privacy endpoints loaded');

// Add logging for unmatched routes (AFTER all routes defined)
app.use((req, res) => {
  console.warn(`🔍 [404] ${req.method} ${req.originalUrl} - No route matched`);
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

console.log('✅ 404 handler registered');

// ============= ERROR HANDLING =============
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

console.log('✅ Error handler registered');

// ============= SOCKET.IO EVENT HANDLERS =============
// Store connected users: { userId: socketId }
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // User joins with their userId
  socket.on('join', (userId) => {
    if (userId) {
      connectedUsers.set(userId, socket.id);
      socket.userId = userId;

      // Join user's personal room
      socket.join(`user_${userId}`);

      console.log(`👤 User ${userId} joined with socket ${socket.id}`);

      // Notify user they're connected
      socket.emit('connected', { userId, socketId: socket.id });
    }
  });

  // User subscribes to a conversation
  socket.on('subscribeToConversation', (conversationId) => {
    if (conversationId) {
      socket.join(conversationId);
      console.log(`📬 Socket ${socket.id} subscribed to conversation: ${conversationId}`);
    }
  });

  // User unsubscribes from a conversation
  socket.on('unsubscribeFromConversation', (conversationId) => {
    if (conversationId) {
      socket.leave(conversationId);
      console.log(`📭 Socket ${socket.id} unsubscribed from conversation: ${conversationId}`);
    }
  });

  // Send message event
  socket.on('sendMessage', async (data) => {
    try {
      const { conversationId, senderId, recipientId, text, timestamp } = data;
      console.log('📨 Message received:', { conversationId, senderId, recipientId, text: text?.substring(0, 30) });

      // Save message to database
      const Conversation = mongoose.model('Conversation');
      const convo = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });

      if (convo) {
        const message = {
          id: new mongoose.Types.ObjectId().toString(),
          senderId,
          recipientId,
          text,
          timestamp: timestamp || new Date(),
          read: false,
          delivered: false
        };

        convo.messages.push(message);
        convo.lastMessage = text;
        convo.lastMessageAt = new Date();
        await convo.save();

        // Use the actual conversationId from database
        const actualConversationId = convo.conversationId;

        // Emit to sender (confirmation)
        socket.emit('messageSent', { ...message, conversationId: actualConversationId });

        // Emit to conversation room (all subscribers)
        io.to(actualConversationId).emit('newMessage', { ...message, conversationId: actualConversationId });

        // Emit to recipient's personal room
        io.to(`user_${recipientId}`).emit('newMessage', { ...message, conversationId: actualConversationId });

        // Emit to sender's personal room (for multi-device sync)
        io.to(`user_${senderId}`).emit('newMessage', { ...message, conversationId: actualConversationId });

        // Check if recipient is online for delivery status
        const recipientSocketId = connectedUsers.get(recipientId);
        if (recipientSocketId) {
          // Mark as delivered
          message.delivered = true;
          await convo.save();

          // Notify sender of delivery
          socket.emit('messageDelivered', { messageId: message.id, conversationId: actualConversationId });
        }

        console.log('✅ Message saved and emitted to rooms:', {
          conversationRoom: actualConversationId,
          recipientRoom: `user_${recipientId}`,
          senderRoom: `user_${senderId}`
        });
      }
    } catch (error) {
      console.error('❌ Error handling sendMessage:', error);
      socket.emit('messageError', { error: error.message });
    }
  });

  // Mark message as read
  socket.on('markAsRead', async (data) => {
    try {
      const { conversationId, messageId, userId } = data;
      console.log('👁️ Mark as read:', { conversationId, messageId, userId });

      const Conversation = mongoose.model('Conversation');
      const convo = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });

      if (convo) {
        const message = convo.messages.find(m => m.id === messageId);
        if (message && message.recipientId === userId) {
          message.read = true;
          await convo.save();

          // Notify sender
          const senderSocketId = connectedUsers.get(message.senderId);
          if (senderSocketId) {
            io.to(senderSocketId).emit('messageRead', { messageId, conversationId });
          }

          console.log('✅ Message marked as read');
        }
      }
    } catch (error) {
      console.error('❌ Error marking message as read:', error);
    }
  });

  // User typing indicator
  socket.on('typing', (data) => {
    const { conversationId, userId, recipientId } = data;
    const recipientSocketId = connectedUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('userTyping', { conversationId, userId });
    }
  });

  socket.on('stopTyping', (data) => {
    const { conversationId, userId, recipientId } = data;
    const recipientSocketId = connectedUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('userStoppedTyping', { conversationId, userId });
    }
  });

  // Send media message (image, video, audio)
  socket.on('sendMediaMessage', async (data) => {
    try {
      const { conversationId, senderId, recipientId, mediaUrl, mediaType, audioUrl, audioDuration, text, thumbnailUrl, tempId } = data;
      console.log('📸 Media message received:', { conversationId, senderId, mediaType: mediaType?.substring(0, 5) });

      const Conversation = mongoose.model('Conversation');
      const convo = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });

      if (convo) {
        const message = {
          id: new mongoose.Types.ObjectId().toString(),
          senderId,
          recipientId,
          text: text || '',
          mediaType,
          mediaUrl,
          audioUrl,
          audioDuration,
          thumbnailUrl,
          timestamp: new Date(),
          read: false,
          delivered: false,
          readBy: [senderId],
          tempId
        };

        convo.messages.push(message);
        convo.lastMessage = `[${mediaType?.toUpperCase()}]`;
        convo.lastMessageAt = new Date();
        await convo.save();

        const actualConversationId = convo.conversationId;

        // Emit to conversation room
        io.to(actualConversationId).emit('newMediaMessage', { ...message, conversationId: actualConversationId });

        // Emit to recipient's personal room
        if (recipientId) {
          io.to(`user_${recipientId}`).emit('newMediaMessage', { ...message, conversationId: actualConversationId });
        }

        // Emit to sender's personal room
        io.to(`user_${senderId}`).emit('newMediaMessage', { ...message, conversationId: actualConversationId });

        console.log('✅ Media message saved:', mediaType);
      }
    } catch (error) {
      console.error('❌ Error handling sendMediaMessage:', error);
      socket.emit('messageError', { error: error.message });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      console.log(`👋 User ${socket.userId} disconnected`);
    }
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

console.log('✅ Socket.IO event handlers registered');

console.log('🚀 STARTING SERVER - PORT:', PORT, typeof PORT);
console.log('🚀 STARTING SERVER - Type of PORT:', typeof PORT);

// ============= START SERVER =============
try {
  server.listen(parseInt(PORT) || 5000, '0.0.0.0', () => {
    console.log(`✅ Backend running on port ${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api`);
    console.log(`   Socket.IO: ws://localhost:${PORT}`);
    console.log('🎉 SERVER LISTENING - READY FOR CONNECTIONS');
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
  });
} catch (err) {
  console.error('❌ Failed to start server:', err.message);
}

console.log('✅ Server startup code executed');

// Global error handler
app.use((err, req, res, next) => {
  console.error(`❌ [ERROR] ${req.method} ${req.path}:`, err);

  if (err.name === 'MongooseError' || err.message.includes('buffering timed out')) {
    return res.status(503).json({
      success: false,
      error: 'Database operation timed out. This is usually due to an IP whitelist issue in MongoDB Atlas.',
      details: err.message
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;












