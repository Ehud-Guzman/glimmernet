const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });
  const status = err.statusCode || 500;

  const body = { success: false, message: err.message || 'Internal server error' };

  // Never leak stack traces or internal details to clients in production
  if (status === 500 && process.env.NODE_ENV === 'production') {
    body.message = 'An unexpected error occurred. Please try again.';
  }

  res.status(status).json(body);
};

module.exports = errorHandler;
