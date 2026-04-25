const mongoose = require('mongoose');

const OperatorSchema = new mongoose.Schema({
  // Short unique code used in STK AccountReference (e.g. "KAFE1", "PLAZA2")
  shortCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]{3,10}$/,
  },
  name: { type: String, required: true },           // Display name, e.g. "Karen Cafe"
  businessName: { type: String, default: '' },      // Legal/M-Pesa name
  ownerPhone: { type: String, required: true },     // Phone for B2C settlement payouts
  email: { type: String, default: '' },
  // Self-service portal login (set via admin or POST /api/v1/operator/auth/set-password)
  passwordHash: { type: String, default: null },
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true,
  },
  // Platform fee override (null = use global PLATFORM_FEE_PERCENT from env)
  platformFeePercent: { type: Number, default: null, min: 0, max: 100 },
  // Running wallet: net amount owed to operator (not yet settled)
  walletBalance: { type: Number, default: 0 },
  // Lifetime stats
  lifetimeGross: { type: Number, default: 0 },
  lifetimeFees: { type: Number, default: 0 },
  // Their MikroTik router (stored for future per-operator routing)
  mikrotikHost: { type: String, default: '' },
  mikrotikPort: { type: Number, default: 8728 },
  mikrotikUser: { type: String, default: '' },
  mikrotikPass: { type: String, default: '' },
  // Captive portal branding
  brandName: { type: String, default: '' },          // e.g. "Westgate Cafe WiFi"
  brandTagline: { type: String, default: '' },       // e.g. "Fast, secure guest internet"
  logoUrl: { type: String, default: '' },            // optional tenant logo/image
  accentColor: { type: String, default: '#00c853' }, // CSS hex color
  // MikroTik hotspot login URL (where the portal auto-submits credentials)
  hotspotLoginUrl: { type: String, default: '' },    // e.g. "http://192.168.88.1/login"
  // Free trial: minutes granted to a new device before payment wall
  trialMinutes: { type: Number, default: 0, min: 0 },
  // Operator-specific support contact shown on the portal
  supportPhone: { type: String, default: '' },
  supportWhatsapp: { type: String, default: '' },
  supportEmail: { type: String, default: '' },
  notes: { type: String, default: '' },
  // Webhook: signed POST on session creation
  webhookUrl: { type: String, default: '' },
  webhookSecret: { type: String, default: '' },
  // Auto-settlement: automatically B2C when wallet reaches threshold
  autoSettleEnabled: { type: Boolean, default: false },
  autoSettleThreshold: { type: Number, default: 500, min: 0 },
  // Network health (updated by healthCheck cron)
  lastHealthCheck: { type: Date, default: null },
  healthStatus: { type: String, enum: ['OK', 'DOWN', 'UNKNOWN'], default: 'UNKNOWN' },
  healthError: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Operator', OperatorSchema);
