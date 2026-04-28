const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  macAddress: { type: String, index: true },
  bundleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  startTime: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'TERMINATED'],
    default: 'ACTIVE',
    index: true,
  },
  mikrotikRemoved: { type: Boolean, default: false },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null, index: true },
  voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
  isTrial: { type: Boolean, default: false },
  reminderSent: { type: Boolean, default: false },
}, { timestamps: true });

// Compound indexes for hot query paths
SessionSchema.index({ macAddress: 1, status: 1 });
SessionSchema.index({ operatorId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('Session', SessionSchema);
