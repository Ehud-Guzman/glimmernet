const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Operator = require('../models/Operator');
const { protectOperator } = require('../middleware/operatorAuthMiddleware');
const validate = require('../middleware/validate');
const schemas = require('../middleware/schemas');

const router = express.Router();

// POST /api/v1/operator/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required' });
    }

    const operator = await Operator.findOne({ email: email.toLowerCase().trim() });
    if (!operator) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (operator.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'Your account is suspended. Contact support.' });
    }

    if (!operator.passwordHash) {
      return res.status(403).json({
        success: false,
        message: 'Portal access not yet enabled. Contact your administrator to set a password.',
      });
    }

    const match = await bcrypt.compare(password, operator.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: operator._id, type: 'operator', shortCode: operator.shortCode, name: operator.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token,
      operator: {
        id: operator._id,
        name: operator.name,
        shortCode: operator.shortCode,
        email: operator.email,
        brandName: operator.brandName || operator.name,
        accentColor: operator.accentColor,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/operator/auth/me
router.get('/me', protectOperator, (req, res) => {
  const op = req.operator;
  res.json({
    success: true,
    operator: {
      id: op._id,
      name: op.name,
      shortCode: op.shortCode,
      email: op.email,
      brandName: op.brandName || op.name,
      accentColor: op.accentColor,
      walletBalance: op.walletBalance,
      lifetimeGross: op.lifetimeGross,
    },
  });
});

// PUT /api/v1/operator/auth/password — change own password
router.put('/password', protectOperator, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    const operator = await Operator.findById(req.operator._id);
    if (!operator?.passwordHash) {
      return res.status(400).json({ success: false, message: 'No password set. Contact your administrator.' });
    }

    const match = await bcrypt.compare(currentPassword, operator.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    operator.passwordHash = await bcrypt.hash(newPassword, 12);
    await operator.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/operator/auth/signup — self-service lead capture (creates PENDING operator)
router.post('/signup', validate(schemas.operatorSignup), async (req, res, next) => {
  try {
    const { name, businessName, ownerPhone, email } = req.body;

    // Generate a provisional shortCode from business name
    const base = name.replace(/\s+/g, '').toUpperCase().slice(0, 6);
    const suffix = Math.floor(Math.random() * 900 + 100);
    let shortCode = `${base}${suffix}`;
    // Ensure uniqueness with retries
    for (let i = 0; i < 10; i++) {
      const exists = await Operator.findOne({ shortCode });
      if (!exists) break;
      shortCode = `${base}${Math.floor(Math.random() * 900 + 100)}`;
    }

    const op = await Operator.create({
      name,
      businessName: businessName || '',
      ownerPhone,
      email: email || '',
      shortCode,
      status: 'PENDING',
    });

    res.status(201).json({
      success: true,
      message: 'Application received. Our team will contact you to activate your account.',
      referenceCode: op.shortCode,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with that email or short code already exists.' });
    }
    next(err);
  }
});

module.exports = router;
