const pool = require('../config/db');

const listAgents = async ({ includeDisabled = false } = {}) => {
  const where = includeDisabled ? '' : 'WHERE enabled = true';
  const { rows } = await pool.query(`SELECT id, name, alias, role, extension, enabled, last_seen_at FROM agents ${where} ORDER BY COALESCE(alias, name, extension) ASC`);
  return rows;
};

const updateAgent = async (id, { alias, role, enabled }) => {
  const { rows } = await pool.query(
    `UPDATE agents
     SET alias = COALESCE($1, alias),
         role = COALESCE($2, role),
         enabled = COALESCE($3, enabled)
     WHERE id = $4
     RETURNING id, name, alias, role, extension, enabled, last_seen_at`,
    [alias ?? null, role ?? null, enabled ?? null, id]
  );
  return rows[0];
};

module.exports = { listAgents, updateAgent };
