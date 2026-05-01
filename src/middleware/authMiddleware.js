const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET is not configured (set it in your host env, e.g. Render Environment)');
  }
  return secret;
}

/** For Socket.IO / optional paths: no throw when unset (dev). */
exports.getJwtSecretOrNull = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) return null;
  return String(secret).trim();
};

/**
 * Middleware to verify JWT token from Authorization header
 * Extracts userId and attaches to req.user
 */
exports.verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      details: error.message
    });
  }
};

/**
 * Generate JWT token for user
 */
exports.generateToken = (userId, email) => {
  return jwt.sign(
    {
      userId,
      email,
      iat: Math.floor(Date.now() / 1000),
    },
    getJwtSecret(),
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

/**
 * Optional: Verify admin role (assumes user has role in DB)
 */
exports.isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    // You would check user.role here if storing in DB
    // For now, just continue
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
