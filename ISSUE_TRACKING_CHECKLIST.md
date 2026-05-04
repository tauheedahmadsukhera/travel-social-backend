# ✅ ISSUE TRACKING & FIX CHECKLIST

**Last Updated**: May 3, 2026  
**Total Issues Found**: 20  
**Critical**: 5 | High: 6 | Medium: 5 | Low: 4  
**Estimated Fix Time**: 8 hours (critical) + 48 hours (all)

---

## 🔴 CRITICAL ISSUES (Must Fix - Do Today!)

### ✅ CRITICAL-1: Hardcoded JWT Secret
- **File**: [backend/routes/auth.js](backend/routes/auth.js#L9)
- **Severity**: 🔴 CRITICAL
- **Status**: NOT STARTED
- **Time Estimate**: 5 minutes
- **Action**: Generate env variable, remove default
- **Verification**: 
  - [ ] .env contains JWT_SECRET
  - [ ] App throws error if JWT_SECRET missing
  - [ ] Login generates valid token

**Implementation**: See CRITICAL_FIXES_ACTION_PLAN.md → ISSUE #1

---

### ✅ CRITICAL-2: Socket.io Lacks Authentication  
- **File**: [backend/socket.js](backend/socket.js#L1-L20)
- **Severity**: 🔴 CRITICAL
- **Status**: NOT STARTED
- **Time Estimate**: 30 minutes
- **Action**: Add JWT verification middleware
- **Verification**:
  - [ ] Socket.io rejects connections without token
  - [ ] Socket.io accepts connections with valid JWT
  - [ ] Users can only join conversations they have access to
  - [ ] CORS uses env variable (not wildcard)

**Implementation**: See CRITICAL_FIXES_ACTION_PLAN.md → ISSUE #2

---

### ✅ CRITICAL-3: Unprotected Mutation Routes
- **Files**: 
  - [backend/routes/posts.js](backend/routes/posts.js#L50)
  - [backend/routes/comments.js](backend/routes/comments.js#L45)
  - [backend/routes/messages.js](backend/routes/messages.js#L60)
  - [backend/routes/stories.js](backend/routes/stories.js#L40)
- **Severity**: 🔴 CRITICAL
- **Status**: NOT STARTED
- **Time Estimate**: 1 hour
- **Action**: Add `verifyToken` middleware to POST/PUT/DELETE
- **Verification**:
  - [ ] POST endpoints return 401 without token
  - [ ] PUT endpoints return 401 without token
  - [ ] DELETE endpoints return 403 if not owner
  - [ ] Valid token allows operations

**Implementation**: See CRITICAL_FIXES_ACTION_PLAN.md → ISSUE #3

---

### ✅ CRITICAL-4: Wildcard CORS on Socket.io
- **File**: [backend/socket.js](backend/socket.js#L6)
- **Severity**: 🔴 CRITICAL (CSRF/XSS vector)
- **Status**: NOT STARTED
- **Time Estimate**: 15 minutes
- **Action**: Replace `origin: '*'` with env-based list
- **Verification**:
  - [ ] Only configured origins can connect
  - [ ] CORS origins come from env variable
  - [ ] Production rejects unconfigured origins

**Implementation**: See CRITICAL_FIXES_ACTION_PLAN.md → ISSUE #4

---

### ✅ CRITICAL-5: Database Not Production Ready
- **File**: [backend/docs/PRODUCTION_CHECKLIST.md](backend/docs/PRODUCTION_CHECKLIST.md)
- **Severity**: 🔴 CRITICAL (Data loss risk)
- **Status**: NOT STARTED
- **Time Estimate**: 1 day
- **Action**: Set up MongoDB Atlas, backups, monitoring
- **Verification**:
  - [ ] MongoDB Atlas cluster created
  - [ ] Automatic backups enabled (daily)
  - [ ] Connection string in production .env
  - [ ] Database health checks passing
  - [ ] PITR (Point-in-Time Recovery) enabled

**Implementation**: Contact DevOps/Infrastructure

---

## 🟡 HIGH PRIORITY ISSUES (Fix This Week)

### HIGH-1: No Refresh Token Mechanism
- **File**: [backend/routes/auth.js](backend/routes/auth.js#L25)
- **Severity**: 🟡 HIGH (UX degradation)
- **Status**: NOT STARTED
- **Time Estimate**: 2 hours
- **Action**: Implement refresh token flow
- **Verification**:
  - [ ] Login returns access + refresh token
  - [ ] Access token valid for 15 minutes
  - [ ] POST /auth/refresh-token works
  - [ ] Expired token triggers refresh automatically
  - [ ] Refresh token hash stored securely

**Next Steps**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → HIGH-1 Implementation

---

### HIGH-2: Inconsistent API Response Format
- **Files**: Multiple route files
- **Severity**: 🟡 HIGH (Breaks client error handling)
- **Status**: NOT STARTED
- **Time Estimate**: 2 hours
- **Action**: Create response wrapper middleware
- **Verification**:
  - [ ] All 200 responses return: `{ success: true, data: ... }`
  - [ ] All error responses return: `{ success: false, error: "msg" }`
  - [ ] Timestamp included in all responses
  - [ ] Frontend error handler works consistently

**Next Steps**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → HIGH-2 Implementation

---

### HIGH-3: NoSQL Injection in Search
- **File**: [backend/routes/users.js](backend/routes/users.js#L23)
- **Severity**: 🟡 HIGH (Data exposure)
- **Status**: NOT STARTED
- **Time Estimate**: 1 hour
- **Action**: Escape regex special chars, add rate limiting
- **Verification**:
  - [ ] Search query escapes special characters
  - [ ] Search rate limited to 30/minute
  - [ ] Query length limited to 50 chars
  - [ ] Regex injection attempts fail

**Implementation**:
```javascript
// Escape user input
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const searchRegex = new RegExp(escapeRegex(q.trim()), 'i');
```

---

### HIGH-4: Missing Input Validation
- **Files**: All route files
- **Severity**: 🟡 HIGH (Security issue)
- **Status**: NOT STARTED
- **Time Estimate**: 4 hours
- **Action**: Add Joi validation schemas
- **Verification**:
  - [ ] Caption limited to 5000 chars
  - [ ] Hashtags validated format
  - [ ] Location has valid lat/lng
  - [ ] Media URLs are valid URIs
  - [ ] Invalid requests return 400

**Implementation**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → HIGH-3 Implementation

---

### HIGH-5: Missing Database Indexes
- **Files**: [backend/models/](backend/models/)
- **Severity**: 🟡 HIGH (Performance)
- **Status**: NOT STARTED
- **Time Estimate**: 1 hour
- **Action**: Add compound indexes
- **Verification**:
  - [ ] User.firebaseUid indexed
  - [ ] Post userId+isPrivate indexed
  - [ ] Comment postId+createdAt indexed
  - [ ] Message conversationId indexed
  - [ ] Query times < 100ms for typical queries

**Implementation**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → Issue #11

---

### HIGH-6: Inconsistent Route Protection
- **Files**: Multiple routes
- **Severity**: 🟡 HIGH (Authorization bypass)
- **Status**: NOT STARTED
- **Time Estimate**: 1 hour
- **Action**: Audit all routes, apply verifyToken
- **Verification**:
  - [ ] GET endpoints: public or optional auth
  - [ ] POST endpoints: required auth
  - [ ] PUT endpoints: required auth
  - [ ] DELETE endpoints: required auth + ownership check

**Implementation**: See CRITICAL_FIXES_ACTION_PLAN.md → ISSUE #3

---

## 🟠 MEDIUM PRIORITY ISSUES (Next Sprint)

### MEDIUM-1: Denormalized Counts Out of Sync
- **Files**: [backend/models/User.js](backend/models/User.js), [backend/models/Post.js](backend/models/Post.js)
- **Severity**: 🟠 MEDIUM (Data integrity)
- **Status**: NOT STARTED
- **Time Estimate**: 2 hours
- **Action**: Use transactions or calculate on-demand
- **Verification**:
  - [ ] Follow count matches actual follows
  - [ ] Like count matches likes array
  - [ ] Counts update atomically

**Implementation**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → Issue #8

---

### MEDIUM-2: Dual ID System Fragility
- **Files**: [backend/models/User.js](backend/models/User.js)
- **Severity**: 🟠 MEDIUM (Data duplication risk)
- **Status**: NOT STARTED
- **Time Estimate**: 4 hours
- **Action**: Create UserMapping collection
- **Verification**:
  - [ ] User._id is primary key
  - [ ] firebaseUid mapped separately
  - [ ] No duplicate users created
  - [ ] ID lookup works efficiently

**Implementation**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → Issue #9

---

### MEDIUM-3: N+1 Comment Queries
- **File**: [backend/routes/comments.js](backend/routes/comments.js#L60-L80)
- **Severity**: 🟠 MEDIUM (Performance)
- **Status**: NOT STARTED
- **Time Estimate**: 1 hour
- **Action**: Batch fetch users
- **Verification**:
  - [ ] Single query to get all users
  - [ ] Response time for 100 comments < 100ms
  - [ ] User data properly mapped

**Implementation**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → N+1 Issue #12

---

### MEDIUM-4: No Global Error Boundaries (Frontend)
- **File**: [client/app/](client/app/)
- **Severity**: 🟠 MEDIUM (Crash handling)
- **Status**: NOT STARTED
- **Time Estimate**: 2 hours
- **Action**: Add React Error Boundary
- **Verification**:
  - [ ] Component errors caught
  - [ ] UI shows error message instead of crash
  - [ ] Sentry error logged
  - [ ] Retry button works

**Implementation**: See COMPREHENSIVE_TECHNICAL_AUDIT.md → Issue #15

---

### MEDIUM-5: No Request Timeout (Frontend)
- **File**: [client/src/_services/apiService.ts](client/src/_services/apiService.ts)
- **Severity**: 🟠 MEDIUM (Battery/data drain)
- **Status**: NOT STARTED
- **Time Estimate**: 30 minutes
- **Action**: Add 30-second timeout to axios
- **Verification**:
  - [ ] Requests timeout after 30 seconds
  - [ ] Error message shows timeout
  - [ ] No hanging requests

**Implementation**: 
```typescript
const api = axios.create({
  timeout: 30000, // 30 seconds
  baseURL: API_BASE_URL
});
```

---

## 🔵 LOW PRIORITY ISSUES (Tech Debt)

### LOW-1: No Automated Tests
- **Severity**: 🔵 LOW (But important for scale)
- **Status**: NOT STARTED
- **Time Estimate**: 3 days
- **Priority**: After critical fixes
- **Target**: 60%+ coverage

### LOW-2: No Docker Containerization
- **Severity**: 🔵 LOW (But needed for CI/CD)
- **Status**: NOT STARTED
- **Time Estimate**: 3 hours

### LOW-3: No Structured Logging (Winston/Pino)
- **Severity**: 🔵 LOW (DevOps nice-to-have)
- **Status**: NOT STARTED
- **Time Estimate**: 2 hours

### LOW-4: Code Duplication
- **Severity**: 🔵 LOW (Refactoring)
- **Status**: NOT STARTED
- **Time Estimate**: 2 hours
- **Details**: Extract user fetch, participant resolution

---

## 📊 PROGRESS TRACKING

### Phase 1: Emergency Fixes (Today - 8 hours)

```
[ ] CRITICAL-1: JWT Secret                    0/5 min
[ ] CRITICAL-2: Socket Auth                   0/30 min
[ ] CRITICAL-3: Route Protection              0/60 min
[ ] CRITICAL-4: CORS Localhost                0/5 min
[ ] CRITICAL-5: Database Setup                0/480 min
[ ] Deploy to Staging & Test                  0/60 min

TOTAL: 0/640 minutes = 0/10.7 hours
```

### Phase 2: High Priority (Week 1 - 16 hours)

```
[ ] HIGH-1: Refresh Tokens                    0/120 min
[ ] HIGH-2: Response Format                   0/120 min
[ ] HIGH-3: NoSQL Injection Fix               0/60 min
[ ] HIGH-4: Input Validation                  0/240 min
[ ] HIGH-5: Database Indexes                  0/60 min
[ ] HIGH-6: Route Protection Audit            0/60 min
[ ] Security Testing                          0/120 min
[ ] Deploy & Validate                         0/120 min

TOTAL: 0/880 minutes = 0/14.7 hours
```

### Phase 3: Medium Priority (Week 2-3 - 24 hours)

```
[ ] MEDIUM-1: Denormalized Counts             0/120 min
[ ] MEDIUM-2: ID System                       0/240 min
[ ] MEDIUM-3: N+1 Queries                     0/60 min
[ ] MEDIUM-4: Error Boundaries                0/120 min
[ ] MEDIUM-5: Request Timeout                 0/30 min
[ ] Implement Tests                           0/480 min
[ ] CI/CD Setup                               0/120 min
[ ] Performance Testing                       0/240 min

TOTAL: 0/1390 minutes = 0/23.2 hours
```

---

## 🚀 QUICK START TEMPLATE

### For Backend Engineer

```bash
# 1. Clone and setup
git clone <repo>
cd backend
npm install

# 2. Generate secrets
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "JWT_SECRET=$JWT_SECRET" >> .env
echo "REFRESH_SECRET=$REFRESH_SECRET" >> .env

# 3. Start work on CRITICAL-1
# Edit backend/routes/auth.js - Apply fix from CRITICAL_FIXES_ACTION_PLAN.md

# 4. Test
npm start
# Check: App requires JWT_SECRET - should NOT show fallback

# 5. Move to CRITICAL-2
# Edit backend/socket.js - Add authentication middleware

# 6. Deploy and test
npm run deploy:staging
npm run test:auth

# 7. Verify in staging
curl -X POST http://staging.api/posts -d '{}' 
# Should return 401 Unauthorized
```

### For Frontend Engineer

```bash
# 1. Clone and setup
git clone <repo>
cd client
npm install

# 2. Start with MEDIUM-4 (Error Boundaries)
# Create components/ErrorBoundary.tsx
# See COMPREHENSIVE_TECHNICAL_AUDIT.md for implementation

# 3. Add MEDIUM-5 (Request Timeout)
# Update src/_services/apiService.ts
# Add timeout: 30000 to axios config

# 4. Test
npm run start
# Trigger an error - should show error UI (not crash)

# 5. Start MEDIUM-1 Frontend State
# Create store/userStore.ts using Zustand
# Migrate from Context
```

---

## 📞 GETTING HELP

If stuck on:
- **JWT/Auth issues**: See CRITICAL_FIXES_ACTION_PLAN.md or [JWT.io debugger](https://jwt.io)
- **Socket.io**: See Socket.io docs + CRITICAL_FIXES_ACTION_PLAN.md
- **Database issues**: See COMPREHENSIVE_TECHNICAL_AUDIT.md Database section
- **Validation**: See Joi docs + schema examples in CRITICAL_FIXES_ACTION_PLAN.md

---

## 📋 SIGN-OFF CHECKLIST

When all issues are fixed:

- [ ] All CRITICAL fixes deployed and tested
- [ ] All HIGH fixes deployed and tested  
- [ ] Security audit passed (score 8+/10)
- [ ] Test coverage 60%+
- [ ] Load test: 10K concurrent users
- [ ] Staging environment stable 48+ hours
- [ ] Incident response plan documented
- [ ] Team trained on deployment process
- [ ] Monitoring/alerting active
- [ ] Ready for production launch ✅

---

**Status as of May 3, 2026**: 0% Complete | 0/20 Issues Fixed

**Target Completion**: 
- Critical: May 3 (Today)
- High: May 10 (End of Week)
- Medium: May 24 (End of Sprint)
- **Production Launch**: May 31