const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required' });
    }

    const admin = await AdminUser.findOne({ email });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact the superadmin.' });
    }

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token,
      admin: { name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    next(err);
  }
});

// Verify the current token and return fresh profile (used by frontend on load)
router.get('/me', protect, async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.admin.id).select('-passwordHash');
    if (!admin) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, admin });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/forgot-password
// Generates a 1-hour reset token. Sends it via SMS if AT is configured; returns
// it in the response body in non-production so developers can use it without SMS.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'email is required' });
    }

    const admin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
    // Always respond 200 to prevent user enumeration
    if (!admin || !admin.isActive) {
      return res.json({ success: true, message: 'If that email exists, a reset token has been sent.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    admin.resetToken = tokenHash;
    admin.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await admin.save();

    // AdminUser has no phone field — emit the token to server logs (visible to
    // whoever has server access) and return it in the response in non-production.
    const logger = require('../utils/logger');
    logger.warn('Password reset token generated', {
      adminId: admin._id,
      email: admin.email,
      // Token is logged so a server operator can retrieve it without email infra.
      // Rotate JWT_SECRET if logs are ever compromised.
      resetToken: rawToken,
    });

    const payload = { success: true, message: 'If that email exists, a reset token has been sent.' };
    if (process.env.NODE_ENV !== 'production') {
      payload.resetToken = rawToken; // visible in dev/staging for convenience
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'token and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const admin = await AdminUser.findOne({
      resetToken: tokenHash,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!admin) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    admin.resetToken = null;
    admin.resetTokenExpiry = null;
    await admin.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
