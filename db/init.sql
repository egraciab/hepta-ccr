CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'supervisor', 'viewer')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    role VARCHAR(50) DEFAULT 'Agente',
    extension VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cdr_raw (
    id SERIAL PRIMARY KEY,
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

DROP TABLE IF EXISTS cdr;

CREATE TABLE cdr (
    id SERIAL PRIMARY KEY,
    uniqueid VARCHAR(64) UNIQUE,
    src VARCHAR(50),
    dst VARCHAR(50),
    start_time TIMESTAMP,
    answer_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    billsec INTEGER,
    disposition VARCHAR(20),
    channel TEXT,
    dstchannel TEXT,
    channel_ext VARCHAR(20),
    dstchannel_ext VARCHAR(20),
    accountcode VARCHAR(50),
    caller_name VARCHAR(100),
    action_owner VARCHAR(100),
    action_type VARCHAR(50),
    src_trunk_name VARCHAR(100),
    dst_trunk_name VARCHAR(100),
    device_info TEXT,
    lastapp VARCHAR(50),
    lastdata TEXT,
    raw JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_start_time ON cdr(start_time);
CREATE INDEX IF NOT EXISTS idx_cdr_disposition ON cdr(disposition);
CREATE INDEX IF NOT EXISTS idx_cdr_src ON cdr(src);

CREATE TABLE IF NOT EXISTS sync_state (
    id SERIAL PRIMARY KEY,
    last_start_time TIMESTAMP,
    last_run TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(120) PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO agents (name, role, extension)
SELECT * FROM (VALUES
  ('Alice Johnson', 'Ventas', '1001'),
  ('Bob Smith', 'Soporte', '1002'),
  ('Carla Reyes', 'Cobranza', '1003'),
  ('Diego Silva', 'N2', '1004'),
  ('Eva Brown', 'Atención', '1005')
) AS data(name, extension)
WHERE NOT EXISTS (SELECT 1 FROM agents);

INSERT INTO settings (key, value)
SELECT * FROM (VALUES
  ('ucm_base_url', 'https://192.168.1.20:8089'),
  ('ucm_api_user', 'hepta_api'),
  ('ucm_api_password', 'change_me'),
  ('ucm_last_imported_start_time', '')
) AS data(key, value)
ON CONFLICT (key) DO NOTHING;
