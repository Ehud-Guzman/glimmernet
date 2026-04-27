const express = require('express');
const Bundle = require('../models/Bundle');
const Operator = require('../models/Operator');
const configService = require('../services/configService');
const { getNairobiHour } = require('../utils/helpers');

const router = express.Router();

// Public — portal passes ?op=SHORTCODE; returns that operator's bundles + branding.
// Only falls back to global bundles when no operator code is supplied.
router.get('/', async (req, res, next) => {
  try {
    let operatorId = null;
    let branding = null;

    if (req.query.op) {
      const op = await Operator.findOne({ shortCode: req.query.op.toUpperCase(), status: 'ACTIVE' });
      if (op) {
        operatorId = op._id;
        const brandName = op.brandName || op.name;
        branding = {
          brandName,
          operatorName: op.name,
          brandTagline: op.brandTagline || '',
          logoUrl: op.logoUrl || '',
          accentColor: op.accentColor || '#00c853',
          hotspotLoginUrl: op.hotspotLoginUrl || '',
          supportPhone: op.supportPhone || await configService.get('support_phone', '') || '',
          supportWhatsapp: op.supportWhatsapp || '',
          supportEmail: op.supportEmail || '',
          trialMinutes: op.trialMinutes || 0,
        };
      } else {
        return res.json({ success: true, data: [], branding: null, message: 'Operator not found' });
      }
    }

    let allBundles = await Bundle.find({ isActive: true, operatorId }).sort({ price: 1 }).select('-__v');

    // Operator has no custom bundles — serve the platform's global catalog instead
    let usingGlobalFallback = false;
    if (operatorId && allBundles.length === 0) {
      allBundles = await Bundle.find({ isActive: true, operatorId: null }).sort({ price: 1 }).select('-__v');
      usingGlobalFallback = true;
    }

    // Filter happy-hour bundles: only show bundles currently within their time window
    const nairobiHour = getNairobiHour();
    const bundles = allBundles.filter((b) => {
      if (b.validFromHour == null) return true; // no time restriction
      const from = b.validFromHour;
      const to = b.validToHour;
      // Wraps midnight (e.g. 22:00–06:00)
      if (from > to) return nairobiHour >= from || nairobiHour < to;
      return nairobiHour >= from && nairobiHour < to;
    });

    res.json({ success: true, data: bundles, branding, usingGlobalFallback });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
