const jwt = require('jsonwebtoken');
const Operator = require('../models/Operator');

const protectOperator = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'operator') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const operator = await Operator.findById(decoded.id).select('-passwordHash');
    if (!operator || operator.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, message: 'Account is inactive or not found.' });
    }

    req.operator = operator;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

module.exports = { protectOperator };
