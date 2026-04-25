const cron = require('node-cron');
const Operator = require('../models/Operator');
const { testConnection } = require('../services/mikrotikService');
const { sendSms, isConfigured } = require('../services/notificationService');
const logger = require('../utils/logger');

const checkOperator = async (operator, smsEnabled) => {
  const prevStatus = operator.healthStatus;
  let healthStatus, healthError;

  try {
    await testConnection(operator);
    healthStatus = 'OK';
    healthError = '';
  } catch (err) {
    healthStatus = 'DOWN';
    healthError = err.message.slice(0, 200);
  }

  await Operator.findByIdAndUpdate(operator._id, {
    $set: { healthStatus, healthError, lastHealthCheck: new Date() },
  });

  if (healthStatus !== prevStatus && smsEnabled && operator.ownerPhone) {
    const msg = healthStatus === 'DOWN'
      ? `GlimmerInk Alert: Your router (${operator.name}) is unreachable. Sessions may not provision. Error: ${healthError}`
      : `GlimmerInk: Your router (${operator.name}) is back online.`;

    try {
      await sendSms({ to: operator.ownerPhone, message: msg });
    } catch (err) {
      logger.warn('Health alert SMS failed', { operatorId: operator._id, message: err.message });
    }
  }

  if (healthStatus !== prevStatus) {
    logger.info('Operator health status changed', {
      operatorId: operator._id,
      name: operator.name,
      from: prevStatus,
      to: healthStatus,
    });
  }
};

const runNetworkHealthCheck = async () => {
  const operators = await Operator.find({
    status: 'ACTIVE',
    mikrotikHost: { $nin: ['', null] },
  }).select('name ownerPhone mikrotikHost mikrotikPort mikrotikUser mikrotikPass healthStatus');

  const smsEnabled = await isConfigured();

  await Promise.allSettled(operators.map((op) => checkOperator(op, smsEnabled)));
};

const startNetworkHealthCheckJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runNetworkHealthCheck();
    } catch (err) {
      logger.error('Network health check job error', { message: err.message });
    }
  });
  logger.info('Network health check job started (every 5 min)');
};

module.exports = startNetworkHealthCheckJob;
