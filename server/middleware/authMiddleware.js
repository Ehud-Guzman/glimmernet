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
    req.admin = decoded;

    // Block deactivated accounts on every request — not just at login
    const user = await AdminUser.findById(decoded.id).select('isActive passwordChangedAt');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    // Invalidate tokens issued before the last password change
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ success: false, message: 'Session expired after password change. Please log in again.' });
    }

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
