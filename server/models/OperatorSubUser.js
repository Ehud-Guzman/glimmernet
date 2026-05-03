const mongoose = require('mongoose');

const OperatorSubUserSchema = new mongoose.Schema({
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  // Granular permissions — superAdmin (operator owner) can grant/revoke each
  permissions: {
    viewTransactions: { type: Boolean, default: true },
    viewSessions:     { type: Boolean, default: true },
    viewAnalytics:    { type: Boolean, default: false },
    grantSessions:    { type: Boolean, default: false },
    extendSessions:   { type: Boolean, default: false },
    terminateSessions:{ type: Boolean, default: false },
    manageVouchers:   { type: Boolean, default: false },
    // Explicitly blocked from: settlements, billing settings, sub-user management
  },
  isActive: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true });

OperatorSubUserSchema.index({ operatorId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('OperatorSubUser', OperatorSubUserSchema);
