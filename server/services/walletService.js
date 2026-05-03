const mongoose = require('mongoose');
const { CustomerWallet, WalletTransaction } = require('../models/CustomerWallet');
const logger = require('../utils/logger');

const toKES = (cents) => Math.round(cents) / 100;
const toCents = (kes) => Math.round(kes * 100);

const getOrCreateWallet = async (phone, operatorId = null) => {
  let wallet = await CustomerWallet.findOne({ phone, operatorId });
  if (!wallet) {
    wallet = await CustomerWallet.create({ phone, operatorId, balanceCents: 0 }).catch(async (err) => {
      if (err.code === 11000) return CustomerWallet.findOne({ phone, operatorId });
      throw err;
    });
  }
  return wallet;
};

const getBalance = async (phone, operatorId = null) => {
  const wallet = await CustomerWallet.findOne({ phone, operatorId });
  return { balanceCents: wallet?.balanceCents ?? 0, balanceKES: toKES(wallet?.balanceCents ?? 0) };
};

/**
 * Credit wallet after a successful M-Pesa top-up payment.
 * Uses a MongoDB transaction so the wallet credit and ledger entry are atomic.
 */
const topUp = async ({ phone, operatorId = null, amountKES, transactionId = null, note = '' }) => {
  const amountCents = toCents(amountKES);
  const dbSession = await mongoose.connection.startSession();
  let result;
  try {
    await dbSession.withTransaction(async () => {
      const wallet = await CustomerWallet.findOneAndUpdate(
        { phone, operatorId },
        { $inc: { balanceCents: amountCents } },
        { new: true, upsert: true, session: dbSession }
      );
      const tx = await WalletTransaction.create([{
        walletId: wallet._id, phone, operatorId,
        type: 'TOP_UP',
        amountCents,
        balanceAfterCents: wallet.balanceCents,
        transactionId,
        note,
      }], { session: dbSession });
      result = { wallet, entry: tx[0] };
    });
  } finally {
    await dbSession.endSession();
  }
  logger.info('Wallet topped up', { phone, operatorId, amountKES });
  return { balanceCents: result.wallet.balanceCents, balanceKES: toKES(result.wallet.balanceCents) };
};

/**
 * Debit wallet to pay for a bundle.
 * Returns updated balance, or throws if insufficient funds.
 */
const purchase = async ({ phone, operatorId = null, amountKES, sessionId = null, note = '' }) => {
  const amountCents = toCents(amountKES);
  const dbSession = await mongoose.connection.startSession();
  let result;
  try {
    await dbSession.withTransaction(async () => {
      const wallet = await CustomerWallet.findOneAndUpdate(
        { phone, operatorId, balanceCents: { $gte: amountCents } },
        { $inc: { balanceCents: -amountCents } },
        { new: true, session: dbSession }
      );
      if (!wallet) throw new Error(`Insufficient wallet balance. Need KES ${amountKES}.`);

      const tx = await WalletTransaction.create([{
        walletId: wallet._id, phone, operatorId,
        type: 'PURCHASE',
        amountCents: -amountCents,
        balanceAfterCents: wallet.balanceCents,
        sessionId,
        note,
      }], { session: dbSession });
      result = { wallet, entry: tx[0] };
    });
  } finally {
    await dbSession.endSession();
  }
  logger.info('Wallet purchase', { phone, operatorId, amountKES });
  return { balanceCents: result.wallet.balanceCents, balanceKES: toKES(result.wallet.balanceCents) };
};

const getHistory = async (phone, operatorId = null, limit = 20) => {
  const wallet = await CustomerWallet.findOne({ phone, operatorId });
  if (!wallet) return [];
  return WalletTransaction.find({ walletId: wallet._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sessionId', 'status expiresAt')
    .populate('transactionId', 'mpesaReceiptNumber amount status');
};

module.exports = { getBalance, topUp, purchase, getHistory, getOrCreateWallet, toKES, toCents };
