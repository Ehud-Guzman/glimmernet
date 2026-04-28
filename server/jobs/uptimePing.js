const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

const INTERVAL_MS = 14 * 60 * 1000; // 14 min — just under Render's 15-min spin-down

const startUptimePing = () => {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base) return; // local dev — skip

  const target = `${base.replace(/\/$/, '')}/health`;
  const client = target.startsWith('https') ? https : http;

  const ping = () => {
    const req = client.get(target, (res) => {
      logger.info(`uptime-ping ${res.statusCode} → ${target}`);
    });
    req.on('error', (err) => logger.warn(`uptime-ping failed: ${err.message}`));
    req.end();
  };

  setInterval(ping, INTERVAL_MS);
  logger.info(`uptime-ping armed → ${target} every 14 min`);
};

module.exports = startUptimePing;
