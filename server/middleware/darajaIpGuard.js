const configService = require('../services/configService');
const logger = require('../utils/logger');

// Safaricom's published M-Pesa callback IP ranges (production).
// Source: Safaricom Daraja developer docs.
const SAFARICOM_IPS = new Set([
  '196.201.214.200', '196.201.214.206', '196.201.213.114',
  '196.201.214.207', '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.138', '196.201.212.129',
  '196.201.212.136', '196.201.212.74',  '196.201.212.69',
]);

// Middleware to block fake Daraja callbacks from non-Safaricom IPs.
// Only enforced when daraja_env === 'production'.
// Configurable override via DARAJA_ALLOWED_IPS env var (comma-separated) for custom proxy setups.
const darajaIpGuard = async (req, res, next) => {
  try {
    const darajaEnv = await configService.get('daraja_env', process.env.DARAJA_ENV || 'sandbox');
    if (darajaEnv !== 'production') return next();

    // Behind a reverse proxy (Render, nginx), real client IP is in X-Forwarded-For.
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.ip;

    // Allow additional IPs via env var (e.g. internal test runner IP).
    const extraIps = process.env.DARAJA_ALLOWED_IPS
      ? new Set(process.env.DARAJA_ALLOWED_IPS.split(',').map((s) => s.trim()))
      : new Set();

    if (!SAFARICOM_IPS.has(clientIp) && !extraIps.has(clientIp)) {
      logger.warn('Daraja callback rejected — IP not in Safaricom allowlist', { clientIp });
      return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
    }

    next();
  } catch {
    // Fail-open: if config is unreachable, allow the callback to avoid blocking real payments.
    next();
  }
};

module.exports = darajaIpGuard;
