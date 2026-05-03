const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Operator = require('../models/Operator');
const { fireWebhook } = require('../services/webhookDispatchService');
const logger = require('../utils/logger');

// Re-fire webhooks for recent successful transactions whose operators have a webhookUrl.
// This catches cases where the initial fire-and-forget failed and all in-process retries exhausted.
const runWebhookRetry = async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h only

  const txns = await Transaction.find({
    status: 'SUCCESS',
    createdAt: { $gte: since },
    webhookFired: { $ne: true },
  }).populate('operatorId', 'webhookUrl webhookSecret name _id').limit(200);

  for (const txn of txns) {
    const op = txn.operatorId;
    if (!op?.webhookUrl) continue;
    fireWebhook(op, 'payment.success', {
      transactionId: txn._id,
      phone: txn.phone,
      amount: txn.amount,
      mpesaReceiptNumber: txn.mpesaReceiptNumber,
      bundleId: txn.bundleId,
      operatorId: txn.operatorId?._id,
    });
  }

  if (txns.length) {
    logger.info(`Webhook retry: fired for ${txns.length} transaction(s)`);
  }
};

const startWebhookRetryJob = () => {
  cron.schedule('*/30 * * * *', async () => {
    try { await runWebhookRetry(); } catch (err) {
      logger.error('Webhook retry job error', { message: err.message });
    }
  });
  logger.info('Webhook retry job started (every 30 min)');
};

module.exports = startWebhookRetryJob;
