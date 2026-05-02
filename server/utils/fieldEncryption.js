const crypto = require('crypto');

const ALGO = 'aes-256-cbc';
const PREFIX = 'ENC:';

const getKey = () => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
};

const encrypt = (plaintext) => {
  const key = getKey();
  if (!key || !plaintext) return plaintext;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return PREFIX + iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (value) => {
  if (!value || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;
  const rest = value.slice(PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return value;
  const iv = Buffer.from(rest.slice(0, colonIdx), 'hex');
  const data = Buffer.from(rest.slice(colonIdx + 1), 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  return decipher.update(data) + decipher.final('utf8');
};

module.exports = { encrypt, decrypt };
