const express = require('express');
const bcrypt = require('bcryptjs');
const Session = require('../models/Session');
const Transaction = require('../models/Transaction');
const Bundle = require('../models/Bundle');
const Voucher = require('../models/Voucher');
const Operator = require('../models/Operator');
const Settlement = require('../models/Settlement');
const AdminUser = require('../models/AdminUser');
const AdminLog = require('../models/AdminLog');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { removeHotspotUser, testConnection } = require('../services/mikrotikService');
const { createProvisionedSession } = require('../services/sessionService');
const { generateUniqueCodes } = require('../services/voucherService');
const { settleOperator } = require('../services/settlementService');
const validate = require('../middleware/validate');
const schemas = require('../middleware/schemas');
const { audit } = require('../utils/audit');

const router = express.Router();
const isSuperAdmin = requireRole('superadmin');

const clampLimit = (val, max = 100) => Math.min(Math.max(1, Number(val) || 20), max);

// ── Seed (zero-admin bootstrap — disabled once any admin exists) ──────────────

router.post('/seed', async (req, res, next) => {
  try {
    if (!process.env.ADMIN_SEED_TOKEN) {
      return res.status(403).json({
        success: false,
        message: 'Admin bootstrap is disabled. Set ADMIN_SEED_TOKEN temporarily to create the first admin.',
      });
    }
    const seedToken = req.headers['x-admin-seed-token'];
    if (seedToken !== process.env.ADMIN_SEED_TOKEN) {
      return res.status(403).json({ success: false, message: 'Invalid admin bootstrap token.' });
    }
    const exists = await AdminUser.countDocuments();
    if (exists > 0) {
      return res.status(400).json({ success: false, message: 'Admin already seeded.' });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email and password are required.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await AdminUser.create({ name, email, passwordHash, role: 'superadmin' });
    res.status(201).json({ success: true, data: { name: admin.name, email: admin.email } });
  } catch (err) {
    next(err);
  }
});

// All routes below require a valid JWT
router.use(protect);

// ── Admin User Management (superadmin only) ───────────────────────────────────

router.get('/users', isSuperAdmin, async (req, res, next) => {
  try {
    const users = await AdminUser.find().select('-passwordHash').sort({ createdAt: 1 });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

router.post('/users', isSuperAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role = 'admin' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email and password are required' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await AdminUser.create({ name, email, passwordHash, role });
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'ADMIN_USER_CREATED', targetModel: 'AdminUser', targetId: user._id,
      meta: { email: user.email, role: user.role },
    });
    res.status(201).json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Email already in use.' });
    next(err);
  }
});

router.put('/users/:id', isSuperAdmin, async (req, res, next) => {
  try {
    const { name, email, role, isActive, password } = req.body;

    if (req.params.id === req.admin.id && isActive === false) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }
    if (role && role !== 'superadmin') {
      const superCount = await AdminUser.countDocuments({ role: 'superadmin', isActive: true });
      const thisUser = await AdminUser.findById(req.params.id);
      if (thisUser?.role === 'superadmin' && superCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote the only active superadmin.' });
      }
    }

    const update = {};
    if (name     !== undefined) update.name     = name;
    if (email    !== undefined) update.email    = email;
    if (role     !== undefined) update.role     = role;
    if (isActive !== undefined) update.isActive = isActive;
    if (password) update.passwordHash = await bcrypt.hash(password, 12);

    const user = await AdminUser.findByIdAndUpdate(req.params.id, update, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'ADMIN_USER_UPDATED', targetModel: 'AdminUser', targetId: user._id,
      meta: { fields: Object.keys(update) },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Email already in use.' });
    next(err);
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get('/sessions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    const [sessions, total] = await Promise.all([
      Session.find(filter)
        .populate('bundleId', 'name price')
        .populate('operatorId', 'name shortCode')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit)),
      Session.countDocuments(filter),
    ]);
    res.json({ success: true, data: sessions, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/grant', validate(schemas.sessionGrant), async (req, res, next) => {
  try {
    const { macAddress, bundleId, phone, durationMinutes, note } = req.body;
    const bundle = await Bundle.findById(bundleId).populate('operatorId');
    if (!bundle) return res.status(404).json({ success: false, message: 'Bundle not found' });

    const operator = bundle.operatorId || null;
    const overriddenBundle = durationMinutes
      ? { ...bundle.toObject(), durationMinutes }
      : bundle.toObject();

    const session = await createProvisionedSession({
      phone, macAddress, bundle: overriddenBundle, operator, comment: note, usernameSeed: macAddress,
    });

    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'SESSION_GRANTED', targetModel: 'Session', targetId: session._id,
      meta: { macAddress, bundleId, durationMinutes, note },
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

router.delete('/session/:id', async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id).populate('operatorId');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    await removeHotspotUser(session.operatorId, session.username);
    session.status = 'TERMINATED';
    session.mikrotikRemoved = true;
    await session.save();
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'SESSION_TERMINATED', targetModel: 'Session', targetId: session._id,
      meta: { username: session.username, macAddress: session.macAddress },
    });
    res.json({ success: true, message: 'Session terminated' });
  } catch (err) {
    next(err);
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('bundleId', 'name price')
        .populate('operatorId', 'name shortCode')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit)),
      Transaction.countDocuments(filter),
    ]);
    res.json({ success: true, data: transactions, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// ── Bundles ───────────────────────────────────────────────────────────────────

router.get('/bundles', async (req, res, next) => {
  try {
    const filter = { operatorId: req.query.operatorId || null };
    const bundles = await Bundle.find(filter).sort({ price: 1 });
    res.json({ success: true, data: bundles });
  } catch (err) {
    next(err);
  }
});

router.post('/bundles', validate(schemas.bundleCreate), async (req, res, next) => {
  try {
    const bundle = await Bundle.create(req.body);
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'BUNDLE_CREATED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { name: bundle.name, price: bundle.price },
    });
    res.status(201).json({ success: true, data: bundle });
  } catch (err) {
    next(err);
  }
});

router.put('/bundles/:id', validate(schemas.bundleUpdate), async (req, res, next) => {
  try {
    const bundle = await Bundle.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!bundle) return res.status(404).json({ success: false, message: 'Bundle not found' });
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'BUNDLE_UPDATED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { fields: Object.keys(req.body) },
    });
    res.json({ success: true, data: bundle });
  } catch (err) {
    next(err);
  }
});

router.delete('/bundles/:id', isSuperAdmin, async (req, res, next) => {
  try {
    const bundle = await Bundle.findById(req.params.id);
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
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'BUNDLE_DELETED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { name: bundle.name, price: bundle.price },
    });
    res.json({ success: true, message: 'Bundle deleted' });
  } catch (err) {
    next(err);
  }
});

// ── Vouchers ──────────────────────────────────────────────────────────────────

router.get('/vouchers', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const filter = {};
    if (type)   filter.type   = type;
    if (status) filter.status = status;
    const [vouchers, total] = await Promise.all([
      Voucher.find(filter)
        .populate('bundleId', 'name price durationMinutes dataMB')
        .populate('operatorId', 'name shortCode')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit)),
      Voucher.countDocuments(filter),
    ]);
    res.json({ success: true, data: vouchers, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

router.post('/vouchers/generate', isSuperAdmin, validate(schemas.voucherGenerate), async (req, res, next) => {
  try {
    const { bundleId, quantity, maxDevices, expiresAt, type, note } = req.body;
    const bundle = await Bundle.findById(bundleId);
    if (!bundle) return res.status(404).json({ success: false, message: 'Bundle not found' });

    const batchId = `batch_${Date.now()}`;
    const codes = await generateUniqueCodes(quantity);
    await Voucher.insertMany(codes.map((code) => ({
      code, type, bundleId,
      operatorId: bundle.operatorId || null,
      maxDevices,
      expiresAt,
      createdBy: req.admin.id,
      batchId, note,
    })));

    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'VOUCHERS_GENERATED', targetModel: 'Bundle', targetId: bundle._id,
      meta: { batchId, quantity, type, bundleId, maxDevices },
    });
    res.status(201).json({ success: true, batchId, count: codes.length, codes });
  } catch (err) {
    next(err);
  }
});

router.put('/vouchers/:id/revoke', isSuperAdmin, async (req, res, next) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher not found' });
    voucher.status = 'REVOKED';
    await voucher.save();
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'VOUCHER_REVOKED', targetModel: 'Voucher', targetId: voucher._id,
      meta: { code: voucher.code, batchId: voucher.batchId },
    });
    res.json({ success: true, message: 'Voucher revoked' });
  } catch (err) {
    next(err);
  }
});

router.get('/vouchers/export', async (req, res, next) => {
  try {
    const { batchId, type, status } = req.query;
    const filter = {};
    if (batchId) filter.batchId = batchId;
    if (type)    filter.type    = type;
    if (status)  filter.status  = status;

    const vouchers = await Voucher.find(filter)
      .populate('bundleId', 'name price')
      .populate('operatorId', 'name shortCode')
      .sort({ createdAt: -1 })
      .limit(5000);

    const rows = [
      ['Code', 'Type', 'Bundle', 'Operator', 'Price (KES)', 'Status', 'Max Devices', 'Redeemed', 'Expires', 'Created', 'Note'],
      ...vouchers.map((v) => [
        v.code, v.type, v.bundleId?.name || '', v.operatorId?.shortCode || 'GLOBAL', v.bundleId?.price || '',
        v.status, v.maxDevices, v.redemptions.length,
        v.expiresAt ? v.expiresAt.toISOString().slice(0, 10) : 'Never',
        v.createdAt.toISOString().slice(0, 10), v.note,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vouchers.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── Operators ─────────────────────────────────────────────────────────────────

router.get('/operators', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status.toUpperCase();
    const operators = await Operator.find(filter).sort({ createdAt: -1 }).select('-passwordHash -mikrotikPass');
    res.json({ success: true, data: operators });
  } catch (err) {
    next(err);
  }
});

router.post('/operators', isSuperAdmin, validate(schemas.operatorCreate), async (req, res, next) => {
  try {
    const { portalPassword, ...operatorData } = req.body;
    if (portalPassword) {
      operatorData.passwordHash = await bcrypt.hash(portalPassword, 12);
    }
    const op = await Operator.create(operatorData);
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'OPERATOR_CREATED', targetModel: 'Operator', targetId: op._id,
      meta: { shortCode: op.shortCode, name: op.name },
    });
    res.status(201).json({ success: true, data: op });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Short code already taken.' });
    next(err);
  }
});

router.put('/operators/:id', isSuperAdmin, validate(schemas.operatorUpdate), async (req, res, next) => {
  try {
    const { portalPassword, ...rest } = req.body;
    if (portalPassword) {
      rest.passwordHash = await bcrypt.hash(portalPassword, 12);
    }
    const op = await Operator.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true });
    if (!op) return res.status(404).json({ success: false, message: 'Operator not found' });
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'OPERATOR_UPDATED', targetModel: 'Operator', targetId: op._id,
      meta: { fields: Object.keys(rest) },
    });
    res.json({ success: true, data: op });
  } catch (err) {
    next(err);
  }
});

router.post('/operators/:id/test-mikrotik', isSuperAdmin, async (req, res, next) => {
  try {
    const op = await Operator.findById(req.params.id);
    if (!op) return res.status(404).json({ success: false, message: 'Operator not found' });

    // Allow caller to pass unsaved form values so the test works before saving
    const override = {};
    if (req.body.mikrotikHost) override.mikrotikHost = req.body.mikrotikHost;
    if (req.body.mikrotikUser) override.mikrotikUser = req.body.mikrotikUser;
    if (req.body.mikrotikPass) override.mikrotikPass = req.body.mikrotikPass;
    if (req.body.mikrotikPort) override.mikrotikPort = Number(req.body.mikrotikPort);

    const target = Object.keys(override).length ? { ...op.toObject(), ...override } : op;
    const result = await testConnection(target);
    res.json({ success: true, message: 'Connection successful', data: result });
  } catch (err) {
    // Map low-level errors to friendly messages
    const raw = err.message || '';
    let friendly = raw;
    if (/ECONNREFUSED/.test(raw))       friendly = `Connection refused — is the RouterOS API service enabled on port ${err.port || 8728}? (IP → Services → api)`;
    else if (/ETIMEDOUT|ECONNRESET/.test(raw)) friendly = 'Router unreachable — check the IP address and that this server can reach the router.';
    else if (/login|cannot log in|bad credentials|invalid user/i.test(raw)) friendly = 'Login failed — check the API username and password.';
    else if (/ENOTFOUND|getaddrinfo/.test(raw)) friendly = 'Hostname not found — use an IP address, not a domain name.';
    res.status(400).json({ success: false, message: friendly });
  }
});

// ── Settlements ───────────────────────────────────────────────────────────────

router.get('/settlements', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, operatorId, status } = req.query;
    const filter = {};
    if (operatorId) filter.operatorId = operatorId;
    if (status)     filter.status     = status;
    const [settlements, total] = await Promise.all([
      Settlement.find(filter)
        .populate('operatorId', 'name shortCode ownerPhone')
        .populate('triggeredBy', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit)),
      Settlement.countDocuments(filter),
    ]);
    res.json({ success: true, data: settlements, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

router.post('/settlements', isSuperAdmin, async (req, res, next) => {
  try {
    const { operatorId, amount, method = 'B2C', notes } = req.body;
    if (!operatorId || !amount) {
      return res.status(400).json({ success: false, message: 'operatorId and amount are required' });
    }
    const settlement = await settleOperator({
      operatorId, amount: Number(amount), method, adminId: req.admin.id, notes,
    });
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'SETTLEMENT_CREATED', targetModel: 'Settlement', targetId: settlement._id,
      meta: { operatorId, amount: settlement.amount, method },
    });
    res.status(201).json({ success: true, data: settlement });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/settlements/:id/mark-paid', isSuperAdmin, async (req, res, next) => {
  try {
    const s = await Settlement.findById(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Settlement not found' });
    s.status   = 'PAID';
    s.paidAt   = new Date();
    s.mpesaRef = req.body.mpesaRef || s.mpesaRef;
    s.notes    = req.body.notes    || s.notes;
    await s.save();
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'SETTLEMENT_MARKED_PAID', targetModel: 'Settlement', targetId: s._id,
      meta: { mpesaRef: s.mpesaRef, amount: s.amount },
    });
    res.json({ success: true, data: s });
  } catch (err) {
    next(err);
  }
});

// ── Audit Logs ────────────────────────────────────────────────────────────────

router.get('/audit-logs', isSuperAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, actorId } = req.query;
    const filter = {};
    if (action)  filter.action = action;
    if (actorId) filter.actor  = actorId;

    const [logs, total] = await Promise.all([
      AdminLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(clampLimit(limit))
        .select('-__v'),
      AdminLog.countDocuments(filter),
    ]);
    res.json({ success: true, data: logs, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const queries = [
      Session.countDocuments({ status: 'ACTIVE' }),
      Transaction.aggregate([
        { $match: { status: 'SUCCESS', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.countDocuments({ status: 'SUCCESS' }),
    ];

    if (req.admin.role === 'superadmin') {
      queries.push(
        Transaction.aggregate([
          { $match: { status: 'SUCCESS', createdAt: { $gte: todayStart } } },
          { $group: { _id: null, total: { $sum: '$platformFee' } } },
        ]),
        Transaction.aggregate([
          { $match: { status: 'SUCCESS', createdAt: { $gte: monthStart } } },
          { $group: { _id: null, total: { $sum: '$platformFee' } } },
        ]),
        Transaction.aggregate([
          { $match: { status: 'SUCCESS' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Settlement.aggregate([
          { $match: { status: { $in: ['PENDING', 'PROCESSING'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Operator.countDocuments({ status: 'ACTIVE' }),
      );
    }

    const results = await Promise.all(queries);
    const [activeSessions, todayRevenueRes, totalTransactions] = results;

    const data = {
      activeSessions,
      todayRevenue: todayRevenueRes[0]?.total || 0,
      totalTransactions,
    };

    if (req.admin.role === 'superadmin') {
      const [, , , feesToday, feesMonth, allTimeVolume, pendingSettlements, activeOperators] = results;
      data.platformFeesToday    = feesToday[0]?.total          || 0;
      data.platformFeesMonth    = feesMonth[0]?.total          || 0;
      data.allTimeVolume        = allTimeVolume[0]?.total      || 0;
      data.pendingSettlements   = pendingSettlements[0]?.total || 0;
      data.activeOperators      = activeOperators;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
