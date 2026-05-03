require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const startSessionExpiryJob            = require('./jobs/sessionExpiry');
const startProvisionRetryJob           = require('./jobs/provisionRetry');
const startExpiryReminderJob           = require('./jobs/expiryReminder');
const startNetworkHealthCheckJob       = require('./jobs/networkHealthCheck');
const startAutoSettlementJob           = require('./jobs/autoSettlement');
const startSettlementReconciliationJob = require('./jobs/settlementReconciliation');
const startUptimePing                  = require('./jobs/uptimePing');
const startDataUsageAlertJob           = require('./jobs/dataUsageAlert');
const startOperatorReportJob           = require('./jobs/operatorReport');
const startWebhookRetryJob             = require('./jobs/webhookRetry');
const { seedDefaults } = require('./routes/settings');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}. Server will not start.`);
  process.exit(1);
}

if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  logger.warn('ENCRYPTION_KEY is not set or invalid — MikroTik passwords will be stored unencrypted. Set a 64-char hex key.');
}
if (!process.env.APP_URL) {
  logger.warn('APP_URL is not set — Daraja STK/B2C callbacks will fail in production.');
}

const start = async () => {
  await connectDB();
  await seedDefaults();
  startSessionExpiryJob();
  startProvisionRetryJob();
  startExpiryReminderJob();
  startNetworkHealthCheckJob();
  startAutoSettlementJob();
  startSettlementReconciliationJob();
  startUptimePing();
  startDataUsageAlertJob();
  startOperatorReportJob();
  startWebhookRetryJob();
  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
};

start().catch((err) => {
  logger.error('Fatal startup error', { message: err.message, stack: err.stack });
  process.exit(1);
});
