# TRAVE SOCIAL - CRITICAL ISSUES ACTION PLAN

**Generated**: May 3, 2026  
**Priority**: 🔴 IMMEDIATE - Must complete within 24-48 hours

---

## 🚨 CRITICAL: EXPOSED CREDENTIALS IN REPOSITORY

### What's Exposed:
- ✗ MongoDB credentials (username: martin, password visible)
- ✗ Cloudinary API keys
- ✗ Firebase project credentials
- ✗ JWT secrets
- ✗ Firebase service account key file

### Risk Level: 🔴 **CRITICAL**
**Attacker Impact**: Full database access, media access, API access

---

## IMMEDIATE ACTION CHECKLIST (24 Hours)

### Step 1: Secure the Repository
```bash
# Remove sensitive files from Git history
cd c:\Users\Tauheed\Desktop\final

# Remove .env file
git filter-branch --tree-filter 'rm -f backend/.env' HEAD
git filter-branch --tree-filter 'rm -f backend/serviceAccountKey.json' HEAD

# Force push to remove from history
git push origin --force --all
git push origin --force --all --tags

# Verify it's gone
git log --all --full-history -- backend/.env
# Should return: No commits found
```

### Step 2: Rotate All Credentials (IMMEDIATELY)
```
☐ MongoDB:
  1. Go to MongoDB Atlas console
  2. Database Access → username "martin"
  3. Edit → Regenerate Password
  4. Copy new password
  5. Update connection string: 
     mongodb+srv://martin:NEW_PASSWORD@cluster0.st1rogr.mongodb.net/travesocial

☐ Cloudinary:
  1. Go to https://cloudinary.com/console
  2. Account → Security
  3. Regenerate API Key (533344539459478)
  4. Regenerate API Secret
  5. Verify uploads still work

☐ Firebase:
  1. Go to Firebase Console
  2. Project Settings → Service Accounts
  3. Delete old key
  4. Generate new key
  5. Download JSON

☐ JWT Secret:
  1. Generate new random secret:
     openssl rand -base64 32
  2. Use output as new JWT_SECRET
```

### Step 3: Set Up Secret Manager (Render.com)

**In Render Dashboard**:
```
1. Go to Service Settings
2. Environment Variables section
3. Add each secret:
   - MONGO_URI = <new-connection-string>
   - JWT_SECRET = <new-secret>
   - CLOUDINARY_API_KEY = <new-key>
   - CLOUDINARY_API_SECRET = <new-secret>
   - CLOUDINARY_CLOUD_NAME = dinwxxnzm (public, OK)
   - FIREBASE_PROJECT_ID = <id>
   - GCLOUD_STORAGE_BUCKET = <bucket>
   - NODE_ENV = production
   - PORT = 5000
4. Trigger redeployment
```

### Step 4: Update .env.example (No Secrets!)
```bash
# backend/.env.example
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/travesocial
JWT_SECRET=your-256-bit-random-secret-here
CLOUDINARY_CLOUD_NAME=dinwxxnzm
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
FIREBASE_PROJECT_ID=your-project-id
NODE_ENV=development
PORT=5000
```

### Step 5: Update .gitignore (Verify)
```bash
# Ensure this is in backend/.gitignore:
.env
.env.local
.env.production
.env.development
.env.*.local
serviceAccountKey.json
serviceAccount*.json
*.pem
*.key
*.p12
*.p8
```

### Step 6: Verify Credential Rotation Worked
```bash
# Backend should still work with new credentials:
cd backend
npm start

# Test API:
curl http://localhost:5000/api/health

# Check logs for connection success:
# Should see: "✅ MongoDB Connected Successfully"
```

---

## 📋 TOP 10 CRITICAL ISSUES

### 1. 🔴 Exposed Credentials (DONE?)
- **Status**: Needs verification
- **Deadline**: NOW
- **Time**: 30-45 minutes
- **Severity**: CRITICAL

### 2. 🔴 No Input Validation
- **Status**: Not started
- **Deadline**: Within 7 days
- **Time**: 8-12 hours
- **Severity**: HIGH

**Quick Fix**:
```bash
npm install express-validator
```

```javascript
// backend/src/middleware/validation.js
const { body, validationResult } = require('express-validator');

exports.validatePost = [
  body('content').trim().isLength({ min: 1, max: 5000 }),
  body('location').optional().trim(),
  body('mediaUrls').optional().isArray(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];
```

### 3. 🔴 Missing Database Indexes (HIGH IMPACT ON PERFORMANCE)
- **Status**: Not started
- **Deadline**: Within 14 days
- **Time**: 2-4 hours
- **Severity**: HIGH

**Add to models**:
```javascript
// backend/models/Group.js
GroupSchema.index({ userId: 1, type: 1 });
GroupSchema.index({ members: 1 });

// backend/models/LiveStream.js
LiveStreamSchema.index({ isActive: 1, createdAt: -1 });
LiveStreamSchema.index({ userId: 1, createdAt: -1 });

// backend/models/AdminLog.js
AdminLogSchema.index({ adminId: 1, createdAt: -1 });
AdminLogSchema.index({ action: 1, createdAt: -1 });

// backend/models/Report.js
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ reporterId: 1, createdAt: -1 });
```

### 4. 🔴 No Global Error Handler
- **Status**: Not started
- **Deadline**: Within 7 days
- **Time**: 2-3 hours
- **Severity**: HIGH

**Add to backend/src/middleware/errorHandler.js**:
```javascript
module.exports = (err, req, res, next) => {
  const logger = require('../utils/logger');
  logger.error(err);
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
};
```

Add to `backend/src/index.js`:
```javascript
app.use(require('./middleware/errorHandler'));
```

### 5. 🟠 ReDoS Vulnerability in User Search
- **Status**: Not started
- **Deadline**: Within 7 days
- **Time**: 1 hour
- **Severity**: HIGH

**Fix in backend/routes/users.js**:
```javascript
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  
  if (!q || q.trim().length === 0) {
    return res.json({ success: true, data: [] });
  }
  
  // FIXED: Escape regex special characters
  const searchRegex = new RegExp(escapeRegex(q.trim()), 'i');
  
  const users = await User.find({
    $or: [
      { displayName: searchRegex },
      { email: searchRegex },
      { bio: searchRegex }
    ]
  })
  .limit(parseInt(limit) || 20)
  .lean();
  
  res.json({ success: true, data: users });
});
```

### 6. 🟠 No Rate Limiting on Auth Endpoints
- **Status**: Not started
- **Deadline**: Within 7 days
- **Time**: 1 hour
- **Severity**: HIGH

**Add to backend/src/index.js**:
```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes per email
  keyGenerator: (req) => req.body.email || req.ip,
  message: { success: false, error: 'Too many login attempts' }
});

app.post('/api/auth/login*', loginLimiter);
app.post('/api/auth/register*', loginLimiter);
```

### 7. 🟠 No Test Framework Setup
- **Status**: Not started
- **Deadline**: Within 30 days
- **Time**: 8-16 hours
- **Severity**: MEDIUM

```bash
npm install --save-dev jest supertest
```

**Create backend/tests/auth.test.js**:
```javascript
const request = require('supertest');
const app = require('../src/index');

describe('Authentication', () => {
  test('POST /api/auth/register-firebase creates user', async () => {
    const res = await request(app)
      .post('/api/auth/register-firebase')
      .send({
        firebaseUid: 'test-uid',
        email: 'test@example.com'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

### 8. 🟠 No CSRF Protection
- **Status**: Not started
- **Deadline**: Within 14 days
- **Time**: 3-4 hours
- **Severity**: HIGH (if web UI exists)

Note: React Native apps don't need CSRF as they don't use cookies

### 9. 🟡 No 2FA Support
- **Status**: Not started
- **Deadline**: Within 60 days
- **Time**: 12-16 hours
- **Severity**: MEDIUM

### 10. 🟡 No Monitoring/Alerting
- **Status**: Not started
- **Deadline**: Within 30 days
- **Time**: 4-6 hours
- **Severity**: MEDIUM

---

## 📊 QUICK WINS (Can Fix Today)

### ✅ Remove Exposed Credentials from Git
**Time**: 30 min
**Impact**: HIGH
**Steps**: See "Immediate Action Checklist" above

### ✅ Fix ReDoS in User Search
**Time**: 15 min
**Impact**: MEDIUM
**Steps**: See Issue #5 above

### ✅ Add Basic Input Validation
**Time**: 2 hours
**Impact**: MEDIUM
**Steps**: See Issue #2 above

### ✅ Add Error Handler Middleware
**Time**: 1 hour
**Impact**: MEDIUM
**Steps**: See Issue #4 above

### ✅ Add Auth Rate Limiting
**Time**: 30 min
**Impact**: LOW
**Steps**: See Issue #6 above

---

## 🗓️ 30-DAY REMEDIATION PLAN

### Week 1: Security Hardening
- [ ] Day 1-2: Rotate credentials (2-3 hours)
- [ ] Day 2-3: Input validation on all routes (8 hours)
- [ ] Day 3-4: Add error handler (2 hours)
- [ ] Day 4-5: Add auth rate limiting (1 hour)
- [ ] Day 5-7: Set up secret manager on Render (2 hours)

### Week 2: Database Optimization
- [ ] Add missing database indexes (2-4 hours)
- [ ] Test query performance (2 hours)
- [ ] Set up MongoDB monitoring (1 hour)

### Week 3: Testing Setup
- [ ] Set up Jest framework (2 hours)
- [ ] Write 10 authentication tests (4 hours)
- [ ] Write 5 API route tests (3 hours)
- [ ] Set up CI/CD pipeline with tests (3 hours)

### Week 4: Monitoring & Deployment
- [ ] Set up Sentry error tracking (2 hours)
- [ ] Set up logging aggregation (2 hours)
- [ ] Create deployment checklist (1 hour)
- [ ] Perform security audit (2 hours)

---

## 📞 ESCALATION CONTACTS

**If MongoDB is Compromised**:
1. Contact MongoDB Atlas support immediately
2. Check access logs at: https://cloud.mongodb.com
3. Change database user password
4. Create new database user for application
5. Enable IP whitelist

**If Cloudinary is Compromised**:
1. Go to https://cloudinary.com/console
2. Check "Usage" for unauthorized uploads
3. Regenerate API keys
4. Delete any unauthorized content

**If Firebase is Compromised**:
1. Go to Firebase Console
2. Check "Audit Logs" for suspicious activity
3. Delete compromised service account key
4. Create new service account key

---

## ✅ VERIFICATION CHECKLIST

After completing remediation, verify:

- [ ] New MongoDB password working
- [ ] New Cloudinary keys working
- [ ] New Firebase keys working
- [ ] New JWT secret working
- [ ] `.env` file removed from Git
- [ ] `.env.example` contains no secrets
- [ ] Input validation working on test API call
- [ ] Error handler returns proper JSON
- [ ] Auth rate limiting blocks after 5 attempts
- [ ] Database indexes created and verified
- [ ] No errors in deployment logs
- [ ] API responding normally at: 
  - https://trave-social-backend.onrender.com/api/health

---

## 📧 RECOMMENDED NEXT STEPS

1. **Today**: Complete credential rotation
2. **This Week**: Deploy input validation and error handling
3. **Next Week**: Add database indexes and monitoring
4. **Next 30 Days**: Complete test suite and CI/CD
5. **Next 60 Days**: Security hardening and compliance audit

---

**Status**: 🔴 Action Required  
**Last Updated**: May 3, 2026  
**Owner**: Security Team

