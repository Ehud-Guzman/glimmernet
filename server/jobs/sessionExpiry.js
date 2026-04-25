const cron = require('node-cron');
const Session = require('../models/Session');
const Voucher = require('../models/Voucher');
const { removeHotspotUser } = require('../services/mikrotikService');
const logger = require('../utils/logger');

const startSessionExpiryJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    // ── 1. Mark expired sessions and attempt MikroTik removal ────────────────
    // Limit to 200 per run so a bulk expiry (e.g. after long downtime) doesn't
    // load an unbounded document set into memory.
    let expiredSessions;
    try {
      expiredSessions = await Session.find({
        status: 'ACTIVE',
        expiresAt: { $lte: new Date() },
      }).populate('operatorId').limit(200);
    } catch (err) {
      logger.error('Session expiry sweep: DB query failed', { message: err.message });
      expiredSessions = [];
    }

    for (const session of expiredSessions) {
      session.status = 'EXPIRED';
      try {
        await removeHotspotUser(session.operatorId, session.username);
        session.mikrotikRemoved = true;
        logger.info('Session expired and cleaned up', { username: session.username });
      } catch (err) {
        logger.error(`MikroTik removal failed for ${session.username} — will retry`, { message: err.message });
      }
      try {
        await session.save();
      } catch (saveErr) {
        logger.error('Failed to persist expired session', { sessionId: session._id, message: saveErr.message });
      }
    }

    // ── 2. Retry MikroTik removal for EXPIRED and TERMINATED sessions ────────
    // Limit to 100 per run to avoid loading unbounded documents when a router
    // has been offline for an extended period.
    let pendingRemoval;
    try {
      pendingRemoval = await Session.find({
        status: { $in: ['EXPIRED', 'TERMINATED'] },
        mikrotikRemoved: false,
      }).populate('operatorId').limit(100);
    } catch (err) {
      logger.error('Session expiry sweep: retry query failed', { message: err.message });
      pendingRemoval = [];
    }

    for (const session of pendingRemoval) {
      try {
        await removeHotspotUser(session.operatorId, session.username);
        session.mikrotikRemoved = true;
        await session.save();
        logger.info('MikroTik removal retry succeeded', { username: session.username, status: session.status });
      } catch { /* will retry next run */ }
    }

    // ── 3. Mark expired vouchers ─────────────────────────────────────────────
    try {
      const { modifiedCount } = await Voucher.updateMany(
        { status: 'ACTIVE', expiresAt: { $ne: null, $lte: new Date() } },
        { $set: { status: 'EXPIRED' } }
      );
      if (modifiedCount > 0) {
        logger.info(`Expired ${modifiedCount} voucher(s)`);
      }
    } catch (err) {
      logger.error('Voucher expiry sweep failed', { message: err.message });
    }
  });

  logger.info('Session expiry job started (every 5 min)');
};

module.exports = startSessionExpiryJob;
