const mongoose = require('mongoose');

const OperatorRouterSchema = new mongoose.Schema({
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 }, // e.g. "Floor 1", "Branch Westlands"
  host: { type: String, required: true, trim: true },
  port: { type: Number, default: 8728 },
  user: { type: String, required: true, trim: true },
  pass: { type: String, required: true },                              // AES-encrypted
  hotspotServer: { type: String, default: 'hotspot1' },
  isActive: { type: Boolean, default: true },
  // Health (updated by networkHealthCheck job)
  healthStatus: { type: String, enum: ['OK', 'DOWN', 'UNKNOWN'], default: 'UNKNOWN' },
  healthError: { type: String, default: '' },
  lastHealthCheck: { type: Date, default: null },
}, { timestamps: true });

OperatorRouterSchema.index({ operatorId: 1, isActive: 1 });

module.exports = mongoose.model('OperatorRouter', OperatorRouterSchema);
