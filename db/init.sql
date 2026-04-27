CREATE TABLE IF NOT EXISTS cdr_records (
    id SERIAL PRIMARY KEY,
    call_date TIMESTAMP NOT NULL,
    source VARCHAR(25) NOT NULL,
    destination VARCHAR(25) NOT NULL,
    duration INTEGER NOT NULL CHECK (duration >= 0),
    status VARCHAR(20) NOT NULL,
    agent VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cdr_call_date ON cdr_records(call_date);
CREATE INDEX IF NOT EXISTS idx_cdr_agent ON cdr_records(agent);
CREATE INDEX IF NOT EXISTS idx_cdr_status ON cdr_records(status);

INSERT INTO cdr_records (call_date, source, destination, duration, status, agent)
SELECT
  NOW() - (interval '1 day' * (g % 15)) - (interval '1 minute' * (g * 7 % 1440)),
  CONCAT('+1', 2000000000 + g),
  CONCAT('+1', 3000000000 + g),
  (20 + (g * 13 % 500)),
  (ARRAY['answered', 'missed', 'failed'])[1 + (g % 3)],
  (ARRAY['Alice', 'Bob', 'Carla', 'Diego'])[1 + (g % 4)]
FROM generate_series(1, 50) g
WHERE NOT EXISTS (SELECT 1 FROM cdr_records);
