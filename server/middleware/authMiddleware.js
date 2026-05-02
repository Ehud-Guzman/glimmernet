const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Re-fetch isActive, passwordChangedAt, and role from DB on every request
    // so demotions and deactivations take effect immediately without waiting for token expiry.
    const user = await AdminUser.findById(decoded.id).select('isActive passwordChangedAt role');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ success: false, message: 'Session expired after password change. Please log in again.' });
    }

    req.admin = { ...decoded, role: user.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

/**
 * Restrict a route to one or more roles.
 * Usage: router.post('/sensitive', protect, requireRole('superadmin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin?.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${roles.join(' or ')}.`,
    });
  }
  next();
};

module.exports = { protect, requireRole };
