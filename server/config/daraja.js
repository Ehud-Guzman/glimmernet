const configService = require('../services/configService');

const getBaseUrl = async () => {
  const env = await configService.get('daraja_env', process.env.DARAJA_ENV || 'sandbox');
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
};

module.exports = { getBaseUrl };
