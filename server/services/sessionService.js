const Session = require('../models/Session');
const Bundle = require('../models/Bundle');
const Device = require('../models/Device');
const Operator = require('../models/Operator');
const { addHotspotUser, removeHotspotUser, getHotspotUser } = require('./mikrotikService');
const { generateUsername, generatePassword } = require('../utils/helpers');
const logger = require('../utils/logger');

const calculateExpiry = (bundle, durationMinutesOverride = null) => {
  const durationMinutes = durationMinutesOverride ?? bundle.durationMinutes;
  return durationMinutes
    ? new Date(Date.now() + durationMinutes * 60 * 1000)
    : null;
};

const provisionSessionAccess = async ({ operator, username, password, bundle, comment }) => {
  await addHotspotUser(operator, {
    username,
    password,
    profile: bundle.mikrotikProfile,
    comment,
    dataMB: bundle.dataMB,
  });
};

const loadSessionContext = async (sessionOrDoc) => {
  const session = sessionOrDoc instanceof Session
    ? sessionOrDoc
    : await Session.findById(sessionOrDoc);

  if (!session) return { session: null, bundle: null, operator: null };

  const bundle = session.bundleId?.dataMB !== undefined
    ? session.bundleId
    : await Bundle.findById(session.bundleId);
  const operator = session.operatorId && session.operatorId?.shortCode === undefined
    ? await Operator.findById(session.operatorId)
    : session.operatorId || null;

  return { session, bundle, operator };
};

const expireSession = async (session, operator, reason = 'expired') => {
  try {
    await removeHotspotUser(operator, session.username);
    session.mikrotikRemoved = true;
  } catch (err) {
    logger.warn('Failed removing expired hotspot user', {
      username: session.username,
      message: err.message,
    });
  }

  session.status = 'EXPIRED';
  if (!session.expiresAt) session.expiresAt = new Date();
  await session.save();

  logger.info('Session expired', {
    sessionId: session._id,
    username: session.username,
    reason,
  });

  return session;
};

const syncSessionState = async (sessionOrDoc) => {
  const { session, bundle, operator } = await loadSessionContext(sessionOrDoc);
  if (!session || session.status !== 'ACTIVE') return session;

  const now = new Date();
  if (session.expiresAt && session.expiresAt <= now) {
    return expireSession(session, operator, 'time_limit');
  }

  if (!bundle?.dataMB) return session;

  try {
    const routerUser = await getHotspotUser(operator, session.username);
    const bytesIn = Number(routerUser?.['bytes-in'] || 0);
    const bytesOut = Number(routerUser?.['bytes-out'] || 0);
    const bytesUsed = bytesIn + bytesOut;
    const bytesLimit = Number(routerUser?.['limit-bytes-total'] || 0);
    const disabled = String(routerUser?.disabled || 'false') === 'true';
    const exhausted = !routerUser || disabled || (bytesLimit > 0 && bytesUsed >= bytesLimit);

    if (exhausted) {
      return expireSession(session, operator, !routerUser ? 'router_user_missing' : 'data_limit');
    }
  } catch (err) {
    logger.warn('Could not sync session state from MikroTik', {
      sessionId: session._id,
      username: session.username,
      message: err.message,
    });
  }

  return session;
};

const createProvisionedSession = async ({
  phone = '',
  macAddress = '',
  bundle,
  operator = null,
  transactionId = null,
  voucherId = null,
  isTrial = false,
  trialMinutes = null,
  comment = '',
  usernameSeed = '',
}) => {
  if (!bundle) throw new Error('Bundle is required to create a session');

  const normalizedMac = macAddress ? macAddress.toUpperCase() : '';
  const username = generateUsername(usernameSeed || phone || normalizedMac || 'wifi');
  const password = generatePassword();
  const expiresAt = calculateExpiry(bundle, trialMinutes);

  await provisionSessionAccess({
    operator,
    username,
    password,
    bundle,
    comment,
  });

  try {
    const session = await Session.create({
      phone,
      username,
      password,
      macAddress: normalizedMac,
      bundleId: bundle._id,
      transactionId,
      operatorId: operator?._id || null,
      voucherId,
      expiresAt,
      isTrial,
    });

    if (normalizedMac) {
      await Device.findOneAndUpdate(
        { macAddress: normalizedMac },
        { phone, lastSeen: new Date(), $inc: { sessionCount: 1 } },
        { upsert: true }
      );
    }

    logger.info('Session created', { sessionId: session._id, username, phone });
    return session;
  } catch (err) {
    try {
      await removeHotspotUser(operator, username);
    } catch (cleanupErr) {
      logger.error('Failed to clean up MikroTik user after session persistence error', {
        username,
        message: cleanupErr.message,
      });
    }
    throw err;
  }
};

const createSession = async (transaction) => {
  const bundle = await Bundle.findById(transaction.bundleId);
  if (!bundle) throw new Error('Bundle not found for transaction');

  const operator = transaction.operatorId
    ? await Operator.findById(transaction.operatorId)
    : null;

  return createProvisionedSession({
    phone: transaction.phone,
    macAddress: transaction.macAddress || '',
    bundle,
    operator,
    transactionId: transaction._id,
    comment: `txn:${transaction._id}`,
    usernameSeed: transaction.phone,
  });
};

module.exports = { calculateExpiry, createProvisionedSession, syncSessionState, createSession };
