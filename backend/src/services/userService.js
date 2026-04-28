const userModel = require('../models/userModel');

module.exports = {
  listUsers: userModel.listUsers,
  deleteUser: userModel.deleteUser,
};
