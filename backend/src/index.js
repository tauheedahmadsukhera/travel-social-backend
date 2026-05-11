require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const path = require('path');
const { initSentry, setupSentryErrorHandler } = require('./utils/sentry');
const { validateEnv } = require('./config/validateEnv');
const compression = require('compression');

// ====== VALIDATE ENVIRONMENT VARIABLES ON STARTUP ======
// This will throw and crash the process if critical vars are missing.
try {
  validateEnv();
} catch (err) {
  console.error('🔴 FATAL: Environment validation failed:', err.message);
  process.exit(1);
}

// ====== AUTO-REQUIRE ALL MODELS ======
require('./models/User');
require('./models/Post');
require('./models/Category');
require('./models/LiveStream');
require('./models/Conversation');
require('./models/Message');
require('./models/Passport');
require('./models/Follow');
require('./models/Comment');
require('./models/Story');
require('./models/Highlight');
require('./models/Section');
require('./models/Notification');
require('./models/Group');
require('./models/Report');
require('./models/Block');
require('./models/AdminLog');
require('./models/Region');

const app = express();
const PORT = process.env.PORT || 5000;

// ============= RATE LIMITING =============
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ============= SENTRY INITIALIZATION =============
// Must be called before any other middleware
initSentry(app);

// ============= FIREBASE INITIALIZATION =============
try {
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
  const serviceAccount = require(serviceAccountPath);
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
  }
  
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization warning:', error.message);
}

// ============= MIDDLEWARE =============
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  console.error('❌ CRITICAL: ALLOWED_ORIGINS not configured for production');
  process.exit(1);
}
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'userid', 'x-requested-with'],
  credentials: true
};
app.use(compression());
app.use(cors(corsOptions));
app.get('/api/ping', (req, res) => res.json({ success: true, message: 'pong', timestamp: new Date() }));
// Request Logger for debugging mobile connections
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔍 [DEBUG] Incoming: ${req.method} ${req.originalUrl || req.url}`);
  }
  next();
});
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for easier dev testing
app.use(mongoSanitize());
app.use(hpp());
// Reduced from 50mb to 5mb to prevent DDoS payload attacks
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/assests', express.static(path.join(__dirname, '../assests')));
app.use('/stamps', express.static(path.join(__dirname, '../stamps')));

// ============= DATABASE CONNECTION =============
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('🔴 FATAL: MONGO_URI environment variable is not set!');
  process.exit(1);
}
mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 10000, // Fail fast if DB unreachable
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('🔴 FATAL: MongoDB connection failed:', err.message);
    process.exit(1); // Do NOT start serving requests with no DB
  });

// ============= ROUTES =============
const routes = require('./routes');
app.use('/api', routes);

// ============= SENTRY ERROR HANDLER =============
// Must be registered after all controllers and before other error middleware
setupSentryErrorHandler(app);

app.get('/', (req, res) => {
  res.json({ message: 'Trips API is running', version: '1.1.0' });
});

const initSockets = require('./loaders/socket');

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Local Access: http://localhost:${PORT}`);
});

// Initialize Socket.IO
const JWT_SECRET = process.env.JWT_SECRET;
initSockets(server, JWT_SECRET);

module.exports = server;