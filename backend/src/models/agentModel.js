const pool = require('../config/db');

const listAgents = async () => {
  const { rows } = await pool.query('SELECT agents.id, agents.name, agents.alias, agents.role, agents.extension, agents.enabled, agents.last_seen_at FROM agents ORDER BY COALESCE(agents.alias, agents.name, agents.extension) ASC');
  return rows;
};

const updateAgent = async (id, { alias, role, enabled }) => {
  const { rows } = await pool.query(
    `UPDATE agents
     SET alias = COALESCE($1, alias),
         role = COALESCE($2, role),
         enabled = COALESCE($3, enabled)
     WHERE agents.id = $4
     RETURNING agents.id, agents.name, agents.alias, agents.role, agents.extension, agents.enabled, agents.last_seen_at`,
    [alias ?? null, role ?? null, enabled ?? null, id]
  );
  return rows[0];
};

module.exports = { listAgents, updateAgent };
