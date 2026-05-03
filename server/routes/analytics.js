const express = require('express');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Bundle = require('../models/Bundle');
const Operator = require('../models/Operator');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);
router.use(requireRole('superadmin'));

// GET /api/v1/admin/analytics/revenue  — 30-day daily gross revenue
router.get('/revenue', async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const rows = await Transaction.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            year:  { $year:  { date: '$createdAt', timezone: 'Africa/Nairobi' } },
            month: { $month: { date: '$createdAt', timezone: 'Africa/Nairobi' } },
            day:   { $dayOfMonth: { date: '$createdAt', timezone: 'Africa/Nairobi' } },
          },
          gross:       { $sum: '$amount' },
          platformFee: { $sum: '$platformFee' },
          operatorNet: { $sum: '$operatorNet' },
          count:       { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    const toNairobiDateKey = (d) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);

    const map = {};
    rows.forEach((r) => {
      const key = `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`;
      map[key] = r;
    });

    // Anchor to midnight Nairobi so gap-fill keys align with aggregation timezone
    const todayNairobiStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
    const anchorSince = new Date(`${todayNairobiStr}T00:00:00+03:00`);
    anchorSince.setDate(anchorSince.getDate() - 29);

    const data = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(anchorSince.getTime() + i * 24 * 60 * 60 * 1000);
      const key = toNairobiDateKey(d);
      const r = map[key];
      return { date: key, gross: r?.gross || 0, platformFee: r?.platformFee || 0, operatorNet: r?.operatorNet || 0, count: r?.count || 0 };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/analytics/bundles  — revenue + session count by bundle
router.get('/bundles', async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 29);

    const rows = await Transaction.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: since } } },
      {
        $group: {
          _id:   '$bundleId',
          gross: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'bundles', localField: '_id', foreignField: '_id', as: 'bundle',
        },
      },
      { $unwind: { path: '$bundle', preserveNullAndEmptyArrays: true } },
      { $sort: { gross: -1 } },
      { $limit: 20 },
    ]);

    const data = rows.map((r) => ({
      bundleId: r._id,
      name:  r.bundle?.name  || 'Unknown',
      price: r.bundle?.price || 0,
      gross: r.gross,
      count: r.count,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/analytics/hourly  — transaction count by hour of day (0-23)
router.get('/hourly', async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 29);

    const rows = await Transaction.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: since } } },
      {
        $group: {
          _id:   { $hour: { date: '$createdAt', timezone: 'Africa/Nairobi' } },
          count: { $sum: 1 },
          gross: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill gaps so the chart always has 24 bars
    const map = Object.fromEntries(rows.map((r) => [r._id, r]));
    const data = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: map[h]?.count || 0,
      gross: map[h]?.gross || 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/analytics/operators  — revenue leaderboard
router.get('/operators', async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 29);

    const rows = await Transaction.aggregate([
      { $match: { status: 'SUCCESS', operatorId: { $ne: null }, createdAt: { $gte: since } } },
      {
        $group: {
          _id:         '$operatorId',
          gross:       { $sum: '$amount' },
          platformFee: { $sum: '$platformFee' },
          operatorNet: { $sum: '$operatorNet' },
          count:       { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'operators', localField: '_id', foreignField: '_id', as: 'op',
        },
      },
      { $unwind: { path: '$op', preserveNullAndEmptyArrays: true } },
      { $sort: { gross: -1 } },
      { $limit: 20 },
    ]);

    const data = rows.map((r) => ({
      operatorId:  r._id,
      name:        r.op?.name || 'Unknown',
      shortCode:   r.op?.shortCode || '',
      gross:       r.gross,
      platformFee: r.platformFee,
      operatorNet: r.operatorNet,
      count:       r.count,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/analytics/devices  — trial conversion + repeat rate
router.get('/devices', async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 29);

    const [totalSessions, trialSessions, repeatDevices] = await Promise.all([
      Session.countDocuments({ createdAt: { $gte: since } }),
      Session.countDocuments({ createdAt: { $gte: since }, isTrial: true }),
      // devices that appear more than once (repeat customers)
      Session.aggregate([
        { $match: { createdAt: { $gte: since }, macAddress: { $nin: ['', null] }, isTrial: { $ne: true } } },
        { $group: { _id: '$macAddress', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: 'total' },
      ]),
    ]);

    const paidSessions   = totalSessions - trialSessions;
    const repeatCount    = repeatDevices[0]?.total || 0;
    const conversionRate = trialSessions > 0
      ? Math.round((paidSessions / (paidSessions + trialSessions)) * 100)
      : null;

    res.json({
      success: true,
      data: {
        totalSessions,
        trialSessions,
        paidSessions,
        repeatDevices: repeatCount,
        conversionRate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/analytics/churn  — retention and churn metrics
router.get('/churn', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [uniquePhones, returningPhones, totalTxns] = await Promise.all([
      Transaction.distinct('phone', { status: 'SUCCESS', createdAt: { $gte: since } }),
      Transaction.aggregate([
        { $match: { status: 'SUCCESS', createdAt: { $gte: since } } },
        { $group: { _id: '$phone', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: 'total' },
      ]),
      Transaction.countDocuments({ status: 'SUCCESS', createdAt: { $gte: since } }),
    ]);

    const uniqueCount  = uniquePhones.length;
    const returningCount = returningPhones[0]?.total || 0;
    const newCount     = uniqueCount - returningCount;
    const retentionRate = uniqueCount > 0 ? Math.round((returningCount / uniqueCount) * 100) : 0;

    // Average sessions per paying customer
    const avgSessions = uniqueCount > 0 ? Math.round((totalTxns / uniqueCount) * 100) / 100 : 0;

    res.json({ success: true, data: { days, uniqueCustomers: uniqueCount, returningCustomers: returningCount, newCustomers: newCount, retentionRate, totalTransactions: totalTxns, avgSessionsPerCustomer: avgSessions } });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/analytics/bandwidth  — total GB served per operator (from captured session bytes)
router.get('/bandwidth', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const Session = require('../models/Session');

    const rows = await Session.aggregate([
      { $match: { createdAt: { $gte: since }, $or: [{ bytesIn: { $gt: 0 } }, { bytesOut: { $gt: 0 } }] } },
      {
        $group: {
          _id: '$operatorId',
          totalBytesIn:  { $sum: '$bytesIn' },
          totalBytesOut: { $sum: '$bytesOut' },
          sessionCount:  { $sum: 1 },
        },
      },
      { $lookup: { from: 'operators', localField: '_id', foreignField: '_id', as: 'op' } },
      { $unwind: { path: '$op', preserveNullAndEmptyArrays: true } },
      { $sort: { totalBytesOut: -1 } },
    ]);

    const toGB = (b) => Math.round((b / (1024 ** 3)) * 100) / 100;

    const data = rows.map((r) => ({
      operatorId: r._id,
      name: r.op?.name || 'Unknown',
      shortCode: r.op?.shortCode || '',
      gbIn:  toGB(r.totalBytesIn),
      gbOut: toGB(r.totalBytesOut),
      gbTotal: toGB(r.totalBytesIn + r.totalBytesOut),
      sessions: r.sessionCount,
    }));

    res.json({ success: true, data, days });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/analytics/reconciliation  — stuck settlements and reconciliation history
router.get('/reconciliation', async (req, res, next) => {
  try {
    const Settlement = require('../models/Settlement');
    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min

    const [stuck, recentFailed, recentPaid] = await Promise.all([
      Settlement.find({ status: 'PROCESSING', createdAt: { $lt: cutoff } })
        .populate('operatorId', 'name shortCode ownerPhone')
        .sort({ createdAt: 1 })
        .limit(50),
      Settlement.find({ status: 'FAILED', updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .populate('operatorId', 'name shortCode')
        .sort({ updatedAt: -1 })
        .limit(20),
      Settlement.countDocuments({ status: 'PAID', updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    ]);

    res.json({ success: true, data: { stuckSettlements: stuck, recentFailures: recentFailed, paidLast24h: recentPaid } });
  } catch (err) { next(err); }
});

module.exports = router;
