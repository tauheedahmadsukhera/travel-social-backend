# TRAVE SOCIAL - FIX IMPLEMENTATION GUIDE

**Purpose**: Step-by-step instructions to fix identified issues  
**Target Timeline**: 30 days  
**Owner**: DevOps/Security Team

---

## 🔧 FIX #1: Input Validation (All Endpoints)

### Current State
```javascript
// ❌ BAD - No validation
router.post('/posts', async (req, res) => {
  const { content, location } = req.body;
  // Directly use user input without validation
});
```

### Implementation (2-3 hours)

#### Step 1: Install validator
```bash
cd backend
npm install express-validator
```

#### Step 2: Create validation middleware
```javascript
// backend/src/middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');

exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => ({
        field: e.param,
        message: e.msg
      }))
    });
  }
  next();
};

// Post creation validation
exports.validatePostCreation = [
  body('content')
    .trim()
    .notEmpty().withMessage('Content is required')
    .isLength({ min: 1, max: 5000 }).withMessage('Content must be 1-5000 characters'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Location must be less than 200 characters'),
  body('mediaUrls')
    .optional()
    .isArray().withMessage('MediaUrls must be an array')
    .custom(arr => arr.length <= 10).withMessage('Maximum 10 media items'),
  body('category')
    .optional()
    .isIn(['travel', 'food', 'nature', 'urban', 'other']).withMessage('Invalid category'),
  body('hashtags')
    .optional()
    .isArray().withMessage('Hashtags must be an array'),
  exports.handleValidationErrors
];

// User search validation
exports.validateUserSearch = [
  query('q')
    .trim()
    .notEmpty().withMessage('Search query required')
    .isLength({ min: 1, max: 100 }).withMessage('Query must be 1-100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  exports.handleValidationErrors
];

// Comment creation validation
exports.validateCommentCreation = [
  body('text')
    .trim()
    .notEmpty().withMessage('Comment text required')
    .isLength({ min: 1, max: 1000 }).withMessage('Comment must be 1-1000 characters'),
  exports.handleValidationErrors
];

// Message validation
exports.validateMessageCreation = [
  body('text')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('Message must be less than 5000 characters'),
  body('mediaUrl')
    .optional()
    .isURL().withMessage('Invalid media URL'),
  exports.handleValidationErrors
];
```

#### Step 3: Apply validation to routes
```javascript
// backend/routes/posts.js
const { validatePostCreation } = require('../src/middleware/validation');

router.post('/', validatePostCreation, async (req, res) => {
  try {
    // req.body is now validated
    const { content, location, mediaUrls, category } = req.body;
    // Create post...
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

#### Step 4: Apply to all routes
```javascript
// backend/routes/comments.js
const { validateCommentCreation } = require('../src/middleware/validation');
router.post('/posts/:postId/comments', validateCommentCreation, async (req, res) => { ... });

// backend/routes/messages.js
const { validateMessageCreation } = require('../src/middleware/validation');
router.post('/conversations/:convId/messages', validateMessageCreation, async (req, res) => { ... });

// backend/routes/users.js
const { validateUserSearch } = require('../src/middleware/validation');
router.get('/search', validateUserSearch, async (req, res) => { ... });
```

---

## 🔧 FIX #2: Global Error Handler (1-2 hours)

### Current State
```javascript
// ❌ BAD - Error handling duplicated in every route
router.get('/endpoint', async (req, res) => {
  try {
    // ...
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

### Implementation

#### Step 1: Create error handler middleware
```javascript
// backend/src/middleware/errorHandler.js
const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = {
  AppError,
  
  // Error handling middleware
  errorHandler: (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Log error
    logger.error({
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      statusCode
    });
    
    // Send response
    res.status(statusCode).json({
      success: false,
      error: isProduction 
        ? 'Internal server error' 
        : err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  },
  
  // Async handler wrapper
  asyncHandler: (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  }
};
```

#### Step 2: Add to main app
```javascript
// backend/src/index.js
const { errorHandler, asyncHandler } = require('./middleware/errorHandler');

// ... all routes ...

// Add error handler LAST
app.use(errorHandler);
```

#### Step 3: Use in routes
```javascript
// backend/routes/posts.js
const { asyncHandler, AppError } = require('../src/middleware/errorHandler');

router.get('/:postId', asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.postId);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  res.json({ success: true, data: post });
}));
```

---

## 🔧 FIX #3: Database Indexes (2-4 hours)

### Current State
```javascript
// ❌ SLOW - Multiple collections missing indexes
Group.find({ userId, type })      // No index - full scan
AdminLog.find({ action })         // No index - full scan
LiveStream.find({ isActive: true }) // No index - full scan
```

### Implementation

#### Step 1: Add missing indexes to models
```javascript
// backend/models/Group.js
groupSchema.index({ userId: 1, type: 1 }); // For finding groups by owner and type
groupSchema.index({ members: 1 });         // For finding groups by member

// backend/models/LiveStream.js
liveStreamSchema.index({ isActive: 1, createdAt: -1 });
liveStreamSchema.index({ userId: 1, createdAt: -1 });

// backend/models/AdminLog.js
adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ status: 1, createdAt: -1 });

// backend/models/Report.js
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ targetId: 1, targetType: 1 });

// backend/models/Block.js
blockSchema.index({ blockerId: 1 });
blockSchema.index({ blockedUserId: 1 });
blockSchema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });

// backend/models/User.js - Add text search index
userSchema.index({ displayName: 'text', email: 'text', bio: 'text' });

// backend/models/Section.js (if exists)
sectionSchema.index({ userId: 1 });
sectionSchema.index({ userId: 1, createdAt: -1 });
```

#### Step 2: Verify indexes exist
```bash
# Connect to MongoDB
mongo

# List indexes
db.groups.getIndexes()
db.livestreams.getIndexes()
db.adminlogs.getIndexes()
```

#### Step 3: Optimize queries to use indexes
```javascript
// BEFORE: No index used
await Group.find({ userId: id })

// AFTER: Use compound index
await Group.find({ userId: id, type: 'friends' })
  .select('_id name members')
  .lean()
```

#### Step 4: Monitor index usage
```javascript
// Add monitoring script
// backend/tools/indexMonitoring.js
const mongoose = require('mongoose');

async function checkIndexUsage() {
  const db = mongoose.connection.db;
  
  const collections = ['groups', 'livestreams', 'adminlogs', 'reports'];
  
  for (const coll of collections) {
    const stats = await db.collection(coll).aggregate([
      { $indexStats: {} }
    ]).toArray();
    
    console.log(`\n${coll}:`);
    stats.forEach(index => {
      console.log(`  ${index.name}: ${index.accesses.ops} operations`);
    });
  }
}

checkIndexUsage();
```

---

## 🔧 FIX #4: Fix ReDoS Vulnerability (30 minutes)

### Current State
```javascript
// ❌ VULNERABLE - Direct RegExp with user input
const searchRegex = new RegExp(q.trim(), 'i');
// Attack: q = "(a+)+b" could cause DoS
```

### Implementation

#### Step 1: Create escape utility
```javascript
// backend/src/utils/regexUtils.js
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
```

#### Step 2: Update user search route
```javascript
// backend/routes/users.js
const { escapeRegex } = require('../src/utils/regexUtils');

router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    // FIXED: Escape special regex characters
    const searchRegex = new RegExp(escapeRegex(q.trim()), 'i');
    
    const users = await User.find({
      $or: [
        { displayName: searchRegex },
        { email: searchRegex },
        { bio: searchRegex }
      ]
    })
    .limit(parseInt(limit) || 20)
    .select('_id firebaseUid displayName avatar bio followers following')
    .lean();
    
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

---

## 🔧 FIX #5: Auth Rate Limiting (30 minutes)

### Current State
```javascript
// ❌ BAD - No rate limiting on login
router.post('/login', async (req, res) => {
  // Can brute force passwords
});
```

### Implementation

#### Step 1: Add auth limiters
```javascript
// backend/src/index.js
const rateLimit = require('express-rate-limit');

// Rate limit login attempts per email
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  keyGenerator: (req) => req.body.email || req.ip,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
  skip: (req) => req.method !== 'POST'
});

// Rate limit registration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'Too many registrations. Try again later.' }
});

// Password reset rate limit
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 resets per hour
  keyGenerator: (req) => req.body.email || req.ip,
  message: { success: false, error: 'Too many password reset requests.' }
});

// Apply limiters
app.post('/api/auth/login*', loginLimiter);
app.post('/api/auth/register*', registerLimiter);
app.post('/api/auth/password-reset', passwordResetLimiter);
```

---

## 🔧 FIX #6: Secrets Management Setup (1-2 hours)

### Current State
```
.env file exposed in Git with all secrets ❌
```

### Implementation (for Render.com)

#### Step 1: Generate new secrets
```bash
# Generate new JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output: a3f2b1c9d8e7f6g5h4i3j2k1l0m9n8o7p6q5r4s3t2u1v0w9x8y7z

# Generate other secrets similarly
```

#### Step 2: In Render Dashboard

```
1. Go to Service → Environment
2. Add these variables:
   
   MONGO_URI=mongodb+srv://NEW_USERNAME:NEW_PASSWORD@cluster0.st1rogr.mongodb.net/travesocial?retryWrites=true&w=majority
   JWT_SECRET=a3f2b1c9d8e7f6g5h4i3j2k1l0m9n8o7p6q5r4s3t2u1v0w9x8y7z
   CLOUDINARY_API_KEY=<new-key>
   CLOUDINARY_API_SECRET=<new-secret>
   CLOUDINARY_CLOUD_NAME=dinwxxnzm
   FIREBASE_PROJECT_ID=travel-app-3da72
   GCLOUD_STORAGE_BUCKET=travel-app-3da72.firebasestorage.app
   NODE_ENV=production
   PORT=5000

3. Click "Deploy" to restart with new variables
```

#### Step 3: Verify in code
```javascript
// backend/src/config/validateEnv.js
function requireVar(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function validateEnv() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  
  // Required in all environments
  const required = ['MONGO_URI', 'JWT_SECRET'];
  required.forEach(requireVar);
  
  if (env === 'production') {
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY'].forEach(requireVar);
  }
  
  console.log('✅ Environment variables validated');
}

module.exports = { validateEnv };
```

---

## 🔧 FIX #7: Test Framework Setup (3-4 hours)

### Current State
```
40 test files with no framework ❌
```

### Implementation

#### Step 1: Install Jest
```bash
cd backend
npm install --save-dev jest supertest @types/jest
```

#### Step 2: Configure Jest
```javascript
// backend/jest.config.js
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: './coverage',
  collectCoverageFrom: [
    'routes/**/*.js',
    'models/**/*.js',
    'src/**/*.js',
    '!src/index.js',
    '!**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
```

#### Step 3: Create test setup
```javascript
// backend/jest.setup.js
jest.setTimeout(10000);

// Mock environment
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost/travesocial-test';
process.env.JWT_SECRET = 'test-secret-key';
```

#### Step 4: Write first test
```javascript
// backend/__tests__/routes/auth.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/index');

describe('Authentication Routes', () => {
  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/auth/register-firebase', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register-firebase')
        .send({
          firebaseUid: 'test-uid-123',
          email: 'test@example.com',
          displayName: 'Test User'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.token).toBeDefined();
    });

    it('should fail without firebaseUid', async () => {
      const res = await request(app)
        .post('/api/auth/register-firebase')
        .send({
          email: 'test@example.com'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
```

#### Step 5: Add test script
```json
// backend/package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

#### Step 6: Run tests
```bash
npm test
npm run test:coverage
```

---

## 🔧 FIX #8: Setup Monitoring (2-3 hours)

### Implementation with Sentry

#### Step 1: Install Sentry
```bash
npm install @sentry/node @sentry/tracing
npm install sentry-expo  # For frontend
```

#### Step 2: Setup backend
```javascript
// backend/src/index.js
const Sentry = require("@sentry/node");
const * as Tracing from "@sentry/tracing";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Express({ app: true, request: true })
  ]
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// ... routes ...

app.use(Sentry.Handlers.errorHandler());
```

#### Step 3: Setup frontend
```typescript
// client/lib/sentry.ts
import * as Sentry from 'sentry-expo';

export function initSentry() {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    enableInExpoDevelopment: true,
    tracesSampleRate: 1.0,
  });
}
```

---

## ✅ VERIFICATION CHECKLIST

After implementing fixes, verify:

### Security
- [ ] Input validation middleware applied to all routes
- [ ] Error handler catches all exceptions
- [ ] No sensitive info in error messages (production)
- [ ] ReDoS vulnerability fixed in user search
- [ ] Rate limiting blocks after threshold

### Database
- [ ] All indexes created
- [ ] Queries use indexes (verify in MongoDB logs)
- [ ] No N+1 queries remain

### Testing
- [ ] Jest running successfully
- [ ] Can run: `npm test`
- [ ] Can generate coverage: `npm run test:coverage`
- [ ] Coverage > 60%

### Monitoring
- [ ] Sentry DSN configured
- [ ] Error events appear in Sentry dashboard
- [ ] Can see performance traces

---

## 📊 IMPLEMENTATION TIMELINE

```
Day 1-2:     Input Validation          (2-3 hours)
Day 3:       Error Handler             (1-2 hours)
Day 4:       Database Indexes          (2-4 hours)
Day 5:       ReDoS + Rate Limiting     (1 hour)
Day 6-7:     Secrets Management        (1-2 hours)
Day 8-10:    Test Framework Setup      (3-4 hours)
Day 11-14:   Monitoring Setup          (2-3 hours)
Day 15:      Verification & Testing    (2-3 hours)

Total:       18-26 hours
```

---

**Status**: 🔴 Ready to implement  
**Next Step**: Start with FIX #1 (Input Validation)

