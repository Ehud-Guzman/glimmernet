const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const sanitizePhone = (phone) => {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (p.startsWith('+')) p = p.slice(1);
  return p;
};

const generatePassword = (length = 8) => {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
};

const generateUsername = (phone) => {
  const rand = crypto.randomBytes(2).toString('hex');
  return `u_${phone}_${Date.now()}_${rand}`;
};

const createResumeToken = (session) => {
  const payload = {
    type: 'session_resume',
    sid: session._id.toString(),
    mac: session.macAddress || '',
    operatorId: session.operatorId ? session.operatorId.toString() : '',
  };

  const expiresIn = session.expiresAt
    ? Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
    : '30d';

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

const verifyResumeToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = {
  sanitizePhone,
  generatePassword,
  generateUsername,
  createResumeToken,
  verifyResumeToken,
};
