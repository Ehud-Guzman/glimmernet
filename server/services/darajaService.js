const axios = require('axios');
const { getBaseUrl } = require('../config/daraja');
const configService = require('./configService');
const logger = require('../utils/logger');

// Cache the OAuth token for 55 minutes (Safaricom tokens expire after 1 hour).
// Invalidated explicitly when Daraja credentials change in Platform Settings.
let _cachedToken = null;
let _tokenExpiry = 0;

const invalidateDarajaToken = () => {
  _cachedToken = null;
  _tokenExpiry = 0;
};

const getDarajaToken = async () => {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const darajaEnv = await configService.get('daraja_env', process.env.DARAJA_ENV || 'sandbox');
  if (process.env.NODE_ENV !== 'production' && darajaEnv === 'production') {
    throw new Error(
      'BLOCKED: Cannot use production Daraja credentials outside of NODE_ENV=production. ' +
      'Set daraja_env to "sandbox" in Platform Settings.'
    );
  }

  const key = await configService.get('daraja_consumer_key', process.env.DARAJA_CONSUMER_KEY || '');
  const secret = await configService.get('daraja_consumer_secret', process.env.DARAJA_CONSUMER_SECRET || '');

  if (!key || !secret) {
    throw new Error('Daraja consumer key/secret not configured. Set them in Platform Settings → M-Pesa / Daraja.');
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const BASE_URL = await getBaseUrl();

  try {
    const res = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const token = res.data.access_token;
    _cachedToken = token;
    _tokenExpiry = Date.now() + 55 * 60 * 1000;
    logger.debug('Daraja token obtained', { tokenPrefix: token?.slice(0, 20) });
    return token;
  } catch (err) {
    logger.error('Daraja token error', {
      status: err.response?.status,
      body: err.response?.data,
      url: `${BASE_URL}/oauth/v1/generate`,
    });
    throw err;
  }
};

const initiateStkPush = async ({ phone, amount, bundleId, checkoutRef }) => {
  const [token, shortcode, passkey, appUrl, accountRef, txDesc, BASE_URL] = await Promise.all([
    getDarajaToken(),
    configService.get('daraja_shortcode', process.env.DARAJA_SHORTCODE || ''),
    configService.get('daraja_passkey', process.env.DARAJA_PASSKEY || ''),
    configService.get('app_url', process.env.APP_URL || ''),
    configService.get('stk_account_ref', 'WiFi'),
    configService.get('stk_transaction_desc', 'WiFi Access'),
    getBaseUrl(),
  ]);

  if (!shortcode || !passkey || !appUrl) {
    throw new Error('STK push not configured. Set daraja_shortcode, daraja_passkey, and app_url in Platform Settings.');
  }

  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: `${appUrl}/api/v1/payment/callback`,
    AccountReference: checkoutRef || accountRef,
    TransactionDesc: txDesc,
  };

  logger.debug('Initiating STK push', { phone, amount, bundleId });

  try {
    const res = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (err) {
    logger.error('Daraja STK push error', {
      status: err.response?.status,
      body: err.response?.data,
      shortcode,
    });
    throw err;
  }
};

/**
 * B2C — send money from the platform PayBill to an operator's phone.
 * Requires daraja_b2c_initiator_name and daraja_b2c_security_credential in Platform Settings.
 */
const initiateB2C = async ({ phone, amount, settlementId, operatorName }) => {
  const [initiatorName, securityCredential] = await Promise.all([
    configService.get('daraja_b2c_initiator_name', ''),
    configService.get('daraja_b2c_security_credential', ''),
  ]);

  if (!initiatorName || !securityCredential) {
    throw new Error(
      'B2C credentials not configured. Set daraja_b2c_initiator_name and daraja_b2c_security_credential in Platform Settings. ' +
      'Use "MANUAL" settlement method until your PayBill is active.'
    );
  }

  const [token, shortcode, appUrl, BASE_URL] = await Promise.all([
    getDarajaToken(),
    configService.get('daraja_shortcode', process.env.DARAJA_SHORTCODE || ''),
    configService.get('app_url', process.env.APP_URL || ''),
    getBaseUrl(),
  ]);

  const payload = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment',
    Amount: Math.floor(amount),
    PartyA: shortcode,
    PartyB: phone,
    Remarks: `Settlement for ${operatorName} — ref ${settlementId}`,
    QueueTimeOutURL: `${appUrl}/api/v1/payment/b2c-timeout`,
    ResultURL: `${appUrl}/api/v1/payment/b2c-callback`,
    Occasion: `SETTLE-${settlementId}`,
  };

  logger.debug('Initiating B2C', { phone, amount, settlementId });

  try {
    const res = await axios.post(
      `${BASE_URL}/mpesa/b2c/v3/paymentrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (err) {
    logger.error('Daraja B2C error', {
      status: err.response?.status,
      body: err.response?.data,
    });
    throw err;
  }
};

// Query the status of a pending STK push — used by the manual verify fallback.
const queryStkStatus = async ({ checkoutRequestId }) => {
  const [token, shortcode, passkey, BASE_URL] = await Promise.all([
    getDarajaToken(),
    configService.get('daraja_shortcode', process.env.DARAJA_SHORTCODE || ''),
    configService.get('daraja_passkey', process.env.DARAJA_PASSKEY || ''),
    getBaseUrl(),
  ]);

  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  try {
    const res = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (err) {
    logger.error('Daraja STK query error', {
      status: err.response?.status,
      body: err.response?.data,
    });
    throw err;
  }
};

module.exports = { initiateStkPush, getDarajaToken, initiateB2C, queryStkStatus, invalidateDarajaToken };
