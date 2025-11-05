const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

const isDevelopment = process.env.NODE_ENV === 'development';

// General limiter for most API requests
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	// In development, allow a very high limit. In production, use a reasonable limit.
	max: isDevelopment ? 1000 : 100, 
	standardHeaders: true,
	legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' },
    handler: (req, res, next, options) => {
        logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
        res.status(options.statusCode).send(options.message);
    },
    // Skip rate limiting for localhost in development
    skip: (req) => isDevelopment && (req.ip === '::1' || req.ip === '127.0.0.1'),
});

// Stricter limiter for content creation like posting comments
const createContentLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	// Generous limit for development, stricter for production
	max: isDevelopment ? 500 : 20,
	standardHeaders: true,
	legacyHeaders: false,
    message: { message: 'You have posted too frequently. Please try again later.'},
    handler: (req, res, next, options) => {
        logger.warn('Create content rate limit exceeded', { ip: req.ip, path: req.path, userId: req.user?._id });
        res.status(options.statusCode).send(options.message);
    },
    // Also skip for localhost in development
    skip: (req) => isDevelopment && (req.ip === '::1' || req.ip === '127.0.0.1'),
});


module.exports = {
    apiLimiter,
    createContentLimiter,
};