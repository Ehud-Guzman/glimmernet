const mongoose = require('mongoose');

const BundleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  durationMinutes: { type: Number, default: null },
  dataMB: { type: Number, default: null },
  speedLimitMbps: { type: Number, default: null },
  mikrotikProfile: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null },
  // Multi-device: voucher-style code shared across devices
  multiDevice: { type: Boolean, default: false },
  maxDevices: { type: Number, default: 1, min: 1 },
  // Happy-hour pricing window (24-hour integers, null = always available)
  validFromHour: { type: Number, default: null, min: 0, max: 23 },
  validToHour: { type: Number, default: null, min: 0, max: 23 },
}, { timestamps: true });

module.exports = mongoose.model('Bundle', BundleSchema);
