const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { logger } = require('../utils/logger');

const optionalAuth = async (req, res, next) => {
  const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.user.id).select('-password');

    if (!user || user.tokenVersion !== decoded.user.version) {
      logger.warn(`[optionalAuth] Invalid token or user session for user: ${decoded.user.id}. Proceeding as guest.`);
      return next();
    }
    
    const userObject = user.toObject();
    req.user = {
      ...userObject,
      id: user._id.toString(),
      _id: user._id.toString(),
    };
    
    logger.info(`[optionalAuth] User authenticated optionally: ${user._id}`);
  } catch (err) {
    logger.warn('[optionalAuth] Invalid token received, proceeding as guest.', { tokenError: err.message });
  }
  
  next();
};

module.exports = optionalAuth;