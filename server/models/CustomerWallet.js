const mongoose = require('mongoose');

// One wallet per phone number per operator.
// Balance is in KES (smallest unit stored as integers * 100 — i.e. KES 10.50 = 1050).
const CustomerWalletSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null },
  // Balance in KES cents (multiply by 0.01 to display)
  balanceCents: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

CustomerWalletSchema.index({ phone: 1, operatorId: 1 }, { unique: true });

const WalletTransactionSchema = new mongoose.Schema({
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerWallet', required: true, index: true },
  phone: { type: String, required: true, index: true },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null },
  type: { type: String, enum: ['TOP_UP', 'PURCHASE', 'REFUND'], required: true },
  amountCents: { type: Number, required: true },
  balanceAfterCents: { type: Number, required: true },
  // Reference to the M-Pesa transaction (for top-ups) or session (for purchases)
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  note: { type: String, default: '' },
}, { timestamps: true });

WalletTransactionSchema.index({ walletId: 1, createdAt: -1 });

const CustomerWallet = mongoose.model('CustomerWallet', CustomerWalletSchema);
const WalletTransaction = mongoose.model('WalletTransaction', WalletTransactionSchema);

module.exports = { CustomerWallet, WalletTransaction };
