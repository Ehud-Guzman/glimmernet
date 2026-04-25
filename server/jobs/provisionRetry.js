const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { finalizeSuccessfulPayment } = require('../services/paymentProcessingService');
const { initiateB2C } = require('../services/darajaService');
const { sendSms, isConfigured } = require('../services/notificationService');
const logger = require('../utils/logger');

const MAX_RETRIES = 5;

// Attempt to refund a customer via B2C after all provision retries are exhausted.
// If B2C is not configured, falls back to an SMS notice and marks the transaction
// FAILED so it stops retrying and surfaces clearly in admin.
const refundCustomer = async (txn) => {
  try {
    await initiateB2C({
      phone: txn.phone,
      amount: txn.amount,
      settlementId: txn._id.toString(),
      operatorName: 'Refund',
    });
    await Transaction.findByIdAndUpdate(txn._id, {
      status: 'FAILED',
      processingError: `Refunded KES ${txn.amount} via M-Pesa after provision failure.`,
    });
    logger.info('Customer refund initiated', { txnId: txn._id, phone: txn.phone, amount: txn.amount });
  } catch (refundErr) {
    // B2C not configured or failed — notify customer by SMS and flag for manual action.
    logger.error('Customer refund failed — MANUAL INTERVENTION REQUIRED', {
      txnId: txn._id,
      phone: txn.phone,
      amount: txn.amount,
      refundError: refundErr.message,
    });
    await Transaction.findByIdAndUpdate(txn._id, {
      processingError: `Refund failed: ${refundErr.message}. Manual refund required.`,
    });
    try {
      if (await isConfigured()) {
        await sendSms({
          to: txn.phone,
          message: `Sorry, we could not activate your WiFi session. Please contact support — your payment of KES ${txn.amount} will be refunded manually.`,
        });
      }
    } catch { /* non-fatal */ }
  }
};

const startProvisionRetryJob = () => {
  cron.schedule('*/2 * * * *', async () => {
    let transactions;
    try {
      transactions = await Transaction.find({
        status: 'ACCESS_FAILED',
        mpesaReceiptNumber: { $exists: true, $ne: '' },
        retryCount: { $lt: MAX_RETRIES },
      }).limit(20);
    } catch (err) {
      logger.error('Provision retry: DB query failed', { message: err.message });
      return;
    }

    if (!transactions.length) return;

    logger.info(`Provision retry: ${transactions.length} ACCESS_FAILED transaction(s) queued`);

    for (const txn of transactions) {
      // Increment before attempting — prevents double-processing if the server dies mid-run.
      // Uses a conditional update so a concurrent process doesn't double-increment.
      const claimed = await Transaction.findOneAndUpdate(
        { _id: txn._id, status: 'ACCESS_FAILED', retryCount: txn.retryCount },
        { $inc: { retryCount: 1 } }
      );
      if (!claimed) continue; // another process already claimed this one

      try {
        await finalizeSuccessfulPayment({
          transactionId: txn._id,
          mpesaReceiptNumber: txn.mpesaReceiptNumber,
          callbackPayload: txn.callbackPayload || null,
        });
        logger.info('Provision retry succeeded', { txnId: txn._id, phone: txn.phone });
      } catch (err) {
        const attempt = txn.retryCount + 1;
        if (attempt >= MAX_RETRIES) {
          logger.error('Provision retry exhausted — initiating customer refund', {
            txnId: txn._id,
            phone: txn.phone,
            amount: txn.amount,
            lastError: err.message,
          });
          await refundCustomer(txn);
        } else {
          logger.warn('Provision retry failed — will retry next run', {
            txnId: txn._id,
            attempt,
            remaining: MAX_RETRIES - attempt,
            message: err.message,
          });
        }
      }
    }
  });

  logger.info('Provision retry job started (every 2 min, max 5 attempts per transaction)');
};

module.exports = startProvisionRetryJob;
