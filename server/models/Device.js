const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  macAddress: { type: String, required: true, unique: true },
  phone: { type: String },
  lastSeen: { type: Date, default: Date.now },
  sessionCount: { type: Number, default: 0 },
  // Track which operators this device has used a free trial at (prevents reuse)
  trialsUsed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Operator' }],
}, { timestamps: true });

module.exports = mongoose.model('Device', DeviceSchema);
