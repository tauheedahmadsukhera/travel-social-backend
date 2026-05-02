require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const fs = require('fs');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

// Config & Utils
const { validateEnv } = require('./config/validateEnv');
validateEnv();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ============= FIREBASE INITIALIZATION =============
try {
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.warn('⚠️ serviceAccountKey.json not found, push notifications may not work');
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization warning:', error.message);
}

// Hardening
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Middleware
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(mongoSanitize());
app.use(hpp());

// Original CORS from index.js.good
app.use(cors({
  origin: ['https://trave-social-backend.onrender.com', 'http://localhost:3000', 'http://localhost:5000', 'http://localhost:8081', 'http://10.0.2.2:5000', '*'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Assets
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/stamps', express.static(path.join(__dirname, '../stamps')));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ====== MODELS AUTO-REGISTRATION ======
const modelsPath = path.resolve(__dirname, '../models');
if (fs.existsSync(modelsPath)) {
  fs.readdirSync(modelsPath).forEach(file => {
    if (file.endsWith('.js')) require(path.join(modelsPath, file));
  });
  console.log('✅ Models registered');
}

// Socket.IO
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);
const { registerMessagingSocket } = require('./socket/registerMessagingSocket');
const { toObjectId } = require('./utils/userUtils');
const { sendExpoPushToUser } = require('./services/notificationService');

try {
  registerMessagingSocket({ io, mongoose, toObjectId, sendExpoPushToUser });
  console.log('✅ Socket.IO handlers registered');
} catch (e) {
  console.error('❌ Socket.IO Registration Error:', e.message);
}

// ============= INLINE AUTH FALLBACKS (FROM index.js.good) =============
app.post('/api/auth/login-firebase', async (req, res) => {
  try {
    const { firebaseUid, email, displayName, avatar } = req.body || {};
    if (!firebaseUid || !email) {
      return res.status(400).json({ success: false, error: 'Firebase UID and email required' });
    }

    const User = mongoose.model('User');
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = new User({
        firebaseUid,
        email,
        displayName: displayName || email.split('@')[0],
        avatar: avatar || null,
      });
      await user.save();
    } else {
      user.displayName = displayName || user.displayName;
      user.avatar = avatar || user.avatar;
      user.updatedAt = new Date();
      await user.save();
    }

    const token = jwt.sign({ userId: user._id, firebaseUid, email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        firebaseUid,
        email,
        displayName: user.displayName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('[Inline Auth] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CRITICAL INLINE GET ROUTES (FROM index.js.good)
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await mongoose.model('Post').find().sort({ createdAt: -1 }).limit(50).catch(() => []);
    res.status(200).json({ success: true, data: Array.isArray(posts) ? posts : [] });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await mongoose.model('Category').find().catch(() => []);
    res.status(200).json({ success: true, data: Array.isArray(categories) ? categories : [] });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

app.get('/api/live-streams', async (req, res) => {
  try {
    const streams = await mongoose.model('LiveStream').find({ isActive: true }).catch(() => []);
    res.status(200).json({ success: true, data: Array.isArray(streams) ? streams : [] });
  } catch (err) {
    res.status(200).json({ success: true, data: [] });
  }
});

// --- API Routes ---
console.log('🔧 Loading API routes...');
app.use('/api/auth', require('../routes/auth'));
app.use('/api/users', require('../routes/users'));
app.use('/api/posts', require('../routes/posts'));
app.use('/api/comments', require('../routes/comments'));
app.use('/api/conversations', require('../routes/conversations'));
app.use('/api/messages', require('../routes/messages'));
app.use('/api/notifications', require('../routes/notification'));
app.use('/api/stories', require('../routes/stories'));
app.use('/api/live-streams', require('../routes/live'));
app.use('/api/feed', require('../routes/feed'));
app.use('/api/upload', require('../routes/upload'));
app.use('/api/passport', require('../routes/passport'));
app.use('/api/groups', require('../routes/groups'));
app.use('/api/moderation', require('../routes/moderation'));
app.use('/api/admin', require('../routes/admin'));
app.use('/api/public', require('../routes/public'));

app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
      <h1 style="color: #4a90e2;">🚀 Trave Social Backend is Running</h1>
      <p>API Base: <code>/api</code></p>
      <p>Health Check: <a href="/api/health">/api/health</a></p>
      <hr style="width: 200px; margin: 20px auto; border: 0; border-top: 1px solid #eee;">
      <p style="color: #888; font-size: 0.9em;">Status: Active | Node.js Express Server</p>
    </div>
  `);
});

app.get('/api', (req, res) => res.json({ success: true, message: 'Trave Social API is live', endpoints: ['/auth', '/users', '/posts', '/feed'] }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error Handler:', err.message);
  res.status(err.status || 500).json({ success: false, error: err.message });
});

// Process Protection
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
});

module.exports = app;
