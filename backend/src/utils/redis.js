const Redis = require('ioredis');
const logger = require('./logger');

let redis;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('⚠️ Redis connection failed, continuing without cache.');
          return null;
        }
        return Math.min(times * 50, 2000);
      }
    });

    redis.on('error', (err) => {
      logger.warn('⚠️ Redis Error: %s', err.message);
    });

    redis.on('connect', () => {
      logger.info('✅ Redis connected');
    });
  } catch (e) {
    logger.warn('⚠️ Redis Initialization Error: %s', e.message);
  }
} else {
  logger.info('ℹ️ Redis URL not provided, caching disabled.');
}

const get = async (key) => {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

const set = async (key, value, ttl = 3600) => {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (e) {
    // Ignore cache errors
  }
};

const del = async (key) => {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (e) {
    // Ignore cache errors
  }
};

module.exports = { redis, get, set, del };
