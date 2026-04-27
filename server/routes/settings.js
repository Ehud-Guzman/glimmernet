const express = require('express');
const Setting = require('../models/Setting');
const configService = require('../services/configService');
const { invalidateDarajaToken } = require('../services/darajaService');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { audit } = require('../utils/audit');

// Keys whose values must not appear in audit logs
const SENSITIVE_SETTING_KEYS = new Set([
  'daraja_consumer_key', 'daraja_consumer_secret', 'daraja_passkey',
  'daraja_b2c_security_credential', 'at_api_key', 'mikrotik_pass',
]);

const DARAJA_KEYS = new Set([
  'daraja_env', 'daraja_consumer_key', 'daraja_consumer_secret',
  'daraja_shortcode', 'daraja_passkey',
]);

const router = express.Router();
const isSuperAdmin = requireRole('superadmin');

// All settings shipped with the platform.
// seedDefaults uses $setOnInsert — existing values are NEVER overwritten.
// Adding a new entry here will insert it on next startup without touching saved data.
const DEFAULTS = [
  // ── Billing ──────────────────────────────────────────────────────────────────
  {
    key: 'platform_fee_percent',
    value: 10,
    type: 'number',
    label: 'Platform Fee (%)',
    description: 'Percentage taken from each transaction as platform revenue.',
    group: 'billing',
  },

  // ── M-Pesa / Daraja ───────────────────────────────────────────────────────────
  {
    key: 'daraja_env',
    value: 'sandbox',
    type: 'string',
    label: 'Daraja Environment',
    description: '"sandbox" for testing, "production" for live payments. Blocked from switching to production outside NODE_ENV=production.',
    group: 'mpesa',
  },
  {
    key: 'daraja_consumer_key',
    value: '',
    type: 'string',
    label: 'Daraja Consumer Key',
    description: 'OAuth consumer key from your Daraja app.',
    group: 'mpesa',
  },
  {
    key: 'daraja_consumer_secret',
    value: '',
    type: 'string',
    label: 'Daraja Consumer Secret',
    description: 'OAuth consumer secret from your Daraja app.',
    group: 'mpesa',
  },
  {
    key: 'daraja_shortcode',
    value: '',
    type: 'string',
    label: 'M-Pesa Shortcode (Paybill / Till)',
    description: 'Safaricom Business Shortcode used for STK push.',
    group: 'mpesa',
  },
  {
    key: 'daraja_passkey',
    value: '',
    type: 'string',
    label: 'Lipa Na M-Pesa Passkey',
    description: 'Lipa Na M-Pesa online passkey from Daraja portal.',
    group: 'mpesa',
  },
  {
    key: 'app_url',
    value: '',
    type: 'string',
    label: 'App Public URL',
    description: 'Public HTTPS base URL of this server (e.g. https://billing.yourdomain.com). Used as the Daraja callback base.',
    group: 'mpesa',
  },
  {
    key: 'stk_account_ref',
    value: 'WiFi',
    type: 'string',
    label: 'STK Account Reference',
    description: 'Account reference shown on the M-Pesa STK prompt (max 12 chars).',
    group: 'mpesa',
  },
  {
    key: 'stk_transaction_desc',
    value: 'WiFi Access',
    type: 'string',
    label: 'STK Transaction Description',
    description: 'Short description on the M-Pesa STK popup.',
    group: 'mpesa',
  },
  {
    key: 'daraja_b2c_initiator_name',
    value: '',
    type: 'string',
    label: 'B2C Initiator Name',
    description: 'Daraja B2C initiator username. Required for automatic operator payouts. Leave blank to use MANUAL settlements.',
    group: 'mpesa',
  },
  {
    key: 'daraja_b2c_security_credential',
    value: '',
    type: 'string',
    label: 'B2C Security Credential',
    description: 'Initiator password encrypted with the Safaricom public key. Required for B2C payouts.',
    group: 'mpesa',
  },

  // ── MikroTik ──────────────────────────────────────────────────────────────────
  {
    key: 'mikrotik_host',
    value: '',
    type: 'string',
    label: 'Default MikroTik Host',
    description: 'Fallback RouterOS IP/hostname when an operator has no router configured.',
    group: 'mikrotik',
  },
  {
    key: 'mikrotik_user',
    value: 'admin',
    type: 'string',
    label: 'Default MikroTik User',
    description: 'RouterOS API username for the default router.',
    group: 'mikrotik',
  },
  {
    key: 'mikrotik_pass',
    value: '',
    type: 'string',
    label: 'Default MikroTik Password',
    description: 'RouterOS API password for the default router.',
    group: 'mikrotik',
  },
  {
    key: 'mikrotik_port',
    value: 8728,
    type: 'number',
    label: 'Default MikroTik API Port',
    description: 'RouterOS API port (default 8728; use 8729 for SSL).',
    group: 'mikrotik',
  },

  // ── SMS Notifications ─────────────────────────────────────────────────────────
  {
    key: 'sms_enabled',
    value: false,
    type: 'boolean',
    label: 'SMS Receipts Enabled',
    description: 'Send M-Pesa payment receipts via Africa\'s Talking SMS.',
    group: 'notifications',
  },
  {
    key: 'at_api_key',
    value: '',
    type: 'string',
    label: 'Africa\'s Talking API Key',
    description: 'AT API key for SMS sending. Leave blank to disable SMS.',
    group: 'notifications',
  },
  {
    key: 'at_username',
    value: 'sandbox',
    type: 'string',
    label: 'Africa\'s Talking Username',
    description: 'AT account username (use "sandbox" for testing).',
    group: 'notifications',
  },
  {
    key: 'at_sandbox',
    value: true,
    type: 'boolean',
    label: 'AT Sandbox Mode',
    description: 'Use the Africa\'s Talking sandbox API. Disable when going live.',
    group: 'notifications',
  },
  {
    key: 'at_sender_id',
    value: '',
    type: 'string',
    label: 'AT Sender ID',
    description: 'Custom SMS sender ID (leave blank to use AT default). Must be registered with AT.',
    group: 'notifications',
  },

  // ── Support ───────────────────────────────────────────────────────────────────
  {
    key: 'support_phone',
    value: '',
    type: 'string',
    label: 'Support Phone',
    description: 'Default support phone shown on portal when an operator has none set.',
    group: 'support',
  },
  {
    key: 'support_email',
    value: '',
    type: 'string',
    label: 'Support Email',
    description: 'Default support email shown on portal when an operator has none set.',
    group: 'support',
  },

  // ── Security ──────────────────────────────────────────────────────────────────
  {
    key: 'allowed_origins',
    value: '',
    type: 'string',
    label: 'Allowed Origins (CORS)',
    description: 'Comma-separated list of origins allowed to call the API. Leave blank to allow localhost dev origins only.',
    group: 'security',
  },
];

/**
 * Upsert defaults — only inserts a key if it does not already exist in the DB.
 * Safe to call on every startup; existing admin-configured values are never touched.
 */
async function seedDefaults() {
  const ops = DEFAULTS.map((s) =>
    Setting.updateOne({ key: s.key }, { $setOnInsert: s }, { upsert: true })
  );
  await Promise.all(ops);
}

// GET /api/v1/admin/settings — fetch all settings (superadmin)
router.get('/', protect, isSuperAdmin, async (req, res, next) => {
  try {
    const settings = await Setting.find().sort({ group: 1, key: 1 }).select('-__v');
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/settings/:key — update a single setting (superadmin)
router.put('/:key', protect, isSuperAdmin, async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'value is required' });
    }
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { value },
      { new: true, runValidators: true }
    );
    if (!setting) {
      return res.status(404).json({ success: false, message: 'Setting key not found' });
    }
    configService.invalidate();
    if (DARAJA_KEYS.has(req.params.key)) invalidateDarajaToken();

    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'SETTING_UPDATED', targetModel: 'Setting', targetId: setting._id,
      meta: {
        key: req.params.key,
        value: SENSITIVE_SETTING_KEYS.has(req.params.key) ? '[REDACTED]' : value,
      },
    });

    res.json({ success: true, data: setting });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/settings — batch update (superadmin)
// Body: { settings: { key: value, ... } }
router.put('/', protect, isSuperAdmin, async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'settings object is required' });
    }
    const ops = Object.entries(settings).map(([key, value]) =>
      Setting.findOneAndUpdate({ key }, { value }, { new: true })
    );
    await Promise.all(ops);
    configService.invalidate();
    if (Object.keys(settings).some((k) => DARAJA_KEYS.has(k))) invalidateDarajaToken();

    const redactedMeta = {};
    for (const [k, v] of Object.entries(settings)) {
      redactedMeta[k] = SENSITIVE_SETTING_KEYS.has(k) ? '[REDACTED]' : v;
    }
    await audit({
      actor: req.admin._id, actorModel: 'AdminUser', actorName: req.admin.name,
      action: 'SETTINGS_BATCH_UPDATED',
      meta: { keys: Object.keys(settings), values: redactedMeta },
    });

    const updated = await Setting.find().sort({ group: 1, key: 1 }).select('-__v');
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.seedDefaults = seedDefaults;
