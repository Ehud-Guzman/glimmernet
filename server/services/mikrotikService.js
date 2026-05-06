const RouterOSAPI = require('node-routeros').RouterOSAPI;
const configService = require('./configService');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/fieldEncryption');

/**
 * Build a RouterOS client.
 * Priority: explicit router doc > operator-level settings > platform defaults.
 * Pass a router doc (OperatorRouter) as the second argument to target a sub-router.
 */
const getClient = async (operator, router = null) => {
  // Sub-router takes full precedence when provided
  if (router?.host) {
    const password = decrypt(router.pass || '');
    if (!password) throw new Error(`MikroTik password not set for router: ${router.name}`);
    return new RouterOSAPI({ host: router.host, user: router.user, password, port: router.port || 8728, timeout: 30 });
  }

  const [defaultHost, defaultUser, defaultPass, defaultPort] = await Promise.all([
    configService.get('mikrotik_host', ''),
    configService.get('mikrotik_user', 'admin'),
    configService.get('mikrotik_pass', ''),
    configService.get('mikrotik_port', 8728),
  ]);

  const host = operator?.mikrotikHost || defaultHost;
  const user = operator?.mikrotikUser || defaultUser;
  const password = decrypt(operator?.mikrotikPass || defaultPass);
  const port = operator?.mikrotikPort || Number(defaultPort);

  if (!host || !user) {
    throw new Error(
      `MikroTik not configured for operator: ${operator?.name || 'default'}. ` +
      'Set mikrotik_host and mikrotik_user in Platform Settings.'
    );
  }

  return new RouterOSAPI({ host, user, password, port, timeout: 30 });
};

const addHotspotUser = async (operator, { username, password, profile, comment, dataMB }) => {
  const client = await getClient(operator);
  await client.connect();
  try {
    const args = [
      `=name=${username}`,
      `=password=${password}`,
      `=profile=${profile || 'default'}`,
      `=comment=${comment || ''}`,
      `=disabled=no`,
    ];
    if (dataMB && dataMB > 0) {
      args.push(`=limit-bytes-total=${dataMB * 1024 * 1024}`);
    }
    const result = await client.write('/ip/hotspot/user/add', args);
    logger.info('MikroTik user created', { username, profile, dataMB: dataMB || 'unlimited', router: client.host });
    return result;
  } finally {
    client.close();
  }
};

const removeHotspotUser = async (operator, username) => {
  const client = await getClient(operator);
  await client.connect();
  try {
    const users = await client.write('/ip/hotspot/user/print', [`?name=${username}`]);
    if (!users.length) return;
    await client.write('/ip/hotspot/user/remove', [`=.id=${users[0]['.id']}`]);
    logger.info('MikroTik user removed', { username, router: client.host });
  } finally {
    client.close();
  }
};

const getActiveSession = async (operator, username) => {
  const client = await getClient(operator);
  await client.connect();
  try {
    const sessions = await client.write('/ip/hotspot/active/print', [`?user=${username}`]);
    return sessions[0] || null;
  } finally {
    client.close();
  }
};

const getHotspotUser = async (operator, username) => {
  const client = await getClient(operator);
  await client.connect();
  try {
    const users = await client.write('/ip/hotspot/user/print', [`?name=${username}`]);
    return users[0] || null;
  } finally {
    client.close();
  }
};

const testConnection = async (operator) => {
  const client = await getClient(operator);
  await client.connect();
  try {
    const identity = await client.write('/system/identity/print');
    logger.info('MikroTik test connection OK', { router: client.host });
    return { identity: identity[0]?.name || 'unknown' };
  } finally {
    client.close();
  }
};

/**
 * Get real-time usage stats for a hotspot user from the active sessions table.
 * Returns { bytesIn, bytesOut, uptime } or null if user not active.
 */
const getUsageStats = async (operator, username, router = null) => {
  const client = await getClient(operator, router);
  await client.connect();
  try {
    const sessions = await client.write('/ip/hotspot/active/print', [`?user=${username}`]);
    if (!sessions.length) return null;
    const s = sessions[0];
    return {
      bytesIn:  parseInt(s['bytes-in']  || '0', 10),
      bytesOut: parseInt(s['bytes-out'] || '0', 10),
      uptime:   s.uptime || '',
    };
  } finally {
    client.close();
  }
};

/**
 * Kick (disconnect) a user from the active session table without removing their user account.
 * Useful for immediate disconnect without full session termination.
 */
const kickActiveSession = async (operator, username, router = null) => {
  const client = await getClient(operator, router);
  await client.connect();
  try {
    const sessions = await client.write('/ip/hotspot/active/print', [`?user=${username}`]);
    for (const s of sessions) {
      await client.write('/ip/hotspot/active/remove', [`=.id=${s['.id']}`]).catch(() => {});
    }
    logger.info('MikroTik active session kicked', { username });
  } finally {
    client.close();
  }
};

/**
 * Test connection to a specific sub-router (OperatorRouter doc).
 */
const testRouterConnection = async (router) => {
  const client = await getClient(null, router);
  await client.connect();
  try {
    const identity = await client.write('/system/identity/print');
    return { identity: identity[0]?.name || 'unknown' };
  } finally {
    client.close();
  }
};

module.exports = { addHotspotUser, removeHotspotUser, getActiveSession, getHotspotUser, testConnection, getUsageStats, kickActiveSession, testRouterConnection };
