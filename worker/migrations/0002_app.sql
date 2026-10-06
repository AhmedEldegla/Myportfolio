-- Turns the booking table into a full scheduling app and adds the admin data.
-- Existing bookings keep working: every new column has a default.

-- Bookings: meeting types, answers, meeting links, client self-service, notes
ALTER TABLE bookings ADD COLUMN type_id       TEXT    NOT NULL DEFAULT 'project';
ALTER TABLE bookings ADD COLUMN duration      INTEGER NOT NULL DEFAULT 30;
ALTER TABLE bookings ADD COLUMN answers       TEXT    NOT NULL DEFAULT '{}';   -- JSON {questionId: answer}
ALTER TABLE bookings ADD COLUMN client_tz     TEXT    NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN meet_url      TEXT    NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN gcal_event_id TEXT    NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN manage_token  TEXT;                          -- SHA-256 of the client's manage link token
ALTER TABLE bookings ADD COLUMN notes         TEXT    NOT NULL DEFAULT '';   -- private admin notes
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT    NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN cancelled_by  TEXT    NOT NULL DEFAULT '';   -- client | admin
ALTER TABLE bookings ADD COLUMN reminded      INTEGER NOT NULL DEFAULT 0;    -- bit 1 = 24h sent, bit 2 = 1h sent
ALTER TABLE bookings ADD COLUMN sequence      INTEGER NOT NULL DEFAULT 0;    -- calendar invite revision
ALTER TABLE bookings ADD COLUMN updated_at    TEXT    NOT NULL DEFAULT '';
-- status is now: confirmed | cancelled | completed | no_show

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_token ON bookings (manage_token);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at);

-- Editable settings (availability, meeting types, notifications), JSON per key
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Time off blocked from the admin calendar
CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  start_utc  TEXT NOT NULL,
  end_utc    TEXT NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_start ON blocks (start_utc);

-- Inbox: contact form messages and leads captured by the AI assistant
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'contact',   -- contact | lead
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'new',       -- new | read | replied | archived
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);

-- AI assistant conversations
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,                     -- user | assistant
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages (session_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages (created_at);

-- Privacy-friendly analytics: an anonymous random visitor id, no IP addresses
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                     -- pageview | section | book_open | book_done | chat_open | contact
  name       TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT '',
  referrer   TEXT NOT NULL DEFAULT '',
  country    TEXT NOT NULL DEFAULT '',
  device     TEXT NOT NULL DEFAULT '',
  visitor    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type, created_at);

-- Admin login sessions (only a hash of the token is stored)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
