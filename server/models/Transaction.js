const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  amount: { type: Number, required: true },
  bundleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle' },
  checkoutRequestId: { type: String, index: true },
  merchantRequestId: { type: String },
  mpesaReceiptNumber: { type: String },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'ACCESS_FAILED'],
    default: 'PENDING',
    index: true,
  },
  macAddress: { type: String, default: '' },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null, index: true },
  platformFee: { type: Number, default: 0 },
  operatorNet: { type: Number, default: 0 },
  processingError: { type: String, default: '' },
  callbackPayload: { type: Object },
  sessionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  retryCount: { type: Number, default: 0 },
  isTrial: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
