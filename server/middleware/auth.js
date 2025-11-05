const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { logger } = require('../utils/logger'); 
const checkRole = require('./checkRole');

const auth = async (req, res, next) => {
  const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    logger.warn('[auth] No token provided');
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    logger.debug(`[auth] Decoded token: ${JSON.stringify(decoded)}`);

    // Check for impersonation flag in the decoded token
    if (decoded.user && decoded.user.impersonating && decoded.user.impersonatorId) {
        const impersonatedUser = await User.findById(decoded.user.id).select('-password');
        const impersonatorUser = await User.findById(decoded.user.impersonatorId).select('-password');

        if (!impersonatedUser || !impersonatorUser) {
            logger.warn(`[auth] Impersonation failed: Impersonated user (${decoded.user.id}) or Impersonator (${decoded.user.impersonatorId}) not found.`);
            return res.status(401).json({ msg: 'Impersonation failed: User context invalid' });
        }

        // Check if the impersonator is actually an admin
        if (impersonatorUser.role !== 'admin') {
             logger.warn(`[auth] Impersonation attempt by non-admin user: ${impersonatorUser._id}`);
             return res.status(403).json({ msg: 'Access denied: Only admins can impersonate users.' });
        }

        req.user = {
            ...impersonatedUser.toObject(),
            id: impersonatedUser._id.toString(),
            _id: impersonatedUser._id.toString(),
            impersonating: true,
            impersonatorId: impersonatorUser._id.toString(),
            impersonatorEmail: impersonatorUser.email,
        };
        logger.info(`[auth] User ${impersonatedUser._id} is being impersonated by admin ${impersonatorUser._id}.`);
        return next();
    }


    // Original logic for normal authentication
    const user = await User.findById(decoded.user.id).select('-password');
    
    if (!user) {
      logger.warn(`[auth] User not found for id: ${decoded.user.id}`);
      return res.status(401).json({ msg: 'User not found' });
    }

    if (user.tokenVersion !== decoded.user.version) {
        logger.warn(`[auth] Invalid token version for user: ${user._id}. Token version: ${decoded.user.version}, DB version: ${user.tokenVersion}`);
        return res.status(401).json({ msg: 'Token is invalid. Please log in again.' });
    }

    logger.debug(`[auth] User found: ${JSON.stringify(user.toObject(), null, 2)}`);

    const userObject = user.toObject();
    req.user = {
      ...userObject,
      id: user._id.toString(),
      _id: user._id.toString(),
    };

    logger.info(`[auth] User authenticated: ${user._id}`);
    return next();
  } catch (error) {
    logger.error('[auth] Authentication error:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });

    return res.status(401).json({ 
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Helper function to get user ID, supporting both _id and id
const getUserId = (user) => {
  if (!user) return null;
  return user._id ? user._id.toString() : user.id ? user.id.toString() : null;
};

module.exports = { 
  auth, 
  isAdmin: checkRole('admin'), 
  isCoach: checkRole('coach'),
  getUserId // Export the getUserId helper function
};