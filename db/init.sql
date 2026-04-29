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
    extension VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cdr_records (
    id SERIAL PRIMARY KEY,
    call_date TIMESTAMP NOT NULL,
    source VARCHAR(25) NOT NULL,
    destination VARCHAR(25) NOT NULL,
    duration INTEGER NOT NULL CHECK (duration >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('answered', 'missed', 'busy')),
    agent VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(120) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cdr_call_date ON cdr_records(call_date);
CREATE INDEX IF NOT EXISTS idx_cdr_agent ON cdr_records(agent);
CREATE INDEX IF NOT EXISTS idx_cdr_status ON cdr_records(status);

INSERT INTO agents (name, extension)
SELECT * FROM (VALUES
  ('Alice Johnson', '1001'),
  ('Bob Smith', '1002'),
  ('Carla Reyes', '1003'),
  ('Diego Silva', '1004'),
  ('Eva Brown', '1005')
) AS data(name, extension)
WHERE NOT EXISTS (SELECT 1 FROM agents);

INSERT INTO settings (key, value)
SELECT * FROM (VALUES
  ('ucm_ip', '192.168.1.20'),
  ('ucm_port', '8089'),
  ('ucm_api_user', 'hepta_api'),
  ('ucm_api_password', 'change_me')
) AS data(key, value)
ON CONFLICT (key) DO NOTHING;

INSERT INTO cdr_records (call_date, source, destination, duration, status, agent)
SELECT
  NOW() - (interval '1 hour' * (g % 240)) - (interval '1 minute' * ((g * 13) % 60)),
  CONCAT('+1', 2000000000 + g),
  CONCAT('+1', 3000000000 + g),
  CASE
    WHEN g % 5 = 0 THEN 0
    ELSE 30 + ((g * 19) % 420)
  END,
  CASE
    WHEN g % 7 = 0 THEN 'busy'
    WHEN g % 4 = 0 THEN 'missed'
    ELSE 'answered'
  END,
  (ARRAY['Alice Johnson', 'Bob Smith', 'Carla Reyes', 'Diego Silva', 'Eva Brown'])[1 + (g % 5)]
FROM generate_series(1, 200) g
WHERE NOT EXISTS (SELECT 1 FROM cdr_records);
