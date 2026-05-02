const RouterOSAPI = require('node-routeros').RouterOSAPI;
const configService = require('./configService');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/fieldEncryption');

/**
 * Build a RouterOS client.
 * Operator-level settings take priority over the platform defaults stored in the DB.
 */
const getClient = async (operator) => {
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

  if (!host || !user || !password) {
    throw new Error(
      `MikroTik not configured for operator: ${operator?.name || 'default'}. ` +
      'Set mikrotik_host, mikrotik_user, and mikrotik_pass in Platform Settings.'
    );
  }

  return new RouterOSAPI({ host, user, password, port, timeout: 10 });
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

module.exports = { addHotspotUser, removeHotspotUser, getActiveSession, getHotspotUser, testConnection };
