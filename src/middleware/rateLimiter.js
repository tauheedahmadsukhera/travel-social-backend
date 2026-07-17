const { redis } = require('../utils/redis');
const logger = require('../utils/logger');

/**
 * Sliding window rate limiter middleware with Redis backend and in-memory fallback.
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time frame in milliseconds (default 1 min)
 * @param {number} options.max - Max number of requests allowed per window (default 10)
 * @param {string} options.keyPrefix - Prefix for cache keys (default 'rl:')
 */
const rateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 10;
  const keyPrefix = options.keyPrefix || 'rl:';

  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}${ip}:${req.path}`;

    if (redis) {
      try {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, Math.ceil(windowMs / 1000));
        }

        const ttl = await redis.ttl(key);
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));
        res.setHeader('X-RateLimit-Reset', ttl > 0 ? ttl : 0);

        if (current > max) {
          logger.warn(`🚫 Rate limit exceeded for IP: ${ip} on route: ${req.path}`);
          return res.status(429).json({
            success: false,
            error: 'Too many requests. Please slow down and try again later.'
          });
        }
      } catch (err) {
        logger.error(`Rate limiter redis error: ${err.message}`);
        // Fail-safe: allow request if Redis breaks
      }
    } else {
      // Memory fallback rate limiting
      if (!global.localRateLimitMap) {
        global.localRateLimitMap = new Map();
      }

      const now = Date.now();
      const clientData = global.localRateLimitMap.get(key) || { requests: [], resetTime: now + windowMs };

      // Filter timestamps outside current window
      clientData.requests = clientData.requests.filter(timestamp => now - timestamp < windowMs);

      if (clientData.requests.length >= max) {
        const remainingTime = Math.ceil((clientData.resetTime - now) / 1000);
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', remainingTime);
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please slow down and try again later.'
        });
      }

      clientData.requests.push(now);
      if (clientData.requests.length === 1) {
        clientData.resetTime = now + windowMs;
      }

      global.localRateLimitMap.set(key, clientData);

      const remaining = max - clientData.requests.length;
      const ttl = Math.ceil((clientData.resetTime - now) / 1000);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', ttl > 0 ? ttl : 0);
    }
    next();
  };
};

module.exports = rateLimiter;
