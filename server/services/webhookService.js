const crypto = require('crypto');
const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 10_000, 30_000];

const sign = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

const attemptDelivery = (operator, event, payload, signature, attempt) => {
  const url = new URL(operator.webhookUrl);
  const transport = url.protocol === 'https:' ? https : http;
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-GlimmerInk-Signature': signature,
      'X-GlimmerInk-Event': event,
    },
    timeout: 8000,
  };

  const req = transport.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      logger.info('Webhook delivered', { operatorId: operator._id, event, status: res.statusCode, attempt });
    } else {
      scheduleRetry(operator, event, payload, signature, attempt, `HTTP ${res.statusCode}`);
    }
  });

  req.on('error', (err) => {
    scheduleRetry(operator, event, payload, signature, attempt, err.message);
  });

  req.on('timeout', () => {
    req.destroy();
    scheduleRetry(operator, event, payload, signature, attempt, 'timeout');
  });

  req.write(payload);
  req.end();
};

const scheduleRetry = (operator, event, payload, signature, attempt, reason) => {
  const next = attempt + 1;
  if (next >= MAX_ATTEMPTS) {
    logger.error('Webhook delivery permanently failed — dead-letter', {
      operatorId: operator._id,
      event,
      attempts: MAX_ATTEMPTS,
      lastError: reason,
    });
    return;
  }
  logger.warn('Webhook delivery failed — retrying', {
    operatorId: operator._id,
    event,
    attempt: next,
    delayMs: RETRY_DELAYS_MS[next],
    reason,
  });
  setTimeout(() => attemptDelivery(operator, event, payload, signature, next), RETRY_DELAYS_MS[next]);
};

const fireWebhook = (operator, event, data) => {
  if (!operator.webhookUrl) return;

  const payload = JSON.stringify({ event, data, ts: Date.now() });
  const signature = operator.webhookSecret
    ? `sha256=${sign(operator.webhookSecret, payload)}`
    : '';

  attemptDelivery(operator, event, payload, signature, 0);
};

module.exports = { fireWebhook };
