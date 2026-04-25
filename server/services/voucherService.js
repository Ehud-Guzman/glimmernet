const crypto = require('crypto');
const Voucher = require('../models/Voucher');
const Device = require('../models/Device');
const Session = require('../models/Session');
const Operator = require('../models/Operator');
const { createProvisionedSession } = require('./sessionService');
const { removeHotspotUser } = require('./mikrotikService');
const logger = require('../utils/logger');

// Avoids ambiguous chars: no 0/O, no 1/I/L
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomSegment = (len = 4) =>
  Array.from({ length: len }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');

const buildCode = (prefix = 'WIFI') => `${prefix}-${randomSegment()}-${randomSegment()}`;

/**
 * Generate N unique codes that don't already exist in the DB.
 */
const generateUniqueCodes = async (count, prefix = 'WIFI') => {
  const codes = new Set();
  while (codes.size < count) codes.add(buildCode(prefix));

  const existing = new Set(
    (await Voucher.find({ code: { $in: [...codes] } }).select('code')).map((v) => v.code)
  );
  existing.forEach((c) => codes.delete(c));

  while (codes.size < count) {
    const c = buildCode(prefix);
    if (!existing.has(c)) codes.add(c);
  }
  return [...codes];
};

/**
 * Attempt to redeem a voucher code.
 * Covers all scenarios:
 *   - First-time use on any device
 *   - Same device returning while session is still active (resume)
 *   - Switching to a new device (M-Pesa buyer using a different phone)
 *   - Multi-device codes (family/business plans)
 *   - Expired / revoked / fully-used codes → clear error messages
 */
const redeemVoucher = async ({ code, mac = '', phone = '', operatorId = null }) => {
  const normalized = code.trim().toUpperCase();

  const voucher = await Voucher.findOne({ code: normalized }).populate('bundleId');
  if (!voucher) {
    const err = new Error('Invalid code. Please check and try again.');
    err.statusCode = 404;
    throw err;
  }

  // -- Status guards --
  if (voucher.status === 'REVOKED') {
    const err = new Error('This code has been revoked.');
    err.statusCode = 400;
    throw err;
  }

  // Check expiry date (the window to redeem, not the session duration)
  const isExpiredByDate = voucher.expiresAt && voucher.expiresAt < new Date();
  if (voucher.status === 'EXPIRED' || isExpiredByDate) {
    if (isExpiredByDate && voucher.status === 'ACTIVE') {
      voucher.status = 'EXPIRED';
      await voucher.save();
    }
    const d = voucher.expiresAt ? voucher.expiresAt.toLocaleDateString('en-KE') : '';
    const err = new Error(`This code expired on ${d}. Please purchase a new plan.`);
    err.statusCode = 400;
    throw err;
  }

  if (voucher.status === 'FULLY_REDEEMED') {
    const err = new Error('This code has already been fully used.');
    err.statusCode = 400;
    throw err;
  }

  // -- Resume: same device, session still active --
  if (mac) {
    const existing = voucher.redemptions.find((r) => r.macAddress === mac && r.sessionId);
    if (existing) {
      const sess = await Session.findById(existing.sessionId);
      if (sess && sess.status === 'ACTIVE') {
        logger.info('Voucher resume', { code: normalized, mac });
        return {
          username: sess.username,
          password: sess.password,
          expiresAt: sess.expiresAt,
          bundle: voucher.bundleId,
          resumed: true,
        };
      }
    }
  }

  // -- Device limit check --
  if (voucher.redemptions.length >= voucher.maxDevices) {
    const err = new Error(
      voucher.maxDevices === 1
        ? 'This code has already been redeemed. Please purchase a new plan.'
        : `This code has reached its ${voucher.maxDevices}-device limit.`
    );
    err.statusCode = 400;
    throw err;
  }

  const bundle = voucher.bundleId;
  // If the voucher is scoped to a specific operator, the portal MUST present that same operator.
  // Allowing a null operatorId here would let anyone redeem a private voucher anonymously.
  if (voucher.operatorId) {
    if (!operatorId || !voucher.operatorId.equals(operatorId)) {
      const err = new Error('This code belongs to a different WiFi location.');
      err.statusCode = 403;
      throw err;
    }
  }

  if (bundle?.operatorId && operatorId && !bundle.operatorId.equals(operatorId)) {
    const err = new Error('This plan belongs to a different WiFi location.');
    err.statusCode = 403;
    throw err;
  }

  if (voucher.operatorId && bundle?.operatorId && !voucher.operatorId.equals(bundle.operatorId)) {
    const err = new Error('This code is linked to inconsistent operator data. Contact support.');
    err.statusCode = 409;
    throw err;
  }

  const boundOperatorId = voucher.operatorId || bundle?.operatorId || operatorId || null;
  const operator = boundOperatorId ? await Operator.findById(boundOperatorId) : null;
  if (boundOperatorId && (!operator || operator.status !== 'ACTIVE')) {
    const err = new Error('This WiFi location is not currently available.');
    err.statusCode = 409;
    throw err;
  }

  if (!voucher.operatorId && boundOperatorId) {
    voucher.operatorId = boundOperatorId;
  }

  let session;
  try {
    session = await createProvisionedSession({
      phone,
      macAddress: mac,
      bundle,
      operator,
      voucherId: voucher._id,
      comment: `voucher:${voucher.code}`,
      usernameSeed: phone || mac || 'voucher',
    });
  } catch (err) {
    logger.error('Voucher provisioning failed', { code: normalized, message: err.message });
    const provisionErr = new Error(
      'Code accepted, but internet access could not be activated automatically. Please retry in a moment or contact support.'
    );
    provisionErr.statusCode = 503;
    throw provisionErr;
  }

  // Atomic slot claim — rejects if a concurrent request already filled the last slot
  // after the pre-check above passed (TOCTOU guard).
  const savedVoucher = await Voucher.findOneAndUpdate(
    {
      _id: voucher._id,
      $expr: { $lt: [{ $size: '$redemptions' }, '$maxDevices'] },
    },
    { $push: { redemptions: { macAddress: mac, phone, sessionId: session._id, redeemedAt: new Date() } } },
    { new: true }
  );

  if (!savedVoucher) {
    // Concurrent request claimed the last slot — evict the session we just provisioned immediately.
    // Don't rely on the cleanup job; that leaves the user with up to 5 minutes of free access.
    try {
      await removeHotspotUser(operator, session.username);
      await Session.findByIdAndUpdate(session._id, { status: 'TERMINATED', mikrotikRemoved: true });
    } catch {
      await Session.findByIdAndUpdate(session._id, { status: 'TERMINATED', mikrotikRemoved: false });
    }
    const err = new Error(
      voucher.maxDevices === 1
        ? 'This code has already been redeemed. Please purchase a new plan.'
        : `This code has reached its ${voucher.maxDevices}-device limit.`
    );
    err.statusCode = 400;
    throw err;
  }

  if (savedVoucher.redemptions.length >= savedVoucher.maxDevices) {
    await Voucher.updateOne({ _id: voucher._id }, { status: 'FULLY_REDEEMED' });
  }

  if (mac) {
    await Device.findOneAndUpdate(
      { macAddress: mac },
      { phone, lastSeen: new Date(), $inc: { sessionCount: 1 } },
      { upsert: true }
    );
  }

  logger.info('Voucher redeemed', { code: normalized, username: session.username, mac });
  return {
    username: session.username,
    password: session.password,
    expiresAt: session.expiresAt,
    bundle,
    resumed: false,
  };
};

module.exports = { generateUniqueCodes, redeemVoucher };
