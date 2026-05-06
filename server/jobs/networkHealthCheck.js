const cron = require('node-cron');
const util = require('util');
const Operator = require('../models/Operator');
const OperatorRouter = require('../models/OperatorRouter');
const { testConnection, testRouterConnection } = require('../services/mikrotikService');
const { sendSms, isConfigured } = require('../services/notificationService');
const logger = require('../utils/logger');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkOperator = async (operator, smsEnabled) => {
  const prevStatus = operator.healthStatus;
  let healthStatus = prevStatus;
  let healthError = operator.healthError || '';
  let failureCount = operator.healthFailureCount || 0;
  let successCount = operator.healthSuccessCount || 0;

  try {
    await testConnection(operator);
    failureCount = 0;
    successCount += 1;
    healthStatus = 'OK';
    healthError = '';
  } catch (err) {
    successCount = 0;
    failureCount += 1;
    const errorMessage = err.message || err.name || String(err) || 'Unknown error';
    healthError = errorMessage.slice(0, 200);

    logger.warn('MikroTik health check failed', {
      operatorId: operator._id,
      name: operator.name,
      host: operator.mikrotikHost,
      port: operator.mikrotikPort,
      error: errorMessage,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      stack: err.stack,
      raw: util.inspect(err, { depth: 4 }),
      failureCount,
    });

    if (failureCount >= 2) {
      healthStatus = 'DOWN';
    } else {
      healthStatus = prevStatus || 'UNKNOWN';
    }
  }

  await Operator.findByIdAndUpdate(operator._id, {
    $set: {
      healthStatus,
      healthError,
      lastHealthCheck: new Date(),
      healthFailureCount: failureCount,
      healthSuccessCount: successCount,
    },
  });

  const stableDown = failureCount >= 2 && healthStatus === 'DOWN';
  const isStatusChange = healthStatus !== prevStatus;

  if (stableDown || (healthStatus === 'OK' && isStatusChange)) {
    const msg = healthStatus === 'DOWN'
      ? `GlimmerInk Alert: Your router (${operator.name}) is unreachable. Sessions may not provision. Error: ${healthError}`
      : `GlimmerInk: Your router (${operator.name}) is back online.`;

    if (smsEnabled && operator.ownerPhone) {
      try {
        await sendSms({ to: operator.ownerPhone, message: msg });
      } catch (smsErr) {
        logger.warn('Health alert SMS failed', { operatorId: operator._id, message: smsErr.message });
      }
    }
  }

  if (isStatusChange) {
    logger.info('Operator health status changed', {
      operatorId: operator._id,
      name: operator.name,
      from: prevStatus,
      to: healthStatus,
    });
  }

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

const checkOperatorRouter = async (router) => {
  const prevStatus = router.healthStatus;
  let healthStatus = prevStatus;
  let healthError = router.healthError || '';

  try {
    await testRouterConnection(router);
    healthStatus = 'OK';
    healthError = '';
  } catch (err) {
    const errorMessage = err.message || err.name || String(err) || 'Unknown error';
    healthError = errorMessage.slice(0, 200);

    logger.warn('OperatorRouter health check failed', {
      routerId: router._id,
      operatorId: router.operatorId,
      name: router.name,
      host: router.host,
      port: router.port,
      error: errorMessage,
    });

    healthStatus = 'DOWN';
  }

  await OperatorRouter.findByIdAndUpdate(router._id, {
    $set: {
      healthStatus,
      healthError,
      lastHealthCheck: new Date(),
    },
  });

  const isStatusChange = healthStatus !== prevStatus;

  if (isStatusChange) {
    logger.info('OperatorRouter health status changed', {
      routerId: router._id,
      operatorId: router.operatorId,
      name: router.name,
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

  // Also check all active OperatorRouters
  const routers = await OperatorRouter.find({ isActive: true });
  await Promise.allSettled(routers.map((router) => checkOperatorRouter(router)));
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
