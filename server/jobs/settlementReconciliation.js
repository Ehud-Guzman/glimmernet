const cron = require('node-cron');
const Settlement = require('../models/Settlement');
const Operator = require('../models/Operator');
const logger = require('../utils/logger');

// Auto-fail B2C settlements that have been PROCESSING for more than 30 minutes
// and re-credit the operator's wallet. These arise when Safaricom sends no callback.
const STUCK_AFTER_MS = 30 * 60 * 1000;

const runReconciliation = async () => {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  const stuck = await Settlement.find({
    status: 'PROCESSING',
    createdAt: { $lt: cutoff },
  }).limit(20);

  if (!stuck.length) return;

  logger.warn(`Settlement reconciliation: ${stuck.length} stuck PROCESSING settlement(s) found`);

  for (const s of stuck) {
    try {
      // Atomic re-credit — never risk a non-atomic read-modify-write here
      await Operator.findByIdAndUpdate(s.operatorId, { $inc: { walletBalance: s.amount } });
      s.status = 'FAILED';
      s.notes = [s.notes, 'Auto-failed: no Daraja callback received within 30 min. Wallet re-credited.']
        .filter(Boolean).join(' | ');
      await s.save();
      logger.error('Settlement auto-failed by reconciliation — wallet re-credited', {
        settlementId: s._id,
        operatorId: s.operatorId,
        amount: s.amount,
      });
    } catch (err) {
      logger.error('Settlement reconciliation failed for individual record', {
        settlementId: s._id,
        message: err.message,
      });
    }
  }
};

const startSettlementReconciliationJob = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runReconciliation();
    } catch (err) {
      logger.error('Settlement reconciliation job error', { message: err.message });
    }
  });
  logger.info('Settlement reconciliation job started (every 30 min)');
};

module.exports = startSettlementReconciliationJob;
