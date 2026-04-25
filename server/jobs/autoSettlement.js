const cron = require('node-cron');
const Operator = require('../models/Operator');
const { settleOperator } = require('../services/settlementService');
const logger = require('../utils/logger');

const runAutoSettlement = async () => {
  const candidates = await Operator.find({
    status: 'ACTIVE',
    autoSettleEnabled: true,
    $expr: { $gte: ['$walletBalance', '$autoSettleThreshold'] },
  }).select('_id name walletBalance autoSettleThreshold');

  for (const op of candidates) {
    try {
      const settlement = await settleOperator({
        operatorId: op._id,
        amount: op.walletBalance,
        method: 'B2C',
        notes: 'Auto-settlement',
      });
      logger.info('Auto-settlement initiated', {
        operatorId: op._id,
        name: op.name,
        amount: settlement.amount,
        settlementId: settlement._id,
      });
    } catch (err) {
      logger.warn('Auto-settlement failed', {
        operatorId: op._id,
        name: op.name,
        message: err.message,
      });
    }
  }
};

const startAutoSettlementJob = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      await runAutoSettlement();
    } catch (err) {
      logger.error('Auto-settlement job error', { message: err.message });
    }
  });
  logger.info('Auto-settlement job started (hourly)');
};

module.exports = startAutoSettlementJob;
