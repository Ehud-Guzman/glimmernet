const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Bundle = require('../models/Bundle');
const Operator = require('../models/Operator');
const Voucher = require('../models/Voucher');
const { createSession } = require('./sessionService');
const { creditOperatorWallet } = require('./settlementService');
const { sendPaymentReceipt } = require('./notificationService');
const { fireWebhook } = require('./webhookService');
const logger = require('../utils/logger');

class AccessProvisionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccessProvisionError';
    this.statusCode = 503;
  }
}

const enrichSessionFromTransaction = async (transaction) => {
  if (!transaction) return { transaction: null, session: null };

  let session = null;

  if (transaction.sessionId) {
    session = await Session.findById(transaction.sessionId);
  }

  if (!session) {
    session = await Session.findOne({ transactionId: transaction._id }).sort({ createdAt: -1 });
    if (session && (!transaction.sessionId || !transaction.sessionId.equals(session._id))) {
      transaction.sessionId = session._id;
      if (transaction.status === 'PROCESSING') transaction.status = 'SUCCESS';
      await transaction.save();
    }
  }

  return { transaction, session };
};

const runPostPaymentActions = async (transaction, session) => {
  try {
    const bundle = await Bundle.findById(transaction.bundleId).select('name maxDevices');
    const operator = transaction.operatorId
      ? await Operator.findById(transaction.operatorId).select('brandName name supportPhone webhookUrl webhookSecret')
      : null;

    if (operator) {
      fireWebhook(operator, 'session.created', {
        sessionId: session._id,
        macAddress: session.macAddress,
        phone: transaction.phone,
        bundleName: bundle?.name,
        expiresAt: session.expiresAt,
        mpesaReceipt: transaction.mpesaReceiptNumber,
      });
    }

    sendPaymentReceipt({
      phone: transaction.phone,
      brandName: operator?.brandName || operator?.name || 'WiFi',
      bundleName: bundle?.name || 'WiFi Plan',
      expiresAt: session.expiresAt,
      mpesaReceipt: transaction.mpesaReceiptNumber,
      supportPhone: operator?.supportPhone || '',
    });

    if (transaction.mpesaReceiptNumber) {
      try {
        await Voucher.create({
          code: transaction.mpesaReceiptNumber.toUpperCase(),
          type: 'MPESA',
          bundleId: transaction.bundleId,
          operatorId: transaction.operatorId || null,
          maxDevices: bundle?.maxDevices || 1,
          transactionId: transaction._id,
          note: `Auto-created for phone ${transaction.phone}`,
        });
      } catch (err) {
        if (err.code !== 11000) {
          logger.warn('MPESA voucher creation failed', { message: err.message });
        }
      }
    }
  } catch (err) {
    logger.warn('Post-payment actions failed', {
      transactionId: transaction._id,
      message: err.message,
    });
  }
};

const finalizeSuccessfulPayment = async ({
  transactionId,
  mpesaReceiptNumber = '',
  callbackPayload = null,
}) => {
  let transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new Error('Transaction not found');

  if (transaction.status === 'SUCCESS') {
    return enrichSessionFromTransaction(transaction);
  }

  if (transaction.status === 'PROCESSING') {
    return enrichSessionFromTransaction(transaction);
  }

  const claimed = await Transaction.findOneAndUpdate(
    {
      _id: transactionId,
      status: { $in: ['PENDING', 'ACCESS_FAILED'] },
    },
    {
      $set: {
        status: 'PROCESSING',
        processingError: '',
        ...(mpesaReceiptNumber ? { mpesaReceiptNumber } : {}),
        ...(callbackPayload ? { callbackPayload } : {}),
      },
    },
    { new: true }
  );

  if (!claimed) {
    transaction = await Transaction.findById(transactionId);
    return enrichSessionFromTransaction(transaction);
  }

  try {
    const existing = await Session.findOne({ transactionId: claimed._id }).sort({ createdAt: -1 });
    const session = existing || await createSession(claimed);

    let walletResult = null;
    if (claimed.operatorId) {
      walletResult = await creditOperatorWallet({
        operatorId: claimed.operatorId,
        grossAmount: claimed.amount,
      });
    }

    claimed.status = 'SUCCESS';
    claimed.sessionId = session._id;
    claimed.processingError = '';
    if (mpesaReceiptNumber) claimed.mpesaReceiptNumber = mpesaReceiptNumber;
    if (callbackPayload) claimed.callbackPayload = callbackPayload;
    if (walletResult) {
      claimed.platformFee = walletResult.platformFee;
      claimed.operatorNet = walletResult.operatorNet;
    }
    await claimed.save();

    await runPostPaymentActions(claimed, session);
    return { transaction: claimed, session };
  } catch (err) {
    claimed.status = 'ACCESS_FAILED';
    claimed.processingError = err.message;
    if (mpesaReceiptNumber) claimed.mpesaReceiptNumber = mpesaReceiptNumber;
    if (callbackPayload) claimed.callbackPayload = callbackPayload;
    await claimed.save();

    logger.error('Payment confirmed but access provisioning failed', {
      transactionId: claimed._id,
      message: err.message,
    });

    throw new AccessProvisionError(
      'Payment was received, but internet access could not be activated automatically. Please retry in a moment or contact support.'
    );
  }
};

module.exports = { AccessProvisionError, finalizeSuccessfulPayment, enrichSessionFromTransaction };
