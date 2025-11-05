const { logger } = require('../utils/logger');

const checkRole = (...allowedRoles) => {
  // This flattens the array, so it works whether you pass
  // checkRole('admin', 'support') or checkRole(['admin', 'support'])
  const flatRoles = allowedRoles.flat();

  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole) {
      logger.warn('[checkRole] Access Denied: User or role not found on request object.', {
        userId: req.user?.id || 'N/A',
        path: req.originalUrl,
      });
      return res.status(403).json({ msg: 'Access denied' });
    }

    if (!flatRoles.includes(userRole)) {
      logger.warn('[checkRole] Access Denied: User role does not have permission.', {
        userId: req.user.id,
        userRole: userRole,
        requiredRoles: flatRoles,
        path: req.originalUrl,
      });
      return res.status(403).json({ msg: 'Access denied' });
    }

    next();
  };
};

module.exports = checkRole;