
const Redis = require('ioredis');

let redis;
const redisUrl = process.env.REDIS_URL;

console.log("[RedisClient] Initializing central Redis connection...");

if (redisUrl) {
  try {
    const redisOptions = {
      // The `rediss://` protocol signifies a TLS connection is required.
      tls: {
        rejectUnauthorized: false
      },
      // Important for BullMQ and robust connections
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    
    redis = new Redis(redisUrl, redisOptions);
    
    redis.on('connect', () => {
        console.log('[RedisClient] Central connection successful.');
    });

    redis.on('error', (err) => {
        console.error('[RedisClient] Central connection error:', {
            message: err.message,
            code: err.code,
            address: err.address,
            port: err.port,
        });
    });

  } catch (e) {
    console.error('[RedisClient] FATAL: Failed to initialize Redis with URL. Exiting.', e);
    process.exit(1);
  }
} else {
  console.warn('[RedisClient] REDIS_URL not found. Falling back to local development settings.');
  redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6380,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

module.exports = redis;