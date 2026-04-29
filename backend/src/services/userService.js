const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const licenseService = require('./licenseService');

const ensureNotRestricted = () => {
  if (licenseService.getStatus().restricted) {
    const error = new Error('Sistema en modo restringido por licencia');
    error.status = 403;
    throw error;
  }
};

const deleteUserSafely = async (targetUserId, actorUserId) => {
  const id = Number.parseInt(targetUserId, 10);
  const actorId = Number.parseInt(actorUserId, 10);

  if (id === actorId) {
    const error = new Error('No puedes eliminar tu propio usuario');
    error.status = 400;
    throw error;
  }

  const target = await userModel.findById(id);
  if (!target) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  if (target.role === 'admin') {
    const adminCount = await userModel.countAdmins();
    if (adminCount <= 1) {
      const error = new Error('No se puede eliminar el último usuario administrador');
      error.status = 400;
      throw error;
    }
  }

  return userModel.deleteUser(id);
};

const updateUserSafely = async (targetUserId, payload) => {
  ensureNotRestricted();

  const id = Number.parseInt(targetUserId, 10);
  const existing = await userModel.findById(id);
  if (!existing) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  if (existing.role === 'admin' && payload.role && payload.role !== 'admin') {
    const adminCount = await userModel.countAdmins();
    if (adminCount <= 1) {
      const error = new Error('No se puede remover el rol del último administrador');
      error.status = 400;
      throw error;
    }
  }

  return userModel.updateUser(id, {
    name: payload.name || existing.name,
    email: payload.email || existing.email,
    role: payload.role || existing.role,
  });
};

const changePassword = async (targetUserId, password) => {
  ensureNotRestricted();
  if (!password || password.length < 6) {
    const error = new Error('La contraseña debe tener al menos 6 caracteres');
    error.status = 400;
    throw error;
  }

  const hash = await bcrypt.hash(password, 10);
  return userModel.updatePassword(Number.parseInt(targetUserId, 10), hash);
};

module.exports = {
  listUsers: userModel.listUsers,
  deleteUserSafely,
  updateUserSafely,
  changePassword,
  ensureNotRestricted,
};
