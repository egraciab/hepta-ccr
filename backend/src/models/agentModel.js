const pool = require('../config/db');

const listAgents = async () => {
  const { rows } = await pool.query('SELECT id, name, role, extension FROM agents ORDER BY name ASC');
  return rows;
};

const createAgent = async ({ name, role, extension }) => {
  const { rows } = await pool.query(
    'INSERT INTO agents (name, role, extension) VALUES ($1, $2, $3) RETURNING id, name, role, extension',
    [name, role || 'Agente', extension]
  );
  return rows[0];
};

const updateAgent = async (id, { name, role, extension }) => {
  const { rows } = await pool.query(
    'UPDATE agents SET name = $1, role = $2, extension = $3 WHERE id = $4 RETURNING id, name, role, extension',
    [name, role || 'Agente', extension, id]
  );
  return rows[0];
};

const deleteAgent = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM agents WHERE id = $1', [id]);
  return rowCount > 0;
};

module.exports = { listAgents, createAgent, updateAgent, deleteAgent };
