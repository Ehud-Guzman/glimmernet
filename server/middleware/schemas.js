const Joi = require('joi');

// Reusable primitives
const objectId = Joi.string().hex().length(24);
const phone = Joi.string()
  .trim()
  .pattern(/^(\+?254[17]\d{8}|0[17]\d{8})$/)
  .messages({ 'string.pattern.base': 'Enter a valid Kenyan number (07XXXXXXXX, 01XXXXXXXX, or 254…)' });

const mac = Joi.string().trim().uppercase()
  .pattern(/^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/)
  .messages({ 'string.pattern.base': 'Enter a valid MAC address (XX:XX:XX:XX:XX:XX)' });

// Blocks loopback and cloud-metadata IPs; MikroTik routers on private LANs (192.168.x.x etc.) remain allowed.
const safeMikrotikHost = Joi.string().trim().allow('', null).custom((val, helpers) => {
  if (!val) return val;
  const v = val.toLowerCase().replace(/^https?:\/\//, '');
  if (/^(localhost$|127\.|0\.0\.0\.0|169\.254\.|::1$)/.test(v)) return helpers.error('any.invalid');
  return val;
}).messages({ 'any.invalid': 'Invalid MikroTik host — loopback/metadata addresses are not allowed.' });

// Blocks SSRF targets in webhook URLs — operators cannot point webhooks at internal/metadata hosts.
const safeWebhookUrl = Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).custom((val, helpers) => {
  if (!val) return val;
  try {
    const { hostname } = new URL(val);
    const h = hostname.toLowerCase();
    if (
      /^(localhost|127\.|0\.0\.0\.0|169\.254\.|::1$|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)
    ) return helpers.error('any.invalid');
  } catch {
    return helpers.error('any.invalid');
  }
  return val;
}).messages({ 'any.invalid': 'Webhook URL must be a public HTTPS/HTTP address — private/loopback IPs are not allowed.' });

// Cross-field check: validFromHour === validToHour is a zero-length window (never active).
const happyHourGuard = (val, helpers) => {
  if (val.validFromHour != null && val.validToHour != null && val.validFromHour === val.validToHour) {
    return helpers.message('"validToHour" cannot equal "validFromHour" — that would create a zero-length time window.');
  }
  return val;
};

// ── Payment ───────────────────────────────────────────────────────────────────

const paymentInitiate = Joi.object({
  phone: phone.required(),
  bundleId: objectId.required(),
  mac: mac.allow('', null).default(''),
  operatorShortCode: Joi.string().trim().uppercase().allow('', null).default(''),
});

// ── Bundles ───────────────────────────────────────────────────────────────────

const bundleFields = {
  multiDevice:     Joi.boolean().default(false),
  maxDevices:      Joi.number().integer().min(1).default(1),
  validFromHour:   Joi.number().integer().min(0).max(23).allow(null).default(null),
  validToHour:     Joi.number().integer().min(0).max(23).allow(null).default(null),
};

const bundleCreate = Joi.object({
  name:            Joi.string().trim().max(100).required(),
  price:           Joi.number().positive().required(),
  mikrotikProfile: Joi.string().trim().max(50).required(),
  durationMinutes: Joi.number().integer().min(1).allow(null).default(null),
  dataMB:          Joi.number().integer().min(1).allow(null).default(null),
  speedLimitMbps:  Joi.number().min(0).allow(null).default(null),
  isActive:        Joi.boolean().default(true),
  operatorId:      Joi.alternatives().try(objectId, Joi.valid(null, '')).default(null),
  ...bundleFields,
}).custom(happyHourGuard);

const bundleUpdate = Joi.object({
  name:            Joi.string().trim().max(100),
  price:           Joi.number().positive(),
  mikrotikProfile: Joi.string().trim().max(50),
  durationMinutes: Joi.number().integer().min(1).allow(null),
  dataMB:          Joi.number().integer().min(1).allow(null),
  speedLimitMbps:  Joi.number().min(0).allow(null),
  isActive:        Joi.boolean(),
  operatorId:      Joi.alternatives().try(objectId, Joi.valid(null, '')),
  multiDevice:     Joi.boolean(),
  maxDevices:      Joi.number().integer().min(1),
  validFromHour:   Joi.number().integer().min(0).max(23).allow(null),
  validToHour:     Joi.number().integer().min(0).max(23).allow(null),
}).custom(happyHourGuard);

// Operator portal bundles — operatorId is always set from JWT, never from body
const operatorBundleCreate = Joi.object({
  name:            Joi.string().trim().max(100).required(),
  price:           Joi.number().positive().required(),
  mikrotikProfile: Joi.string().trim().max(50).required(),
  durationMinutes: Joi.number().integer().min(1).allow(null).default(null),
  dataMB:          Joi.number().integer().min(1).allow(null).default(null),
  speedLimitMbps:  Joi.number().min(0).allow(null).default(null),
  isActive:        Joi.boolean().default(true),
  ...bundleFields,
}).custom(happyHourGuard);

const operatorBundleUpdate = Joi.object({
  name:            Joi.string().trim().max(100),
  price:           Joi.number().positive(),
  mikrotikProfile: Joi.string().trim().max(50),
  durationMinutes: Joi.number().integer().min(1).allow(null),
  dataMB:          Joi.number().integer().min(1).allow(null),
  speedLimitMbps:  Joi.number().min(0).allow(null),
  isActive:        Joi.boolean(),
  multiDevice:     Joi.boolean(),
  maxDevices:      Joi.number().integer().min(1),
  validFromHour:   Joi.number().integer().min(0).max(23).allow(null),
  validToHour:     Joi.number().integer().min(0).max(23).allow(null),
}).custom(happyHourGuard);

// ── Operators ─────────────────────────────────────────────────────────────────

const operatorCreate = Joi.object({
  name:         Joi.string().trim().max(100).required(),
  shortCode:    Joi.string().trim().uppercase().alphanum().min(3).max(10).required(),
  ownerPhone:   phone.required(),
  portalPassword: Joi.string().min(8).required(),
  businessName: Joi.string().trim().max(200).allow('', null).default(''),
  email:        Joi.string().email().allow('', null).default(''),
  status:       Joi.string().valid('ACTIVE', 'SUSPENDED').default('ACTIVE'),
  platformFeePercent: Joi.number().min(0).max(100).allow(null).default(null),
  // MikroTik
  mikrotikHost: safeMikrotikHost.default(''),
  mikrotikPort: Joi.number().integer().min(1).max(65535).default(8728),
  mikrotikUser: Joi.string().trim().allow('', null).default(''),
  mikrotikPass: Joi.string().allow('', null).default(''),
  // Branding
  brandName:       Joi.string().trim().max(100).allow('', null).default(''),
  brandTagline:    Joi.string().trim().max(200).allow('', null).default(''),
  logoUrl:         Joi.string().allow('', null).default(''),
  accentColor:     Joi.string().trim().pattern(/^#[0-9a-fA-F]{6}$/).allow('', null).default('#00c853'),
  hotspotLoginUrl: Joi.string().allow('', null).default(''),
  trialMinutes:    Joi.number().integer().min(0).default(0),
  supportPhone:    Joi.string().trim().allow('', null).default(''),
  supportWhatsapp: Joi.string().trim().allow('', null).default(''),
  supportEmail:    Joi.string().email().allow('', null).default(''),
  notes:           Joi.string().trim().max(1000).allow('', null).default(''),
});

const operatorUpdate = Joi.object({
  name:         Joi.string().trim().max(100),
  shortCode:    Joi.string().trim().uppercase().alphanum().min(3).max(10),
  ownerPhone:   phone,
  portalPassword: Joi.string().min(8).allow('', null),
  businessName: Joi.string().trim().max(200).allow('', null),
  email:        Joi.string().email().allow('', null),
  status:       Joi.string().valid('ACTIVE', 'SUSPENDED'),
  platformFeePercent: Joi.number().min(0).max(100).allow(null),
  mikrotikHost: safeMikrotikHost,
  mikrotikPort: Joi.number().integer().min(1).max(65535),
  mikrotikUser: Joi.string().trim().allow('', null),
  mikrotikPass: Joi.string().allow('', null),
  brandName:       Joi.string().trim().max(100).allow('', null),
  brandTagline:    Joi.string().trim().max(200).allow('', null),
  logoUrl:         Joi.string().allow('', null),
  accentColor:     Joi.string().trim().pattern(/^#[0-9a-fA-F]{6}$/).allow('', null),
  hotspotLoginUrl: Joi.string().allow('', null),
  trialMinutes:    Joi.number().integer().min(0),
  supportPhone:    Joi.string().trim().allow('', null),
  supportWhatsapp: Joi.string().trim().allow('', null),
  supportEmail:    Joi.string().email().allow('', null),
  notes:           Joi.string().trim().max(1000).allow('', null),
});

// Operator self-service profile update (subset — no shortCode/status/platformFee from this endpoint)
const operatorProfileUpdate = Joi.object({
  name:         Joi.string().trim().max(100),
  businessName: Joi.string().trim().max(200).allow('', null),
  ownerPhone:   phone,
  email:        Joi.string().email().allow('', null),
  // MikroTik
  mikrotikHost: safeMikrotikHost,
  mikrotikPort: Joi.number().integer().min(1).max(65535),
  mikrotikUser: Joi.string().trim().allow('', null),
  mikrotikPass: Joi.string().allow('', null),
  // Branding
  brandName:       Joi.string().trim().max(100).allow('', null),
  brandTagline:    Joi.string().trim().max(200).allow('', null),
  logoUrl:         Joi.string().allow('', null),
  accentColor:     Joi.string().trim().pattern(/^#[0-9a-fA-F]{6}$/).allow('', null),
  hotspotLoginUrl: Joi.string().allow('', null),
  trialMinutes:    Joi.number().integer().min(0),
  // Support
  supportPhone:    Joi.string().trim().allow('', null),
  supportWhatsapp: Joi.string().trim().allow('', null),
  supportEmail:    Joi.string().email().allow('', null),
  // Webhook
  webhookUrl:    safeWebhookUrl,
  webhookSecret: Joi.string().min(8).allow('', null),
  // Auto-settlement
  autoSettleEnabled:   Joi.boolean(),
  autoSettleThreshold: Joi.number().min(0),
});

// Operator self-signup (creates PENDING operator, admin approves to ACTIVE)
const operatorSignup = Joi.object({
  name:         Joi.string().trim().max(100).required(),
  businessName: Joi.string().trim().max(200).allow('', null).default(''),
  ownerPhone:   phone.required(),
  email:        Joi.string().email().allow('', null).default(''),
});

// ── Vouchers ──────────────────────────────────────────────────────────────────

const voucherGenerate = Joi.object({
  bundleId:   objectId.required(),
  quantity:   Joi.number().integer().min(1).max(500).default(10),
  maxDevices: Joi.number().integer().min(1).max(20).default(1),
  expiresAt:  Joi.date().greater('now').allow(null).default(null),
  type:       Joi.string().valid('ADMIN', 'PROMO').default('ADMIN'),
  note:       Joi.string().trim().max(500).allow('', null).default(''),
});

// ── Session grants ────────────────────────────────────────────────────────────

const sessionGrant = Joi.object({
  macAddress:      mac.required(),
  bundleId:        objectId.required(),
  phone:           phone.allow('', null).default(''),
  durationMinutes: Joi.number().integer().min(1).allow(null),
  note:            Joi.string().trim().max(500).default('Manual grant'),
});

module.exports = {
  paymentInitiate,
  bundleCreate,
  bundleUpdate,
  operatorBundleCreate,
  operatorBundleUpdate,
  operatorCreate,
  operatorUpdate,
  operatorProfileUpdate,
  operatorSignup,
  voucherGenerate,
  sessionGrant,
};
