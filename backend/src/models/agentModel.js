const pool = require('../config/db');

const listAgents = async () => {
  const { rows } = await pool.query('SELECT id, name, extension FROM agents ORDER BY name ASC');
  return rows;
};

const createAgent = async ({ name, extension }) => {
  const { rows } = await pool.query(
    'INSERT INTO agents (name, extension) VALUES ($1, $2) RETURNING id, name, extension',
    [name, extension]
  );
  return rows[0];
};

const updateAgent = async (id, { name, extension }) => {
  const { rows } = await pool.query(
    'UPDATE agents SET name = $1, extension = $2 WHERE id = $3 RETURNING id, name, extension',
    [name, extension, id]
  );
  return rows[0];
};

const deleteAgent = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM agents WHERE id = $1', [id]);
  return rowCount > 0;
};

module.exports = { listAgents, createAgent, updateAgent, deleteAgent };
