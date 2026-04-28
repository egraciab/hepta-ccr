const pool = require('../config/db');

const findByEmail = async (email) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [id]);
  return rows[0];
};

const countAdmins = async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'");
  return rows[0].total;
};

const listUsers = async () => {
  const { rows } = await pool.query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
};

const createUser = async ({ name, email, password, role }) => {
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
    [name, email, password, role]
  );
  return rows[0];
};

const deleteUser = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return rowCount > 0;
};

module.exports = { findByEmail, findById, countAdmins, listUsers, createUser, deleteUser };
