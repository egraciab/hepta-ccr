const pool = require('../config/db');

const listSettings = async () => {
  const { rows } = await pool.query('SELECT key, value FROM settings ORDER BY key ASC');
  return rows;
};

const upsertSetting = async ({ key, value }) => {
  const { rows } = await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     RETURNING key, value`,
    [key, value]
  );

  return rows[0];
};

module.exports = { listSettings, upsertSetting };
