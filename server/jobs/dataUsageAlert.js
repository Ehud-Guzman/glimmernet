const cron = require('node-cron');
const Session = require('../models/Session');
const Bundle = require('../models/Bundle');
const Operator = require('../models/Operator');
const { getUsageStats } = require('../services/mikrotikService');
const { sendDataUsageAlert } = require('../services/notificationService');
const logger = require('../utils/logger');

const ALERT_THRESHOLD = 0.80; // 80 %

const checkSession = async (session, operator) => {
  if (!session.phone) return;

  const bundle = await Bundle.findById(session.bundleId).lean();
  if (!bundle?.dataMB) return; // time-based bundle — no data cap to alert on

  try {
    const usage = await getUsageStats(operator, session.username);
    if (!usage) return;

    const totalBytes = bundle.dataMB * 1024 * 1024;
    const usedBytes  = usage.bytesIn + usage.bytesOut;
    const percent    = usedBytes / totalBytes;

    if (percent >= ALERT_THRESHOLD && !session.usageAlertSent) {
      await sendDataUsageAlert({
        phone:      session.phone,
        brandName:  operator.brandName || operator.name,
        percentUsed: percent * 100,
        bundleName: bundle.name,
        supportPhone: operator.supportPhone,
      });
      // Mark so we don't spam — reset only when session is recreated
      await Session.findByIdAndUpdate(session._id, { usageAlertSent: true });
    }
  } catch (err) {
    // Non-fatal — router may be momentarily unreachable
    logger.debug('Data usage check failed', { sessionId: session._id, message: err.message });
  }
};

const runDataUsageAlert = async () => {
  const sessions = await Session.find({
    status: 'ACTIVE',
    phone: { $nin: ['', null] },
    usageAlertSent: false,
  }).populate('operatorId').limit(500);

  await Promise.allSettled(sessions.map((s) => checkSession(s, s.operatorId)));
};

const startDataUsageAlertJob = () => {
  cron.schedule('*/10 * * * *', async () => {
    try {
      await runDataUsageAlert();
    } catch (err) {
      logger.error('Data usage alert job error', { message: err.message });
    }
  });
  logger.info('Data usage alert job started (every 10 min)');
};

module.exports = startDataUsageAlertJob;
