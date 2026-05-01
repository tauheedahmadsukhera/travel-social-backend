const Redis = require('ioredis');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true
};

let redis = new Redis(connection);
let redisAvailable = false;

// Silence Redis errors to prevent log spamming in environments without Redis
redis.on('error', () => {});

redis.connect().then(() => {
  redisAvailable = true;
}).catch(() => {
  redisAvailable = false;
});

// Local memory fallback
const localCache = new Map();

const cache = {
  async get(key) {
    try {
      if (redisAvailable) return await redis.get(key);
    } catch (e) {
      redisAvailable = false;
    }
    
    const item = localCache.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      localCache.delete(key);
      return null;
    }
    return item.value;
  },

  async set(key, value, ttlSeconds = 300) {
    try {
      if (redisAvailable) {
        if (ttlSeconds) return await redis.set(key, value, 'EX', ttlSeconds);
        return await redis.set(key, value);
      }
    } catch (e) {
      redisAvailable = false;
    }
    
    localCache.set(key, {
      value,
      expiry: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null
    });
  },

  async del(key) {
    try {
      if (redisAvailable) return await redis.del(key);
    } catch (e) {
      redisAvailable = false;
    }
    localCache.delete(key);
  }
};

module.exports = cache;
