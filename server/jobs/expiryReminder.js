const cron = require('node-cron');
const Session = require('../models/Session');
const Operator = require('../models/Operator');
const { sendSms, isConfigured } = require('../services/notificationService');
const logger = require('../utils/logger');

const runExpiryReminder = async () => {
  if (!(await isConfigured())) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 10 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 20 * 60 * 1000);

  const sessions = await Session.find({
    status: 'ACTIVE',
    reminderSent: false,
    phone: { $nin: ['', null] }, // skip MAC-only/voucher sessions with no phone to SMS
    expiresAt: { $gte: windowStart, $lte: windowEnd },
  }).limit(100);

  for (const session of sessions) {
    try {
      const operator = session.operatorId
        ? await Operator.findById(session.operatorId).select('brandName name supportPhone')
        : null;

      const brand = operator?.brandName || operator?.name || 'WiFi';
      const minsLeft = Math.round((session.expiresAt - now) / 60000);
      const support = operator?.supportPhone ? ` Support: ${operator.supportPhone}` : '';
      const message = `${brand}: Your session expires in ~${minsLeft} minutes. Buy another bundle to stay connected.${support}`;

      await sendSms({ to: session.phone, message });
      await Session.findByIdAndUpdate(session._id, { $set: { reminderSent: true } });
      logger.info('Expiry reminder sent', { sessionId: session._id, phone: session.phone });
    } catch (err) {
      logger.warn('Expiry reminder failed', { sessionId: session._id, message: err.message });
    }
  }
};

const startExpiryReminderJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runExpiryReminder();
    } catch (err) {
      logger.error('Expiry reminder job error', { message: err.message });
    }
  });
  logger.info('Expiry reminder job started (every 5 min)');
};

module.exports = startExpiryReminderJob;
