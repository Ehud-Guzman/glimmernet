const axios = require('axios');
const configService = require('./configService');
const logger = require('../utils/logger');

const AT_BASE = 'https://api.africastalking.com/version1/messaging';
const AT_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging';

const getAtConfig = async () => {
  const [apiKey, username, sandbox, senderId, smsEnabled] = await Promise.all([
    configService.get('at_api_key', ''),
    configService.get('at_username', ''),
    configService.get('at_sandbox', true),
    configService.get('at_sender_id', ''),
    configService.get('sms_enabled', false),
  ]);
  return { apiKey, username, sandbox, senderId, smsEnabled };
};

const isConfigured = async () => {
  const { apiKey, username, smsEnabled } = await getAtConfig();
  return !!(smsEnabled && apiKey && username);
};

const formatExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  return new Date(expiresAt).toLocaleString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
};

const toInternational = (phone) => {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) return '+254' + clean.slice(1);
  if (clean.startsWith('254')) return '+' + clean;
  return '+' + clean;
};

const sendSms = async ({ to, message }) => {
  const { apiKey, username, sandbox, senderId } = await getAtConfig();
  const url = sandbox === true || sandbox === 'true' ? AT_SANDBOX_URL : AT_BASE;

  const params = { username, to: toInternational(to), message };
  if (senderId) params.from = senderId;

  await axios.post(
    url,
    new URLSearchParams(params).toString(),
    {
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
};

/**
 * Send SMS receipt after successful payment.
 * Gracefully skips if SMS is disabled or Africa's Talking is not configured.
 */
const sendPaymentReceipt = async ({ phone, brandName, bundleName, expiresAt, mpesaReceipt, supportPhone }) => {
  if (!(await isConfigured())) {
    logger.debug('SMS not configured or disabled — skipping payment receipt');
    return;
  }

  const defaultSupport = await configService.get('support_phone', '');
  const support = supportPhone || defaultSupport;
  const expiry = formatExpiry(expiresAt);

  const lines = [
    `Connected to ${brandName}!`,
    `Plan: ${bundleName}`,
    expiry ? `Expires: ${expiry}` : null,
    mpesaReceipt ? `Receipt: ${mpesaReceipt}` : null,
    support ? `Support: ${support}` : null,
  ].filter(Boolean);

  try {
    await sendSms({ to: phone, message: lines.join('\n') });
    logger.info('SMS receipt sent', { phone, brandName });
  } catch (err) {
    // Non-fatal — customer is already connected, SMS is a nice-to-have
    logger.warn('SMS receipt failed', { phone, message: err.response?.data || err.message });
  }
};

/**
 * Send trial activation SMS so the customer knows their time is ticking.
 */
const sendTrialNotice = async ({ phone, brandName, trialMinutes, supportPhone }) => {
  if (!(await isConfigured()) || !phone) return;

  const defaultSupport = await configService.get('support_phone', '');
  const support = supportPhone || defaultSupport;

  const lines = [
    `Welcome to ${brandName}!`,
    `You have ${trialMinutes} free minutes. Enjoy the speed!`,
    'Top up with M-Pesa to stay connected.',
    support ? `Support: ${support}` : null,
  ].filter(Boolean);

  try {
    await sendSms({ to: phone, message: lines.join('\n') });
    logger.info('Trial SMS sent', { phone, brandName });
  } catch (err) {
    logger.warn('Trial SMS failed', { phone, message: err.response?.data || err.message });
  }
};

module.exports = { sendPaymentReceipt, sendTrialNotice, sendSms, isConfigured };
