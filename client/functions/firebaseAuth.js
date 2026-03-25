const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('../../serviceAccountKey.json')),
  });
}

// Express route handler for verifying Firebase ID token
async function firebaseAuthMiddleware(req, res, next) {
  const token = req.body.token || req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Example login endpoint
// POST /auth/firebase-login
async function firebaseLoginHandler(req, res) {
  const { token } = req.body;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    // Optionally: create/find user in your DB, issue your own JWT, etc.
    res.json({ success: true, user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid Firebase token' });
  }
}

module.exports = { firebaseAuthMiddleware, firebaseLoginHandler };
