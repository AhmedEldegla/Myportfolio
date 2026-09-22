CREATE TABLE IF NOT EXISTS bookings (
  id          TEXT PRIMARY KEY,
  start_utc   TEXT NOT NULL,           -- ISO 8601, e.g. 2026-09-24T11:00:00.000Z
  end_utc     TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  topic       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled
  created_at  TEXT NOT NULL
);

-- The database itself guarantees one active booking per time slot
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_slot
  ON bookings (start_utc) WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings (start_utc);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (email);
