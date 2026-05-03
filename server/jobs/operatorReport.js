const cron = require('node-cron');
const Operator = require('../models/Operator');
const { sendOperatorReport } = require('../services/reportService');
const logger = require('../utils/logger');

const runOperatorReports = async (frequency) => {
  const operators = await Operator.find({
    status: 'ACTIVE',
    reportEmailEnabled: true,
    reportFrequency: frequency,
    email: { $nin: ['', null] },
  }).select('name brandName email reportFrequency reportEmailEnabled _id');

  logger.info(`Sending ${frequency} reports to ${operators.length} operator(s)`);

  for (const op of operators) {
    try {
      const sent = await sendOperatorReport(op);
      if (sent) {
        await Operator.findByIdAndUpdate(op._id, { reportLastSentAt: new Date() });
      }
    } catch (err) {
      logger.warn('Operator report failed', { operatorId: op._id, message: err.message });
    }
  }
};

const startOperatorReportJob = () => {
  // Daily reports — 7:00 AM Nairobi (04:00 UTC)
  cron.schedule('0 4 * * *', async () => {
    try { await runOperatorReports('daily'); } catch (err) {
      logger.error('Operator daily report job error', { message: err.message });
    }
  });

  // Weekly reports — Monday 7:00 AM Nairobi
  cron.schedule('0 4 * * 1', async () => {
    try { await runOperatorReports('weekly'); } catch (err) {
      logger.error('Operator weekly report job error', { message: err.message });
    }
  });

  logger.info('Operator report job started (daily 04:00 UTC + weekly Monday 04:00 UTC)');
};

module.exports = startOperatorReportJob;
