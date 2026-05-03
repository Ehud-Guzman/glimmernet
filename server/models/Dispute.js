const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null, index: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  // What the customer reported
  issue: {
    type: String,
    enum: ['PAID_NO_INTERNET', 'WRONG_AMOUNT_CHARGED', 'SESSION_EXPIRED_TOO_EARLY', 'DOUBLE_CHARGE', 'OTHER'],
    required: true,
  },
  description: { type: String, default: '', maxlength: 2000 },
  mpesaReceiptNumber: { type: String, default: '' },
  status: {
    type: String,
    enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED'],
    default: 'OPEN',
    index: true,
  },
  resolution: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'resolvedByModel', default: null },
  resolvedByModel: { type: String, enum: ['AdminUser', 'Operator'], default: null },
  refundIssued: { type: Boolean, default: false },
  refundAmount: { type: Number, default: 0 },
}, { timestamps: true });

DisputeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', DisputeSchema);
