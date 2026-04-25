const mongoose = require('mongoose');

const SettlementSchema = new mongoose.Schema({
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
  // Amount sent to operator (gross - fee)
  amount: { type: Number, required: true },
  platformFee: { type: Number, required: true },
  grossAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED'],
    default: 'PENDING',
  },
  // B2C payout details (populated once Daraja responds)
  mpesaRef: { type: String, default: '' },
  mpesaConversationId: { type: String, default: '' },
  // 'B2C' = auto via Daraja, 'MANUAL' = admin sent manually
  method: { type: String, enum: ['B2C', 'MANUAL'], default: 'B2C' },
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  paidAt: { type: Date, default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Settlement', SettlementSchema);
