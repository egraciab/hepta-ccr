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

CREATE TABLE IF NOT EXISTS cdr (
    id SERIAL PRIMARY KEY,
    uniqueid VARCHAR(50) UNIQUE NOT NULL,
    src VARCHAR(50),
    dst VARCHAR(50),
    start_time TIMESTAMP,
    answer_time TIMESTAMP NULL,
    end_time TIMESTAMP,
    duration INT,
    billsec INT,
    disposition VARCHAR(20),
    channel_ext VARCHAR(50),
    dstchannel_ext VARCHAR(50),
    action_type VARCHAR(20),
    device_info VARCHAR(50),
    raw JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_start_time ON cdr(start_time);
CREATE INDEX IF NOT EXISTS idx_cdr_disposition ON cdr(disposition);
CREATE INDEX IF NOT EXISTS idx_cdr_src ON cdr(src);

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

INSERT INTO cdr (
  uniqueid, src, dst, start_time, answer_time, end_time, duration, billsec,
  disposition, channel_ext, dstchannel_ext, action_type, device_info, raw
)
SELECT
  CONCAT('seed-', g),
  CONCAT('+1', 2000000000 + g),
  CONCAT('+1', 3000000000 + g),
  NOW() - (interval '1 hour' * (g % 240)) - (interval '1 minute' * ((g * 13) % 60)),
  CASE WHEN g % 4 = 0 THEN NULL ELSE NOW() - (interval '1 hour' * (g % 240)) END,
  NOW() - (interval '1 hour' * (g % 240)) + interval '2 minute',
  CASE WHEN g % 4 = 0 THEN 0 ELSE 30 + ((g * 19) % 420) END,
  CASE WHEN g % 4 = 0 THEN 0 ELSE 20 + ((g * 17) % 360) END,
  CASE WHEN g % 7 = 0 THEN 'ocupado' WHEN g % 4 = 0 THEN 'no_contestada' ELSE 'contestada' END,
  'SIP/1001',
  'SIP/2001',
  'OUT',
  'UCM6301',
  jsonb_build_object('seed', true)
FROM generate_series(1, 200) g
ON CONFLICT (uniqueid) DO NOTHING;
