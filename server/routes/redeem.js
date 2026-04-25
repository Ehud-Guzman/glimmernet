const express = require('express');
const Operator = require('../models/Operator');
const { redeemVoucher } = require('../services/voucherService');

const router = express.Router();

router.post('/', async (req, res) => {
  const { code, mac, phone, operatorShortCode } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Code is required.' });
  }

  try {
    let operatorId = null;
    if (operatorShortCode) {
      const op = await Operator.findOne({ shortCode: operatorShortCode.toUpperCase(), status: 'ACTIVE' });
      if (!op) {
        return res.status(404).json({ success: false, message: 'Operator not found for this portal.' });
      }
      operatorId = op._id;
    }

    const result = await redeemVoucher({ code, mac: mac || '', phone: phone || '', operatorId });
    res.json({
      success: true,
      username: result.username,
      password: result.password,
      expiresAt: result.expiresAt,
      bundle: {
        name: result.bundle.name,
        durationMinutes: result.bundle.durationMinutes,
        dataMB: result.bundle.dataMB,
        speedLimitMbps: result.bundle.speedLimitMbps,
      },
      resumed: result.resumed,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

module.exports = router;
