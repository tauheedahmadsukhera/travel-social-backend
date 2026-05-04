# 🧪 COMPREHENSIVE QA & TESTING CHECKLIST
**20+ Years QA Testing Protocol**

---

## SECTION 1: SECURITY TESTING (Priority 1)

### Authentication & Authorization Testing

#### Test 1.1: Unauthorized Access Attempt
**Test Steps**:
1. Try to POST /api/posts without Authorization header
2. Try to PUT /api/posts/123 without Authorization header
3. Try to DELETE /api/posts/123 without Authorization header

**Expected**: All return 401 Unauthorized  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL / ⏳ NOT TESTED

---

#### Test 1.2: Invalid Token Rejection
**Test Steps**:
1. Send request with Authorization: Bearer invalid_token_xyz
2. Send request with Authorization: Bearer (token with wrong secret)
3. Send request with expired token

**Expected**: All return 401 Unauthorized  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL / ⏳ NOT TESTED

---

#### Test 1.3: Ownership Authorization
**Test Steps**:
1. User A logs in and gets token A
2. User B logs in and gets token B
3. User A creates post (post ID = 123)
4. User B tries to DELETE /api/posts/123 with token B

**Expected**: 403 Forbidden  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL / ⏳ NOT TESTED

---

#### Test 1.4: WebSocket Authentication
**Test Steps**:
1. Try to connect to WebSocket without token
2. Connect with invalid token
3. Connect with valid token for User A
4. Try to join conversation that User A is not part of

**Expected**: 
- Step 1-2: Connection rejected
- Step 3-4: Connection fails or access denied

**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL / ⏳ NOT TESTED

---

### Injection Attack Testing

#### Test 2.1: NoSQL Injection in Search
**Test Steps**:
```
GET /api/users/search?q=.*
Expected: Search for literal ".*", not regex
Actual: ?

GET /api/users/search?q=^admin
Expected: No results or error
Actual: ?

GET /api/users/search?q={$ne:""}
Expected: Error or empty
Actual: ?
```

**Status**: ✓ SAFE / ✗ VULNERABLE

---

#### Test 2.2: NoSQL Injection in Post Creation
**Test Steps**:
```
POST /api/posts
{
  "content": "Hello",
  "userId": {"$ne": "user123"}
}
Expected: Either error or userId set to authenticated user
Actual: ?
```

**Status**: ✓ SAFE / ✗ VULNERABLE

---

#### Test 2.3: Parameter Pollution
**Test Steps**:
```
POST /api/posts
{
  "content": "Hello",
  "content": "Malicious",
  "userId": "admin"
}
Expected: Reject duplicate keys or use first one safely
Actual: ?
```

**Status**: ✓ SAFE / ✗ VULNERABLE

---

### CORS & Cross-Site Testing

#### Test 3.1: CORS Origin Validation
**Test Steps**:
1. From browser at evil.com, make fetch to /api/posts
2. Check if request succeeds or blocked

**Expected**: Blocked (403 or CORS error)  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test 3.2: WebSocket CORS
**Test Steps**:
1. Open browser console on evil.com
2. Try: `const socket = io('https://trave-api.com')`
3. Check if connection succeeds

**Expected**: Connection rejected  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

### Rate Limiting Testing

#### Test 4.1: Login Rate Limiting
**Test Steps**:
1. Send 10 failed login attempts in 1 minute
2. On 11th attempt, what happens?

**Expected**: Error "Too many attempts, try again later"  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test 4.2: API Rate Limiting
**Test Steps**:
1. Send 100 requests/second to GET /api/posts
2. On request 101+, what happens?

**Expected**: 429 Too Many Requests  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test 4.3: Socket.io Rate Limiting
**Test Steps**:
1. Send 1000 messages/second through WebSocket
2. What happens?

**Expected**: Connection throttled or disconnected  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

---

## SECTION 2: FUNCTIONAL TESTING (Priority 2)

### Post Management

#### Test F1: Create Post
**Setup**: User A logged in  
**Test Steps**:
1. Create post with content "Test post"
2. Verify post appears in feed
3. Verify userId is User A
4. Verify createdAt is today

**Expected**: ✓ All verified  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F2: Update Post
**Setup**: User A created post ID 123  
**Test Steps**:
1. User A updates content to "Updated post"
2. Verify post content changed
3. Verify updatedAt is now

**Expected**: ✓ Content updated  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F3: Delete Post
**Setup**: User A created post ID 123  
**Test Steps**:
1. User A deletes post
2. Try to GET /api/posts/123
3. Verify post doesn't appear in feed

**Expected**: Post returns 404  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F4: Post Visibility
**Setup**: User A creates private post  
**Test Steps**:
1. User B tries to see post (not follower)
2. User B follows User A
3. Try again

**Expected**: 
- Step 1: Post not visible
- Step 3: Post still not visible (or visible if private post sharing enabled)

**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

### Messaging

#### Test F5: Send Message
**Setup**: User A and User B in conversation  
**Test Steps**:
1. User A sends message "Hello"
2. User B receives message
3. Message shows User A as sender
4. Message has timestamp

**Expected**: ✓ All correct  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F6: Message Delivery Status
**Test Steps**:
1. User A sends message
2. Check status is "Sent"
3. User B reads message
4. User A sees status changed to "Read"

**Expected**: ✓ Status updates correctly  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F7: Conversation Threading
**Test Steps**:
1. User A and B have conversation
2. User A sends 5 messages
3. User B opens conversation
4. All 5 messages appear in order

**Expected**: ✓ All messages in correct order  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

### Following & Social

#### Test F8: Follow User
**Setup**: User A and User B (not following)  
**Test Steps**:
1. User A follows User B
2. Check User A's followingCount increased
3. Check User B's followersCount increased
4. User B's posts appear in User A's feed

**Expected**: ✓ All correct  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F9: Unfollow User
**Setup**: User A following User B  
**Test Steps**:
1. User A unfollows User B
2. Check followingCount decreased
3. Check followersCount decreased
4. User B's posts no longer in User A's feed

**Expected**: ✓ All correct  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test F10: Like Post
**Setup**: User A posted, User B viewing  
**Test Steps**:
1. User B likes post
2. Post.likesCount increases
3. Post appears in User B's saved posts
4. User A gets notification

**Expected**: ✓ All correct  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

---

## SECTION 3: PERFORMANCE TESTING (Priority 3)

### Load Testing

#### Test P1: Feed Load Time
**Test Steps**:
1. Load /api/posts?limit=20
2. Measure response time
3. Repeat 100 times

**Expected**: < 500ms average  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test P2: Search Performance
**Test Steps**:
1. Search for users with limit 1M database
2. Measure response time

**Expected**: < 200ms  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test P3: WebSocket Concurrent Users
**Test Steps**:
1. Connect 1000 concurrent WebSocket clients
2. Each sends 10 messages/second
3. Measure memory usage
4. Measure CPU usage

**Expected**: 
- Memory: < 1GB
- CPU: < 50%

**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test P4: Database Query Performance
**Test Steps**:
1. Measure query time for 100K documents
2. Check if indexes are being used
3. Look for N+1 queries

**Expected**: All queries use indexes  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

### Memory Leak Testing

#### Test P5: Memory Leak in Socket.io
**Test Steps**:
1. Connect and disconnect 1000 WebSocket clients
2. Check memory increases and decreases correctly
3. Repeat 10 times

**Expected**: Memory returns to baseline  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

---

## SECTION 4: DATA INTEGRITY TESTING (Priority 4)

### Consistency Checks

#### Test D1: Follower Count Consistency
**Test Steps**:
1. User A follows User B
2. Check User B.followersCount = Follow documents where followeeId = B
3. Unfollow and check again

**Expected**: Counts always match  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test D2: Like Count Consistency
**Test Steps**:
1. User A likes post
2. Check post.likesCount = Like documents where postId = post
3. Unlike and check again

**Expected**: Counts always match  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test D3: Message Synchronization
**Test Steps**:
1. User A sends message
2. Check appears in MongoDB
3. Check appears in WebSocket
4. Check read status syncs

**Expected**: All locations in sync  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test D4: Concurrent Write Safety
**Test Steps**:
1. User A and B simultaneously follow User C
2. Check User C.followersCount = 2
3. Repeat 100 times with 10 users

**Expected**: Always correct count  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

---

## SECTION 5: ERROR HANDLING TESTING (Priority 5)

### Error Scenarios

#### Test E1: Invalid Post ID
**Test Steps**:
```
GET /api/posts/invalid_id
Expected: 400 Bad Request or 404 Not Found
Actual: ?
```

**Status**: ✓ PASS / ✗ FAIL

---

#### Test E2: Database Connection Failure
**Test Steps**:
1. Stop MongoDB
2. Try to make API request
3. Check error response

**Expected**: Error message, not crash  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test E3: File Upload Failure
**Test Steps**:
1. Upload file > max size
2. Upload unsupported file type
3. Upload with invalid URL

**Expected**: Error message  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test E4: Network Timeout
**Test Steps**:
1. Simulate network latency (>30 seconds)
2. Check request times out and returns error

**Expected**: Error message  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

---

## SECTION 6: EDGE CASES (Priority 6)

#### Test G1: Empty Database
**Test Steps**:
1. Clear all data from MongoDB
2. Try to load feed, search users, get messages
3. Check graceful handling

**Expected**: Empty lists, no errors  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test G2: Massive Post (50MB content)
**Test Steps**:
1. Try to create post with 50MB of content
2. Check rejection with error

**Expected**: 400 Bad Request, "Content too large"  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test G3: Unicode & Special Characters
**Test Steps**:
1. Create post with emojis: "Hello 😀 🎉"
2. Create post with Arabic: "مرحبا"
3. Create post with Chinese: "你好"
4. Verify they display correctly

**Expected**: All display correctly  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

#### Test G4: Deleted User Data
**Test Steps**:
1. User A creates post
2. Delete User A
3. Check post still exists but shows "Deleted User"
4. Check messages from User A still exist

**Expected**: Graceful handling of deleted users  
**Actual**: ?  
**Status**: ✓ PASS / ✗ FAIL

---

---

## SECTION 7: REGRESSION TESTING CHECKLIST

### After Every Code Change:

- [ ] Test authentication still works
- [ ] Test all CRUD operations work
- [ ] Test no SQL errors in console
- [ ] Test WebSocket connections work
- [ ] Load previous 10 API endpoints
- [ ] Test feed loads
- [ ] Test messaging works
- [ ] Test file upload works
- [ ] Check response times < baseline
- [ ] Check memory usage stable

---

## SECTION 8: DEPLOYMENT TESTING

### Pre-Production Checklist:

- [ ] All security tests passing
- [ ] All functional tests passing
- [ ] Performance baseline established
- [ ] Database backups working
- [ ] Monitoring alerts configured
- [ ] Error tracking (Sentry) working
- [ ] HTTPS enforced
- [ ] SSL certificate valid
- [ ] CORS configured
- [ ] Rate limiting active
- [ ] Environment variables not leaked
- [ ] Load testing passed (1000+ concurrent users)
- [ ] 48-hour smoke test on staging
- [ ] Security audit passed
- [ ] Penetration testing passed

---

## SECTION 9: POSTMORTEM TESTING

### After Each Deploy to Production:

- [ ] Monitor error rates for 24 hours
- [ ] Monitor performance metrics
- [ ] Monitor database connections
- [ ] Check user reports/feedback
- [ ] Monitor WebSocket connections
- [ ] Check backup completion
- [ ] Review audit logs for anomalies
- [ ] Verify no data corruption
- [ ] Test rollback procedure works

---

## TEST EXECUTION SUMMARY

**Total Tests**: 34  
**Critical Tests** (Must Pass): 15  
**High Priority Tests**: 12  
**Medium Priority Tests**: 7

**Pass Criteria**:
- ✅ All 15 critical tests PASS
- ✅ All 12 high priority tests PASS
- ✅ At least 6 of 7 medium priority tests PASS

**Production Release Criteria**:
- ✅ 95%+ tests passing
- ✅ 0 critical findings
- ✅ 0 high findings
- ✅ Security audit passed
- ✅ Performance baseline achieved

---

## NOTES & ISSUES FOUND

| Test ID | Issue | Severity | Status |
|---------|-------|----------|--------|
| 1.1 | Unauth access allowed | 🔴 CRITICAL | Open |
| 2.1 | NoSQL injection in search | 🟡 HIGH | Open |
| P1 | Feed response time 2s | 🟠 MEDIUM | Open |
| | | | |
| | | | |

---

**QA Lead**: _________________  
**Date**: _________________  
**Sign-off**: _________________ 

