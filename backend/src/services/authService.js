const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const login = async ({ email, password }) => {
  const user = await userModel.findByEmail(email);
  if (!user) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '12h' }
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
};

const register = async ({ name, email, password, role }) => {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    const error = new Error('Email already in use');
    error.status = 409;
    throw error;
  }

  const hash = await bcrypt.hash(password, 10);
  return userModel.createUser({ name, email, password: hash, role });
};

module.exports = { login, register };
