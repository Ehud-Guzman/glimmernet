const mongoose = require('mongoose');
const Operator = require('../models/Operator');
const Settlement = require('../models/Settlement');
const { initiateB2C } = require('./darajaService');
const configService = require('./configService');
const logger = require('../utils/logger');

const calculateFee = (grossAmount, feePercent) => {
  const platformFee = Math.round((grossAmount * feePercent) / 100 * 100) / 100;
  const operatorNet = Math.round((grossAmount - platformFee) * 100) / 100;
  return { platformFee, operatorNet, feePercent };
};

const resolveFeePercent = async (operatorFeeOverride) => {
  if (operatorFeeOverride != null) return Number(operatorFeeOverride);
  return Number(await configService.get('platform_fee_percent', 10));
};

const creditOperatorWallet = async ({ operatorId, grossAmount }) => {
  const operator = await Operator.findById(operatorId);
  if (!operator) {
    logger.warn('creditOperatorWallet: operator not found', { operatorId });
    return null;
  }

  const feePercent = await resolveFeePercent(operator.platformFeePercent);
  const { platformFee, operatorNet } = calculateFee(grossAmount, feePercent);

  // Use $inc for atomic credit — concurrent payments must never race on a read-modify-save.
  await Operator.findByIdAndUpdate(operatorId, {
    $inc: {
      walletBalance: operatorNet,
      lifetimeGross: grossAmount,
      lifetimeFees:  platformFee,
    },
  });

  logger.info('Operator wallet credited', { operatorId, grossAmount, platformFee, operatorNet });
  return { platformFee, operatorNet };
};

/**
 * Trigger a settlement payout.
 * Wallet deduction and Settlement document creation are wrapped in a MongoDB
 * transaction so a server crash between the two can never leave them out of sync.
 * Requires a replica set (MongoDB Atlas always qualifies).
 */
const settleOperator = async ({ operatorId, amount, method = 'B2C', adminId, notes = '' }) => {
  const operator = await Operator.findById(operatorId);
  if (!operator) throw new Error('Operator not found');
  if (operator.status === 'SUSPENDED') throw new Error('Operator is suspended');

  const maxAmount = Math.min(amount, operator.walletBalance);
  if (maxAmount <= 0) throw new Error('No balance to settle');

  const feePercent = await resolveFeePercent(operator.platformFeePercent);
  const { platformFee } = calculateFee(maxAmount, feePercent);

  // ── Atomic: deduct wallet + create settlement record ──────────────────────
  let settlement;
  const dbSession = await mongoose.connection.startSession();
  try {
    await dbSession.withTransaction(async () => {
      // Use a conditional update so concurrent requests can't double-spend
      const updated = await Operator.findOneAndUpdate(
        { _id: operatorId, walletBalance: { $gte: maxAmount } },
        { $inc: { walletBalance: -maxAmount } },
        { new: true, session: dbSession }
      );
      if (!updated) throw new Error('Insufficient balance — another settlement may be in progress');

      [settlement] = await Settlement.create([{
        operatorId,
        amount: maxAmount,
        platformFee,
        grossAmount: maxAmount,
        method,
        status: method === 'MANUAL' ? 'PAID' : 'PROCESSING',
        triggeredBy: adminId,
        paidAt: method === 'MANUAL' ? new Date() : null,
        notes,
      }], { session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }

  // ── B2C is a network call — cannot be inside the DB transaction ───────────
  if (method === 'B2C') {
    try {
      const b2cRes = await initiateB2C({
        phone: operator.ownerPhone,
        amount: maxAmount,
        settlementId: settlement._id.toString(),
        operatorName: operator.name,
      });
      settlement.mpesaConversationId = b2cRes.ConversationID || '';
      await settlement.save();
      logger.info('B2C settlement initiated', { settlementId: settlement._id, operator: operator.name });
    } catch (err) {
      // Refund wallet via atomic $inc — never risk a non-atomic read-modify-write here
      await Operator.findByIdAndUpdate(operatorId, { $inc: { walletBalance: maxAmount } });
      settlement.status = 'FAILED';
      settlement.notes = err.message;
      await settlement.save();
      throw err;
    }
  }

  return settlement;
};

const handleB2CCallback = async (body) => {
  const result = body?.Result;
  if (!result) return;

  const { ConversationID, ResultCode, ResultParameters } = result;
  const settlement = await Settlement.findOne({ mpesaConversationId: ConversationID });
  if (!settlement) return;

  if (ResultCode === 0) {
    const params = ResultParameters?.ResultParameter || [];
    const get = (name) => params.find((p) => p.Key === name)?.Value;
    settlement.mpesaRef = get('TransactionReceipt') || '';
    settlement.status   = 'PAID';
    settlement.paidAt   = new Date();
  } else {
    await Operator.findByIdAndUpdate(settlement.operatorId, { $inc: { walletBalance: settlement.amount } });
    settlement.status = 'FAILED';
    settlement.notes  = `Daraja ResultCode ${ResultCode}`;
  }

  await settlement.save();
};

module.exports = { calculateFee, creditOperatorWallet, settleOperator, handleB2CCallback, resolveFeePercent };
