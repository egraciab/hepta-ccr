const jwt = require('jsonwebtoken');

const authMiddleware = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing or invalid authorization header');
    error.status = 401;
    return next(error);
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = payload;
    return next();
  } catch (_error) {
    const error = new Error('Invalid or expired token');
    error.status = 401;
    return next(error);
  }
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    const error = new Error('Forbidden');
    error.status = 403;
    return next(error);
  }

  return next();
};

module.exports = {
  authMiddleware,
  requireRole,
};
