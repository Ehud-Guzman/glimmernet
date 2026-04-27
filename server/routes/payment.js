const express = require('express');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Bundle = require('../models/Bundle');
const Operator = require('../models/Operator');
const { initiateStkPush, queryStkStatus } = require('../services/darajaService');
const { handleB2CCallback } = require('../services/settlementService');
const { AccessProvisionError, finalizeSuccessfulPayment, enrichSessionFromTransaction } = require('../services/paymentProcessingService');
const { sanitizePhone, createResumeToken, getNairobiHour } = require('../utils/helpers');
const { syncSessionState } = require('../services/sessionService');
const validate = require('../middleware/validate');
const schemas = require('../middleware/schemas');
const logger = require('../utils/logger');

const router = express.Router();

// ── STK Push initiation ───────────────────────────────────────────────────────

router.post('/initiate', validate(schemas.paymentInitiate), async (req, res, next) => {
  try {
    const { phone, bundleId, mac, operatorShortCode } = req.body;

    const bundle = await Bundle.findById(bundleId);
    if (!bundle || !bundle.isActive) {
      return res.status(404).json({ success: false, message: 'Bundle not found or no longer available.' });
    }

    // Enforce happy-hour time window server-side (portal filters client-side, but
    // a direct API call could bypass that filter).
    if (bundle.validFromHour != null && bundle.validToHour != null) {
      const nairobiHour = getNairobiHour();
      const from = bundle.validFromHour;
      const to = bundle.validToHour;
      const inWindow = from > to
        ? nairobiHour >= from || nairobiHour < to
        : nairobiHour >= from && nairobiHour < to;
      if (!inWindow) {
        return res.status(400).json({
          success: false,
          message: `This bundle is only available between ${from}:00 and ${to}:00 (Nairobi time).`,
        });
      }
    }

    let operator = null;
    let portalOperator = null;

    if (operatorShortCode) {
      portalOperator = await Operator.findOne({ shortCode: operatorShortCode, status: 'ACTIVE' });
      if (!portalOperator) {
        return res.status(404).json({ success: false, message: 'Operator not found for this portal.' });
      }
    }

    if (bundle.operatorId) {
      operator = await Operator.findOne({ _id: bundle.operatorId, status: 'ACTIVE' });
      if (!operator) {
        return res.status(409).json({ success: false, message: 'This bundle is linked to an inactive WiFi location.' });
      }
      if (portalOperator && !operator._id.equals(portalOperator._id)) {
        return res.status(403).json({ success: false, message: 'This bundle belongs to a different WiFi location.' });
      }
    } else if (portalOperator) {
      operator = portalOperator;
    }

    const macUpper = mac ? mac.toUpperCase() : '';

    // ── Guard: active session already exists ──────────────────────────────────
    if (macUpper && operator) {
      const active = await Session.findOne({
        macAddress: macUpper,
        operatorId: operator._id,
        status: 'ACTIVE',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      });
      if (active) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_SESSION',
          message: 'You already have an active session here. No need to pay again.',
          expiresAt: active.expiresAt,
        });
      }
    }

    // ── Guard: duplicate PENDING transaction in the last 5 minutes ────────────
    if (macUpper) {
      const dup = await Transaction.findOne({
        macAddress: macUpper,
        bundleId: bundle._id,
        status: 'PENDING',
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      });
      if (dup?.checkoutRequestId) {
        return res.json({
          success: true,
          checkoutRequestId: dup.checkoutRequestId,
          duplicate: true,
          message: 'A payment is already in progress. Check your phone for the M-Pesa prompt.',
        });
      }
    }

    const sanitized = sanitizePhone(phone);

    const transaction = await Transaction.create({
      phone: sanitized,
      amount: bundle.price,
      bundleId: bundle._id,
      macAddress: macUpper,
      operatorId: operator?._id || null,
    });

    const opTag = operator ? `OP-${operator.shortCode}` : 'WIFI';
    const checkoutRef = `${opTag}-${transaction._id.toString().slice(-6).toUpperCase()}`;

    const stkResponse = await initiateStkPush({
      phone: sanitized,
      amount: bundle.price,
      bundleId: bundle._id,
      checkoutRef,
    });

    transaction.checkoutRequestId = stkResponse.CheckoutRequestID;
    transaction.merchantRequestId = stkResponse.MerchantRequestID;
    await transaction.save();

    res.json({
      success: true,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      message: 'Check your phone for the M-Pesa PIN prompt.',
    });
  } catch (err) {
    next(err);
  }
});

// ── M-Pesa STK callback ───────────────────────────────────────────────────────

router.post('/callback', async (req, res, next) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) return;

    const { CheckoutRequestID, ResultCode, CallbackMetadata } = body;

    const transaction = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });
    if (!transaction) return;
    if (transaction.status === 'SUCCESS') return;

    if (Number(ResultCode) !== 0) {
      transaction.status = Number(ResultCode) === 1032 ? 'CANCELLED' : 'FAILED';
      transaction.callbackPayload = body;
      await transaction.save();
      return;
    }

    const meta = CallbackMetadata?.Item || [];
    const get = (name) => meta.find((i) => i.Name === name)?.Value;

    const { transaction: processedTxn, session } = await finalizeSuccessfulPayment({
      transactionId: transaction._id,
      mpesaReceiptNumber: get('MpesaReceiptNumber') || '',
      callbackPayload: body,
    });

    logger.info('Payment callback processed', {
      txnId: processedTxn._id,
      sessionId: session?._id || null,
      platformFee: processedTxn.platformFee,
      operatorNet: processedTxn.operatorNet,
    });
  } catch (err) {
    const level = err instanceof AccessProvisionError ? 'warn' : 'error';
    logger[level]('Callback processing error', { message: err.message });
  }
});

// ── Manual payment verification fallback ─────────────────────────────────────

router.post('/verify', async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.body;
    if (!checkoutRequestId) {
      return res.status(400).json({ success: false, message: 'checkoutRequestId is required' });
    }

    const transaction = await Transaction.findOne({ checkoutRequestId });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const enriched = await enrichSessionFromTransaction(transaction);
    if (enriched.transaction?.status === 'SUCCESS' && enriched.session) {
      const activeSession = await syncSessionState(enriched.session);
      if (!activeSession || activeSession.status !== 'ACTIVE') {
        return res.json({ status: 'ACCESS_FAILED', message: 'Access is no longer active for this session.' });
      }
      return res.json({
        status: 'SUCCESS',
        username: activeSession.username,
        password: activeSession.password,
        expiresAt: activeSession.expiresAt,
        resumeToken: createResumeToken(activeSession),
      });
    }
    if (transaction.status === 'FAILED')    return res.json({ status: 'FAILED' });
    if (transaction.status === 'CANCELLED') return res.json({ status: 'CANCELLED' });

    if (transaction.status === 'ACCESS_FAILED') {
      try {
        const { session, transaction: retriedTxn } = await finalizeSuccessfulPayment({
          transactionId: transaction._id,
          mpesaReceiptNumber: transaction.mpesaReceiptNumber || '',
          callbackPayload: transaction.callbackPayload || null,
        });
        if (!session) {
          return res.json({
            status: retriedTxn?.status === 'ACCESS_FAILED' ? 'ACCESS_FAILED' : 'PENDING',
            message: retriedTxn?.processingError || 'Payment is still being finalized.',
          });
        }
        const activeSession = await syncSessionState(session);
        if (!activeSession || activeSession.status !== 'ACTIVE') {
          return res.json({ status: 'ACCESS_FAILED', message: 'Access is no longer active for this session.' });
        }
        return res.json({
          status: 'SUCCESS',
          username: activeSession.username,
          password: activeSession.password,
          expiresAt: activeSession.expiresAt,
          resumeToken: createResumeToken(activeSession),
        });
      } catch (err) {
        if (err instanceof AccessProvisionError) {
          return res.status(err.statusCode).json({ status: 'ACCESS_FAILED', message: err.message });
        }
        throw err;
      }
    }

    if (transaction.status === 'PROCESSING') {
      return res.json({ status: 'PENDING', message: 'Payment is still being finalized.' });
    }

    let queryResult;
    try {
      queryResult = await queryStkStatus({ checkoutRequestId });
    } catch {
      return res.status(502).json({ success: false, message: 'Could not reach M-Pesa. Please try again in a moment.' });
    }

    const resultCode = Number(queryResult.ResultCode);
    if (resultCode !== 0) {
      transaction.status = resultCode === 1032 ? 'CANCELLED' : 'FAILED';
      await transaction.save();
      return res.json({ status: transaction.status });
    }

    try {
      const { session, transaction: processedTxn } = await finalizeSuccessfulPayment({
        transactionId: transaction._id,
        mpesaReceiptNumber: queryResult.MpesaReceiptNumber || transaction.mpesaReceiptNumber || '',
      });
      if (!session) {
        return res.json({
          status: processedTxn?.status === 'ACCESS_FAILED' ? 'ACCESS_FAILED' : 'PENDING',
          message: processedTxn?.processingError || 'Payment is still being finalized.',
        });
      }
      const activeSession = await syncSessionState(session);
      if (!activeSession || activeSession.status !== 'ACTIVE') {
        return res.json({ status: 'ACCESS_FAILED', message: 'Access is no longer active for this session.' });
      }
      return res.json({
        status: 'SUCCESS',
        username: activeSession.username,
        password: activeSession.password,
        expiresAt: activeSession.expiresAt,
        resumeToken: createResumeToken(activeSession),
      });
    } catch (err) {
      if (err instanceof AccessProvisionError) {
        return res.status(err.statusCode).json({ status: 'ACCESS_FAILED', message: err.message });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// ── Daraja B2C result callbacks ───────────────────────────────────────────────

router.post('/b2c-callback', async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  try {
    await handleB2CCallback(req.body);
  } catch (err) {
    logger.error('B2C callback error', { message: err.message });
  }
});

router.post('/b2c-timeout', async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  logger.warn('B2C timeout received', { body: req.body });
});

module.exports = router;
