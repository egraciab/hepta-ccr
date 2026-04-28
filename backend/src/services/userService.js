const userModel = require('../models/userModel');

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

module.exports = {
  listUsers: userModel.listUsers,
  deleteUserSafely,
};
