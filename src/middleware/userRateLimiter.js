const rateLimit = require('express-rate-limit');

/**
 * Industrial User-ID / IP Based Rate Limiter
 * Protects endpoints (Posts, Comments, Likes) from spam bots.
 */
const createUserRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100, // max requests per window
    keyGenerator: (req) => {
      const userId = req.user?.id || req.user?._id || req.user?.uid || req.query?.userId || req.body?.userId;
      if (userId) return `user_${userId}`;
      return req.ip; // fallback to IP
    },
    message: { success: false, error: options.message || 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = { createUserRateLimiter };
