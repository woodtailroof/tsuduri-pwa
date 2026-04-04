-- migrations/0003_tackle_sync.sql

PRAGMA foreign_keys = ON;

-- =========================================================
-- sync_trips にタックル参照を追加
-- =========================================================
ALTER TABLE sync_trips ADD COLUMN rod_id REAL;
ALTER TABLE sync_trips ADD COLUMN reel_id REAL;
ALTER TABLE sync_trips ADD COLUMN rod_uid TEXT;
ALTER TABLE sync_trips ADD COLUMN reel_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_sync_trips_rod_uid
  ON sync_trips(rod_uid);

CREATE INDEX IF NOT EXISTS idx_sync_trips_reel_uid
  ON sync_trips(reel_uid);

CREATE INDEX IF NOT EXISTS idx_sync_trips_rod_id
  ON sync_trips(rod_id);

CREATE INDEX IF NOT EXISTS idx_sync_trips_reel_id
  ON sync_trips(reel_id);

-- =========================================================
-- sync_tackles
-- =========================================================
CREATE TABLE IF NOT EXISTS sync_tackles (
  uid TEXT PRIMARY KEY,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,

  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'error')),

  kind TEXT NOT NULL CHECK (kind IN ('rod', 'reel')),
  maker TEXT NOT NULL,
  model TEXT NOT NULL,
  memo TEXT,

  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  retired_at TEXT,

  rod_json TEXT,
  reel_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_tackles_updated_at
  ON sync_tackles(updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_tackles_deleted_at
  ON sync_tackles(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sync_tackles_kind
  ON sync_tackles(kind);

CREATE INDEX IF NOT EXISTS idx_sync_tackles_active
  ON sync_tackles(active);

CREATE INDEX IF NOT EXISTS idx_sync_tackles_kind_active
  ON sync_tackles(kind, active);