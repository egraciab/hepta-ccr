const userService = require('../services/userService');
const authService = require('../services/authService');

const list = async (_req, res, next) => {
  try {
    res.json({ data: await userService.listUsers() });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    userService.ensureNotRestricted();
    const role = ['admin', 'supervisor', 'viewer'].includes(req.body.role) ? req.body.role : 'viewer';
    const user = await authService.register({ ...req.body, role });
    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const user = await userService.updateUserSafely(req.params.id, req.body);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const updated = await userService.changePassword(req.params.id, req.body.password);
    res.json({ data: { updated } });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await userService.deleteUserSafely(req.params.id, req.user.id);
    res.json({ data: { deleted } });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, create, update, changePassword, remove };
