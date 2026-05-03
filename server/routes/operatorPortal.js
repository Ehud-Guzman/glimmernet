const express = require('express');
const bcrypt = require('bcryptjs');
const Session = require('../models/Session');
const Transaction = require('../models/Transaction');
const Bundle = require('../models/Bundle');
const Settlement = require('../models/Settlement');
const Operator = require('../models/Operator');
const Voucher = require('../models/Voucher');
const { protectOperator } = require('../middleware/operatorAuthMiddleware');
const { encrypt: encryptField } = require('../utils/fieldEncryption');
const { createProvisionedSession } = require('../services/sessionService');
const { settleOperator } = require('../services/settlementService');
const { testConnection, removeHotspotUser } = require('../services/mikrotikService');
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

    const [activeSessions, revenueToday, revenueMonth, txnCount, accessFailedCount] = await Promise.all([
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
      Transaction.countDocuments({ operatorId: opId, status: 'ACCESS_FAILED' }),
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
        accessFailedCount,
        healthStatus:  req.operator.healthStatus,
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

// PATCH /api/v1/operator/sessions/:id/extend
router.patch('/sessions/:id/extend', async (req, res, next) => {
  try {
    const minutes = Number(req.body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      return res.status(400).json({ success: false, message: 'minutes must be a whole number between 1 and 10080' });
    }
    const session = await Session.findOne({ _id: req.params.id, operatorId: req.operator._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Only active sessions can be extended' });
    }
    const base = session.expiresAt && session.expiresAt > new Date() ? session.expiresAt : new Date();
    session.expiresAt = new Date(base.getTime() + minutes * 60 * 1000);
    await session.save();
    await audit({
      actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SESSION_EXTENDED', targetModel: 'Session', targetId: session._id,
      meta: { username: session.username, minutes, newExpiry: session.expiresAt },
    });
    res.json({ success: true, data: session });
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
    const { page = 1, limit = 50 } = req.query;
    const filter = { operatorId: req.operator._id };
    const [bundles, total] = await Promise.all([
      Bundle.find(filter).sort({ price: 1 }).skip((Number(page) - 1) * clampLimit(limit, 200)).limit(clampLimit(limit, 200)).select('-__v'),
      Bundle.countDocuments(filter),
    ]);
    res.json({ success: true, data: bundles, total, page: Number(page) });
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
      updates.passwordChangedAt = new Date();
      delete updates.portalPassword;
    }
    if (updates.mikrotikPass) updates.mikrotikPass = encryptField(updates.mikrotikPass);

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

// DELETE /api/v1/operator/sessions/:id — force-terminate a session (manual override)
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, operatorId: req.operator._id }).populate('operatorId');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    await removeHotspotUser(session.operatorId, session.username);
    session.status = 'TERMINATED';
    session.mikrotikRemoved = true;
    await session.save();
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SESSION_TERMINATED', targetModel: 'Session', targetId: session._id,
      meta: { username: session.username, macAddress: session.macAddress } });
    res.json({ success: true, message: 'Session terminated' });
  } catch (err) { next(err); }
});

// POST /api/v1/operator/transactions/:id/retry-grant — force-provision a failed transaction
router.post('/transactions/:id/retry-grant', async (req, res, next) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.id, operatorId: req.operator._id })
      .populate('bundleId').populate('operatorId');
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (txn.status !== 'SUCCESS' && txn.status !== 'ACCESS_FAILED') {
      return res.status(400).json({ success: false, message: 'Can only retry paid transactions where access was not granted' });
    }
    if (txn.sessionId) {
      const existing = await Session.findOne({ _id: txn.sessionId, status: 'ACTIVE' });
      if (existing) return res.status(400).json({ success: false, message: 'An active session already exists for this transaction' });
    }
    const mac = (req.body.macAddress || txn.macAddress || '').trim().toUpperCase();
    if (!mac) return res.status(400).json({ success: false, message: 'macAddress required' });
    const bundle = txn.bundleId?.toObject ? txn.bundleId.toObject() : txn.bundleId;
    const session = await createProvisionedSession({
      phone: txn.phone, macAddress: mac, bundle, operator: txn.operatorId,
      transactionId: txn._id, usernameSeed: mac,
    });
    txn.status = 'SUCCESS'; txn.sessionId = session._id;
    await txn.save();
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'SESSION_GRANTED', targetModel: 'Session', targetId: session._id,
      meta: { transactionId: txn._id, phone: txn.phone, macAddress: mac, retried: true } });
    res.status(201).json({ success: true, data: session });
  } catch (err) { next(err); }
});

// GET /api/v1/operator/provision-failures — ACCESS_FAILED transactions for this operator
router.get('/provision-failures', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = { operatorId: req.operator._id, status: 'ACCESS_FAILED' };
    const [txns, total] = await Promise.all([
      Transaction.find(filter)
        .populate('bundleId', 'name price')
        .sort({ createdAt: -1 })
        .skip((page - 1) * clampLimit(limit))
        .limit(clampLimit(limit))
        .select('-callbackPayload -__v'),
      Transaction.countDocuments(filter),
    ]);
    res.json({ success: true, data: txns, total, page: Number(page) });
  } catch (err) { next(err); }
});

// GET /api/v1/operator/vouchers/export — operator-scoped voucher CSV
router.get('/vouchers/export', async (req, res, next) => {
  try {
    const { batchId, status } = req.query;
    const filter = { operatorId: req.operator._id };
    if (batchId) filter.batchId = batchId;
    if (status)  filter.status  = status;

    const vouchers = await Voucher.find(filter)
      .populate('bundleId', 'name price')
      .sort({ createdAt: -1 })
      .limit(5000);

    const rows = [
      ['Code', 'Type', 'Bundle', 'Price (KES)', 'Status', 'Max Devices', 'Redeemed', 'Expires', 'Created', 'Note'],
      ...vouchers.map((v) => [
        v.code, v.type, v.bundleId?.name || '', v.bundleId?.price || '',
        v.status, v.maxDevices, v.redemptions?.length ?? 0,
        v.expiresAt ? v.expiresAt.toISOString().slice(0, 10) : 'Never',
        v.createdAt.toISOString().slice(0, 10), v.note,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vouchers.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// GET /api/v1/operator/analytics — revenue by day (last 30 days)
router.get('/analytics', async (req, res, next) => {
  try {
    const opId = req.operator._id;
    const days = Math.min(Number(req.query.days) || 30, 90);
    // Anchor to midnight Nairobi time so the gap-fill keys match the aggregation timezone.
    const todayNairobiStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
    const since = new Date(`${todayNairobiStr}T00:00:00+03:00`);
    since.setDate(since.getDate() - days + 1);

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

    // Fill gaps so every day has an entry.
    // Keys use Nairobi timezone to match the aggregation grouping.
    const toNairobiDateKey = (d) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);

    const map = {};
    dailyRevenue.forEach(({ _id, revenue, count }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, '0')}-${String(_id.day).padStart(2, '0')}`;
      map[key] = { revenue, count };
    });

    const filled = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = toNairobiDateKey(d);
      filled.push({ date: key, revenue: map[key]?.revenue || 0, count: map[key]?.count || 0 });
    }

    res.json({ success: true, data: { daily: filled, topBundles } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
