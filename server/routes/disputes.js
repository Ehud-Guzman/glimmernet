const express = require('express');
const Dispute = require('../models/Dispute');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Operator = require('../models/Operator');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { protectOperator } = require('../middleware/operatorAuthMiddleware');
const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
const isSuperAdmin = requireRole('superadmin');
const clampLimit = (v, max = 100) => Math.min(Math.max(1, Number(v) || 20), max);

// ── Customer-facing: file a dispute (no auth needed — phone is the identity) ──

// POST /api/v1/disputes
router.post('/', async (req, res, next) => {
  try {
    const { phone, issue, description = '', mpesaReceiptNumber = '', transactionId, operatorShortCode } = req.body;
    if (!phone || !issue) {
      return res.status(400).json({ success: false, message: 'phone and issue are required' });
    }

    let operatorId = null;
    if (operatorShortCode) {
      const op = await Operator.findOne({ shortCode: operatorShortCode.toUpperCase(), status: 'ACTIVE' });
      if (op) operatorId = op._id;
    }

    // Optionally link to a specific transaction
    let txnId = null;
    if (transactionId) {
      const txn = await Transaction.findById(transactionId);
      if (txn && txn.phone === phone) txnId = txn._id;
    }

    // Rate-limit: max 3 open disputes per phone
    const openCount = await Dispute.countDocuments({ phone, status: { $in: ['OPEN', 'INVESTIGATING'] } });
    if (openCount >= 3) {
      return res.status(429).json({ success: false, message: 'You already have open disputes being reviewed. Please wait for resolution before filing new ones.' });
    }

    const dispute = await Dispute.create({ phone, operatorId, transactionId: txnId, issue, description, mpesaReceiptNumber });
    logger.info('Dispute filed', { phone, issue, disputeId: dispute._id });
    res.status(201).json({ success: true, data: { _id: dispute._id, status: dispute.status, issue: dispute.issue } });
  } catch (err) { next(err); }
});

// GET /api/v1/disputes/my?phone=07xx — customer checks their own disputes
router.get('/my', async (req, res, next) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
    const disputes = await Dispute.find({ phone }).sort({ createdAt: -1 }).limit(10)
      .select('-resolvedBy -__v');
    res.json({ success: true, data: disputes });
  } catch (err) { next(err); }
});

// ── Admin: full CRUD ──────────────────────────────────────────────────────────

router.use(protect);

// GET /api/v1/disputes — admin list
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, operatorId } = req.query;
    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (operatorId) filter.operatorId = operatorId;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('operatorId', 'name shortCode')
        .populate('transactionId', 'amount mpesaReceiptNumber status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * clampLimit(limit))
        .limit(clampLimit(limit)),
      Dispute.countDocuments(filter),
    ]);
    res.json({ success: true, data: disputes, total, page: Number(page) });
  } catch (err) { next(err); }
});

// PATCH /api/v1/disputes/:id/status — update status + resolution
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, resolution = '', refundIssued = false, refundAmount = 0 } = req.body;
    if (!['INVESTIGATING', 'RESOLVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be INVESTIGATING, RESOLVED, or REJECTED' });
    }
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
    if (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Dispute is already closed' });
    }

    dispute.status = status;
    if (resolution) dispute.resolution = resolution;
    if (status === 'RESOLVED' || status === 'REJECTED') {
      dispute.resolvedAt = new Date();
      dispute.resolvedBy = req.admin.id;
      dispute.resolvedByModel = 'AdminUser';
      dispute.refundIssued = refundIssued;
      dispute.refundAmount = refundAmount;
    }
    await dispute.save();

    await audit({ actor: req.admin.id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'DISPUTE_UPDATED', targetModel: 'Dispute', targetId: dispute._id,
      meta: { status, resolution, refundIssued, refundAmount } });

    res.json({ success: true, data: dispute });
  } catch (err) { next(err); }
});

// GET /api/v1/disputes/stats — open/resolved counts
router.get('/stats', async (req, res, next) => {
  try {
    const [open, investigating, resolved, rejected] = await Promise.all([
      Dispute.countDocuments({ status: 'OPEN' }),
      Dispute.countDocuments({ status: 'INVESTIGATING' }),
      Dispute.countDocuments({ status: 'RESOLVED' }),
      Dispute.countDocuments({ status: 'REJECTED' }),
    ]);
    res.json({ success: true, data: { open, investigating, resolved, rejected, total: open + investigating + resolved + rejected } });
  } catch (err) { next(err); }
});

module.exports = router;
