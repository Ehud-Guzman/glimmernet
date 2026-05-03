const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

// Maximum delivery attempts before giving up
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000, 3_600_000]; // 0s, 30s, 2m, 10m, 1h

const sign = (secret, body) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

/**
 * Fire a signed POST to the operator's webhookUrl.
 * Returns true on success, false on failure (caller decides retry logic).
 */
const dispatch = async (operator, event, payload) => {
  const { webhookUrl, webhookSecret } = operator;
  if (!webhookUrl) return true; // no webhook configured — not a failure

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const headers = {
    'Content-Type': 'application/json',
    'X-GlimmerInk-Event': event,
  };
  if (webhookSecret) {
    headers['X-GlimmerInk-Signature'] = sign(webhookSecret, body);
  }

  try {
    await axios.post(webhookUrl, body, { headers, timeout: 10_000 });
    logger.info('Webhook delivered', { operatorId: operator._id, event });
    return true;
  } catch (err) {
    logger.warn('Webhook delivery failed', {
      operatorId: operator._id,
      event,
      url: webhookUrl,
      message: err.message,
    });
    return false;
  }
};

/**
 * Fire-and-forget webhook with exponential back-off retries.
 * Call this from payment/session handlers — it runs in the background.
 */
const fireWebhook = (operator, event, payload, attempt = 0) => {
  if (!operator?.webhookUrl) return;

  const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

  setTimeout(async () => {
    const ok = await dispatch(operator, event, payload);
    if (!ok && attempt < MAX_ATTEMPTS - 1) {
      fireWebhook(operator, event, payload, attempt + 1);
    }
  }, delay);
};

module.exports = { fireWebhook, dispatch };
