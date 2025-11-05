// server/utils/logger.js

const winston = require('winston');
const { format } = winston;

// Increased rate limits and better categorization
const RATE_LIMITS = {
  error: 0,                    // Never rate limit errors
  warn: 30000,                // Warnings every 30s
  default_info: 30000,        // Default for info: 30s
  default_debug: 30000,       // Default for debug: 30s
  socket_debug: 5000,         // Socket debug logs every 5s
  high_frequency_endpoints: 60000,  // High frequency endpoints: 1 minute
};

// Specific patterns for payment endpoints to be completely skipped
const PAYMENT_SKIP_PATTERNS = [
  /^GET \/api\/payments\/status\//,
  /^GET \/api\/payments\/methods\//
];

// Consolidated endpoint patterns with better categorization
const ENDPOINT_PATTERNS = [
  {
    // Only log payment operations that aren't in PAYMENT_SKIP_PATTERNS
    pattern: /^(GET|POST) \/api\/payments/,
    key: 'payment_operations',
    rateLimit: RATE_LIMITS.high_frequency_endpoints,
    shouldLog: (message) => !PAYMENT_SKIP_PATTERNS.some(pattern => pattern.test(message))
  },
  {
    // Group all notification endpoints
    pattern: /^GET \/api\/notifications/,
    key: 'notifications',
    rateLimit: RATE_LIMITS.high_frequency_endpoints
  },
  {
    // Group all booking related endpoints
    pattern: /^(GET|POST) \/api\/bookings/,
    key: 'booking_operations',
    rateLimit: RATE_LIMITS.high_frequency_endpoints
  },
  {
    // Group all connection status checks
    pattern: /^GET \/api\/connections\/status/,
    key: 'connection_status',
    rateLimit: RATE_LIMITS.high_frequency_endpoints
  }
];

// Skip certain debug messages entirely
const SKIP_PATTERNS = [
  /^\[Socket\] Client ping/,
  /^GET \/health/,
  /^GET \/api\/status/,
  //...PAYMENT_SKIP_PATTERNS  // Include payment skip patterns
];

const shouldSkipMessage = (message) => {
  return SKIP_PATTERNS.some(pattern => pattern.test(message));
};

// Enhanced rate limiting with better categorization
const getRateLimit = (message, level) => {
  if (level === 'error') return 0;
  if (shouldSkipMessage(message)) return Infinity;
  
  // Check endpoint patterns
  for (const { pattern, rateLimit } of ENDPOINT_PATTERNS) {
    if (pattern.test(message)) {
      return rateLimit;
    }
  }
  
  // Default rate limits
  switch (level) {
    case 'warn': return RATE_LIMITS.warn;
    case 'info': return RATE_LIMITS.default_info;
    case 'debug': return RATE_LIMITS.default_debug;
    default: return RATE_LIMITS.default_debug;
  }
};

// Enhanced message categorization
const getMessageCategory = (message) => {
  for (const { pattern, key } of ENDPOINT_PATTERNS) {
    if (pattern.test(message)) {
      return key;
    }
  }
  
  if (message.includes('[auth]')) return 'auth';
  if (message.includes('[Socket]')) return 'socket';
  if (message.includes('[PaymentController]')) return 'payment';
  return 'other';
};

// Rate limiting tracker with cleanup
const logTracker = new Map();
const cleanupInterval = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  const maxLimit = Math.max(...Object.values(RATE_LIMITS));
  for (const [key, timestamp] of logTracker.entries()) {
    if (now - timestamp > maxLimit) {
      logTracker.delete(key);
    }
  }
}, cleanupInterval);

// Enhanced shouldLog implementation
const shouldLog = (message, level = 'debug') => {
  if (shouldSkipMessage(message)) return false;
  if (level === 'error') return true;
  
  const now = Date.now();
  const category = getMessageCategory(message);
  const isSocket = category === 'socket';
  const key = `${category}:${level}`;
  const lastLog = logTracker.get(key);
  
  // Special handling for socket debug logs
  const rateLimit = isSocket && level === 'debug' ? RATE_LIMITS.socket_debug : getRateLimit(message, level);

  if (!lastLog || (now - lastLog) > rateLimit) {
    logTracker.set(key, now);
    return true;
  }
  return false;
};

// Winston logger configuration
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(({ level, message, timestamp, ...metadata }) => {
      if (!shouldLog(message, level)) return null;
      
      let msg = `${timestamp} [${level}] ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Rate-limited logger interface
const rateLogger = {
  error: (...args) => logger.error(...args),
  warn: (...args) => logger.warn(...args),
  info: (message, metadata = {}) => {
    if (shouldLog(message, 'info')) {
      logger.info(message, metadata);
    }
  },
  debug: (message, metadata = {}) => {
    if (shouldLog(message, 'debug')) {
      logger.debug(message, metadata);
    }
  }
};

// Request logger middleware with enhanced filtering
const requestLogger = (req, res, next) => {
  // Skip payment status endpoints completely
  if (PAYMENT_SKIP_PATTERNS.some(pattern => pattern.test(`${req.method} ${req.originalUrl}`))) {
    return next();
  }

  const start = Date.now();
  res.on('finish', () => {
    // Skip logging for successful payment status checks
    if (req.originalUrl.includes('/api/payments/status/') && res.statusCode === 200) {
      return;
    }
    const duration = Date.now() - start;
    const logMessage = `${req.method} ${req.originalUrl}`;

    // Always log errors
    if (res.statusCode >= 400) {
      rateLogger.error(logMessage, {
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userId: req.user?._id
      });
      return;
    }

    if (req.originalUrl.startsWith('/api/payments/')) {
      rateLogger.debug(`Payment operation: ${req.method} ${req.originalUrl}`, {
        status: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?._id,
        timestamp: new Date().toISOString()
      });
    }

    // Special handling for payment-related endpoints
    if (req.originalUrl.startsWith('/api/payments/')) {
      // Only log significant payment events (not status checks or method fetches)
      if (!PAYMENT_SKIP_PATTERNS.some(pattern => pattern.test(logMessage))) {
        rateLogger.info(logMessage, {
          status: res.statusCode,
          duration: `${duration}ms`,
          userId: req.user?._id
        });
      }
      return;
    }

    // Rate limit success logs
    if (shouldLog(logMessage, 'debug')) {
      rateLogger.debug(logMessage, {
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userId: req.user?._id
      });
    }
  });
  next();
};

module.exports = {
  logger: rateLogger,
  requestLogger
};