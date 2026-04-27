const express = require('express');
const bcrypt = require('bcryptjs');
const Session = require('../models/Session');
const Transaction = require('../models/Transaction');
const Bundle = require('../models/Bundle');
const Settlement = require('../models/Settlement');
const Operator = require('../models/Operator');
const { protectOperator } = require('../middleware/operatorAuthMiddleware');
const { createProvisionedSession } = require('../services/sessionService');
const { settleOperator } = require('../services/settlementService');
const { testConnection } = require('../services/mikrotikService');
const validate = require('../middleware/validate');
const schemas = require('../middleware/schemas');
const { audit } = require('../utils/audit');

const router = express.Router();
const clampLimit = (val, max = 100) => Math.min(Math.max(1, Number(val) || 20), max);

router.use(protectOperator);

// GET /api/v1/operator/stats
router.get('/stats', async (req, res, next) => {
  try {
    const opId = req.operator._id;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeSessions, revenueToday, revenueMonth, txnCount] = await Promise.all([
      Session.countDocuments({ operatorId: opId, status: 'ACTIVE' }),
      Transaction.aggregate([
        { $match: { operatorId: opId, status: 'SUCCESS', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$operatorNet' } } },
      ]),
      Transaction.aggregate([
        { $match: { operatorId: opId, status: 'SUCCESS', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$operatorNet' } } },
      ]),
      Transaction.countDocuments({ operatorId: opId, status: 'SUCCESS' }),
    ]);

    res.json({
      success: true,
      data: {
        activeSessions,
        revenueToday:  revenueToday[0]?.total  || 0,
        revenueMonth:  revenueMonth[0]?.total   || 0,
        walletBalance: req.operator.walletBalance,
        lifetimeGross: req.operator.lifetimeGross,
        txnCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/operator/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { operatorId: req.operator._id };
    if (status) query.status = status.toUpperCase();

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .populate('bundleId', 'name price durationMinutes')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit))
        .select('-__v'),
      Session.countDocuments(query),
    ]);

    res.json({ success: true, data: sessions, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/operator/sessions/grant
router.post('/sessions/grant', validate(schemas.sessionGrant), async (req, res, next) => {
  try {
    const { macAddress, bundleId, phone, durationMinutes, note } = req.body;

    const bundle = await Bundle.findOne({ _id: bundleId, operatorId: req.operator._id });
    if (!bundle) {
      return res.status(404).json({ success: false, message: 'Bundle not found or not owned by this operator' });
    }

    const overriddenBundle = durationMinutes
      ? { ...bundle.toObject(), durationMinutes }
      : bundle.toObject();

    const session = await createProvisionedSession({
      phone, macAddress, bundle: overriddenBundle, operator: req.operator, comment: note, usernameSeed: macAddress,
    });

    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SESSION_GRANTED', targetModel: 'Session', targetId: session._id,
      meta: { macAddress, bundleId, durationMinutes, note },
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/operator/transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = { operatorId: req.operator._id, status: 'SUCCESS' };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('bundleId', 'name price')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit))
        .select('-callbackPayload -__v'),
      Transaction.countDocuments(query),
    ]);

    res.json({ success: true, data: transactions, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/operator/bundles
router.get('/bundles', async (req, res, next) => {
  try {
    const bundles = await Bundle.find({ operatorId: req.operator._id }).sort({ price: 1 }).select('-__v');
    res.json({ success: true, data: bundles });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/operator/bundles
router.post('/bundles', validate(schemas.operatorBundleCreate), async (req, res, next) => {
  try {
    const bundle = await Bundle.create({
      ...req.body,
      operatorId: req.operator._id,
      isActive: req.body.isActive ?? true,
    });
    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'BUNDLE_CREATED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { name: bundle.name, price: bundle.price },
    });
    res.status(201).json({ success: true, data: bundle });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/operator/bundles/:id
router.put('/bundles/:id', validate(schemas.operatorBundleUpdate), async (req, res, next) => {
  try {
    const bundle = await Bundle.findOne({ _id: req.params.id, operatorId: req.operator._id });
    if (!bundle) return res.status(404).json({ success: false, message: 'Bundle not found' });

    Object.assign(bundle, req.body);
    await bundle.save();

    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'BUNDLE_UPDATED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { fields: Object.keys(req.body) },
    });
    res.json({ success: true, data: bundle });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/operator/bundles/:id
router.delete('/bundles/:id', async (req, res, next) => {
  try {
    const bundle = await Bundle.findOne({ _id: req.params.id, operatorId: req.operator._id });
    if (!bundle) return res.status(404).json({ success: false, message: 'Bundle not found' });

    const activeSessions = await Session.countDocuments({ bundleId: bundle._id, status: 'ACTIVE' });
    if (activeSessions > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${activeSessions} active session(s) are using this bundle. Deactivate it instead.`,
      });
    }

    await bundle.deleteOne();
    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'BUNDLE_DELETED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { name: bundle.name, price: bundle.price },
    });
    res.json({ success: true, message: 'Bundle deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/operator/profile
router.get('/profile', async (req, res, next) => {
  try {
    const op = await Operator.findById(req.operator._id).select(
      '-passwordHash -__v'
    );
    res.json({ success: true, data: op });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/operator/profile
router.put('/profile', validate(schemas.operatorProfileUpdate), async (req, res, next) => {
  try {
    const updates = { ...req.body };

    if (updates.portalPassword) {
      updates.passwordHash = await bcrypt.hash(updates.portalPassword, 12);
      delete updates.portalPassword;
    }

    const op = await Operator.findByIdAndUpdate(
      req.operator._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash -__v');

    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'PROFILE_UPDATED', targetModel: 'Operator', targetId: req.operator._id,
      meta: { fields: Object.keys(req.body) },
    });

    res.json({ success: true, data: op });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/operator/test-mikrotik
router.post('/test-mikrotik', async (req, res, next) => {
  try {
    const result = await testConnection(req.operator);
    res.json({ success: true, identity: result.identity });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message });
  }
});

// GET /api/v1/operator/settlements
router.get('/settlements', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = { operatorId: req.operator._id };

    const [settlements, total] = await Promise.all([
      Settlement.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit))
        .select('-__v'),
      Settlement.countDocuments(query),
    ]);

    res.json({ success: true, data: settlements, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/operator/settlements/request
router.post('/settlements/request', async (req, res, next) => {
  try {
    const op = await Operator.findById(req.operator._id);
    if (!op || op.walletBalance <= 0) {
      return res.status(400).json({ success: false, message: 'No balance available for payout' });
    }

    const minPayout = 10;
    if (op.walletBalance < minPayout) {
      return res.status(400).json({
        success: false,
        message: `Minimum payout is KES ${minPayout}. Your balance: KES ${op.walletBalance}`,
      });
    }

    const settlement = await settleOperator({
      operatorId: op._id,
      amount: op.walletBalance,
      method: 'B2C',
      notes: 'Operator-requested payout',
    });

    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SETTLEMENT_REQUESTED', targetModel: 'Settlement', targetId: settlement._id,
      meta: { amount: settlement.amount },
    });

    res.status(201).json({ success: true, data: settlement });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/operator/analytics — revenue by day (last 30 days)
router.get('/analytics', async (req, res, next) => {
  try {
    const opId = req.operator._id;
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const [dailyRevenue, topBundles] = await Promise.all([
      Transaction.aggregate([
        { $match: { operatorId: opId, status: 'SUCCESS', createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              year:  { $year:  { date: '$createdAt', timezone: 'Africa/Nairobi' } },
              month: { $month: { date: '$createdAt', timezone: 'Africa/Nairobi' } },
              day:   { $dayOfMonth: { date: '$createdAt', timezone: 'Africa/Nairobi' } },
            },
            revenue: { $sum: '$operatorNet' },
            count:   { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),
      Transaction.aggregate([
        { $match: { operatorId: opId, status: 'SUCCESS', createdAt: { $gte: since } } },
        { $group: { _id: '$bundleId', revenue: { $sum: '$operatorNet' }, count: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'bundles', localField: '_id', foreignField: '_id', as: 'bundle' } },
        { $unwind: { path: '$bundle', preserveNullAndEmptyArrays: true } },
        { $project: { name: { $ifNull: ['$bundle.name', 'Unknown'] }, revenue: 1, count: 1 } },
      ]),
    ]);

    // Fill gaps so every day has an entry
    const map = {};
    dailyRevenue.forEach(({ _id, revenue, count }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, '0')}-${String(_id.day).padStart(2, '0')}`;
      map[key] = { revenue, count };
    });

    const filled = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      filled.push({ date: key, revenue: map[key]?.revenue || 0, count: map[key]?.count || 0 });
    }

    res.json({ success: true, data: { daily: filled, topBundles } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
