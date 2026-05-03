const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OperatorSubUser = require('../models/OperatorSubUser');
const Operator = require('../models/Operator');
const { protectOperator } = require('../middleware/operatorAuthMiddleware');
const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();

// ── Sub-user auth ─────────────────────────────────────────────────────────────

// POST /api/v1/operator/sub-users/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, operatorShortCode } = req.body;
    if (!email || !password || !operatorShortCode) {
      return res.status(400).json({ success: false, message: 'email, password and operatorShortCode required' });
    }
    const op = await Operator.findOne({ shortCode: operatorShortCode.toUpperCase(), status: 'ACTIVE' });
    if (!op) return res.status(404).json({ success: false, message: 'Operator not found' });

    const subUser = await OperatorSubUser.findOne({ email: email.toLowerCase(), operatorId: op._id, isActive: true });
    if (!subUser) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, subUser.passwordHash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    await OperatorSubUser.findByIdAndUpdate(subUser._id, { lastLoginAt: new Date() });

    const token = jwt.sign(
      { id: subUser._id, operatorId: op._id, role: 'sub-user', permissions: subUser.permissions },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ success: true, token, data: { name: subUser.name, email: subUser.email, permissions: subUser.permissions, operatorName: op.name } });
  } catch (err) { next(err); }
});

// All routes below require operator JWT
router.use(protectOperator);

// GET /api/v1/operator/sub-users
router.get('/', async (req, res, next) => {
  try {
    const subUsers = await OperatorSubUser.find({ operatorId: req.operator._id })
      .select('-passwordHash')
      .sort({ createdAt: 1 });
    res.json({ success: true, data: subUsers });
  } catch (err) { next(err); }
});

// POST /api/v1/operator/sub-users
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, permissions = {} } = req.body;
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'name, email and password (min 8 chars) required' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const sub = await OperatorSubUser.create({
      operatorId: req.operator._id, name, email: email.toLowerCase(), passwordHash,
      permissions: { viewTransactions: true, viewSessions: true, ...permissions },
    });
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SUB_USER_CREATED', targetModel: 'OperatorSubUser', targetId: sub._id, meta: { email, name } });
    res.status(201).json({ success: true, data: { _id: sub._id, name: sub.name, email: sub.email, permissions: sub.permissions } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Email already in use for this operator' });
    next(err);
  }
});

// PUT /api/v1/operator/sub-users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const sub = await OperatorSubUser.findOne({ _id: req.params.id, operatorId: req.operator._id });
    if (!sub) return res.status(404).json({ success: false, message: 'Sub-user not found' });
    const { name, email, password, permissions, isActive } = req.body;
    if (name !== undefined) sub.name = name;
    if (email !== undefined) sub.email = email.toLowerCase();
    if (password && password.length >= 8) sub.passwordHash = await bcrypt.hash(password, 12);
    if (permissions !== undefined) sub.permissions = { ...sub.permissions, ...permissions };
    if (isActive !== undefined) sub.isActive = isActive;
    await sub.save();
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SUB_USER_UPDATED', targetModel: 'OperatorSubUser', targetId: sub._id, meta: { fields: Object.keys(req.body) } });
    res.json({ success: true, data: { _id: sub._id, name: sub.name, email: sub.email, permissions: sub.permissions, isActive: sub.isActive } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/operator/sub-users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const sub = await OperatorSubUser.findOneAndDelete({ _id: req.params.id, operatorId: req.operator._id });
    if (!sub) return res.status(404).json({ success: false, message: 'Sub-user not found' });
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SUB_USER_DELETED', targetModel: 'OperatorSubUser', targetId: sub._id, meta: { email: sub.email } });
    res.json({ success: true, message: 'Sub-user removed' });
  } catch (err) { next(err); }
});

module.exports = router;
