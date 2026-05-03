const express = require('express');
const { getBalance, topUp, getHistory } = require('../services/walletService');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/v1/wallet/balance?phone=07xx&op=SHORTCODE
router.get('/balance', async (req, res, next) => {
  try {
    const { phone, op } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
    const balance = await getBalance(phone, op || null);
    res.json({ success: true, data: balance });
  } catch (err) { next(err); }
});

// GET /api/v1/wallet/history?phone=07xx&op=SHORTCODE
router.get('/history', async (req, res, next) => {
  try {
    const { phone, op, limit = 20 } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
    const history = await getHistory(phone, op || null, Math.min(Number(limit), 50));
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
});

// POST /api/v1/wallet/top-up — called by Daraja callback handler after a wallet top-up payment
// In practice this endpoint is called internally; expose for admin use
router.post('/top-up', protect, async (req, res, next) => {
  try {
    const { phone, operatorId, amountKES, transactionId, note } = req.body;
    if (!phone || !amountKES || amountKES <= 0) {
      return res.status(400).json({ success: false, message: 'phone and amountKES are required' });
    }
    const result = await topUp({ phone, operatorId: operatorId || null, amountKES: Number(amountKES), transactionId, note });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
