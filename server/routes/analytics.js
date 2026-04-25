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
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
            day:   { $dayOfMonth: '$createdAt' },
          },
          gross:       { $sum: '$amount' },
          platformFee: { $sum: '$platformFee' },
          operatorNet: { $sum: '$operatorNet' },
          count:       { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    const data = rows.map((r) => ({
      date: `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`,
      gross: r.gross,
      platformFee: r.platformFee,
      operatorNet: r.operatorNet,
      count: r.count,
    }));

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

module.exports = router;
