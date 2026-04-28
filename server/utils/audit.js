const AdminLog = require('../models/AdminLog');
const logger = require('./logger');

/**
 * Write an audit log entry.
 * Always fire-and-forget — never throws, never blocks the calling request.
 */
const audit = async ({
  actor,
  actorModel,
  actorName = '',
  action,
  targetModel = '',
  targetId = null,
  meta = {},
}) => {
  try {
    await AdminLog.create({ actor, actorModel, actorName, action, targetModel, targetId, meta });
  } catch (err) {
    logger.warn('Audit log write failed', { action, message: err.message });
    console.error('[audit] write failed:', action, err.message);
  }
};

module.exports = { audit };
