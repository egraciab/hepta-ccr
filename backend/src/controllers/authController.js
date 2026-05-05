const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const role = ['admin', 'supervisor', 'viewer'].includes(req.body.role) ? req.body.role : 'viewer';
    const result = await authService.register({ ...req.body, role });
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, register };
