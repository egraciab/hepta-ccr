const bcrypt = require('bcryptjs');
const pool = require('./db');

const ensureAdminUser = async () => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hepta.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rowCount > 0) {
    return;
  }

  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
    ['System Admin', adminEmail, hash, 'admin']
  );

  console.log(`[BOOTSTRAP] Created default admin user: ${adminEmail}`);
};

const ensureCdrSchemaCompatibility = async () => {
  await pool.query('ALTER TABLE cdr ADD COLUMN IF NOT EXISTS channel TEXT');
  await pool.query('ALTER TABLE cdr ADD COLUMN IF NOT EXISTS dstchannel TEXT');
  await pool.query('ALTER TABLE cdr ADD COLUMN IF NOT EXISTS accountcode VARCHAR(50)');
  await pool.query('ALTER TABLE cdr ADD COLUMN IF NOT EXISTS caller_name VARCHAR(100)');
  await pool.query('ALTER TABLE cdr ADD COLUMN IF NOT EXISTS lastapp VARCHAR(50)');
  await pool.query('ALTER TABLE cdr ADD COLUMN IF NOT EXISTS lastdata TEXT');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_cdr_disposition ON cdr(disposition)');
};


const ensureAgentSchemaCompatibility = async () => {
  await pool.query('ALTER TABLE agents ADD COLUMN IF NOT EXISTS alias VARCHAR(120)');
  await pool.query("ALTER TABLE agents ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'Agente'");
  await pool.query('ALTER TABLE agents ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true');
  await pool.query('ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_extension_unique ON agents(extension)');
};

const ensureSyncStateSchemaCompatibility = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS sync_state (
    id SERIAL PRIMARY KEY,
    last_start_time TIMESTAMP,
    last_run TIMESTAMP
  )`);
};

const bootstrap = async () => {
  await ensureCdrSchemaCompatibility();
  await ensureAgentSchemaCompatibility();
  await ensureSyncStateSchemaCompatibility();
  await ensureAdminUser();
};

module.exports = bootstrap;
