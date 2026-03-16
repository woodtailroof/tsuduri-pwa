-- migrations/0001_trip_sync.sql

PRAGMA foreign_keys = ON;

-- =========================================================
-- 端末情報
-- =========================================================
CREATE TABLE IF NOT EXISTS sync_devices (
  device_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_last_seen_at
  ON sync_devices(last_seen_at);

-- =========================================================
-- trips
-- =========================================================
CREATE TABLE IF NOT EXISTS sync_trips (
  uid TEXT PRIMARY KEY,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,

  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'error')),

  started_at TEXT NOT NULL,
  ended_at TEXT,

  point_id TEXT NOT NULL,
  memo TEXT NOT NULL,

  outcome TEXT NOT NULL CHECK (outcome IN ('caught', 'skunk')),
  time_band TEXT NOT NULL CHECK (
    time_band IN ('morning', 'day', 'evening', 'night', 'unknown')
  ),

  lure_type TEXT CHECK (
    lure_type IN ('metaljig', 'minnow', 'sinkingpencil', 'top', 'worm', 'blade', 'bigbait', 'other')
  ),

  spot_type TEXT CHECK (
    spot_type IN ('port', 'surf')
  ),

  water_clarity TEXT CHECK (
    water_clarity IN ('clear', 'normal', 'muddy')
  ),

  bait_present INTEGER CHECK (bait_present IN (0, 1) OR bait_present IS NULL),

  lat REAL,
  lon REAL,

  tide_day_key TEXT,
  tide_name TEXT,
  tide_phase TEXT,

  tide_trend TEXT CHECK (
    tide_trend IN ('up', 'down', 'flat', 'unknown')
  ),

  tide_cm REAL,

  weather_code REAL,
  wind_speed_ms REAL,
  wind_dir_deg REAL,
  wave_height_m REAL,
  air_temp_c REAL,

  env_fetched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_trips_updated_at
  ON sync_trips(updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_trips_deleted_at
  ON sync_trips(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sync_trips_point_id
  ON sync_trips(point_id);

CREATE INDEX IF NOT EXISTS idx_sync_trips_started_at
  ON sync_trips(started_at);

CREATE INDEX IF NOT EXISTS idx_sync_trips_outcome
  ON sync_trips(outcome);

CREATE INDEX IF NOT EXISTS idx_sync_trips_time_band
  ON sync_trips(time_band);

-- =========================================================
-- fish
-- =========================================================
CREATE TABLE IF NOT EXISTS sync_trip_fish (
  uid TEXT PRIMARY KEY,
  trip_uid TEXT NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,

  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'error')),

  species TEXT NOT NULL,
  size_cm REAL,
  count INTEGER,

  lure_type TEXT CHECK (
    lure_type IN ('metaljig', 'minnow', 'sinkingpencil', 'top', 'worm', 'blade', 'bigbait', 'other')
  ),

  time_band TEXT CHECK (
    time_band IN ('morning', 'day', 'evening', 'night', 'unknown')
  ),

  FOREIGN KEY (trip_uid) REFERENCES sync_trips(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_trip_fish_trip_uid
  ON sync_trip_fish(trip_uid);

CREATE INDEX IF NOT EXISTS idx_sync_trip_fish_updated_at
  ON sync_trip_fish(updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_trip_fish_deleted_at
  ON sync_trip_fish(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sync_trip_fish_species
  ON sync_trip_fish(species);

CREATE INDEX IF NOT EXISTS idx_sync_trip_fish_lure_type
  ON sync_trip_fish(lure_type);

CREATE INDEX IF NOT EXISTS idx_sync_trip_fish_time_band
  ON sync_trip_fish(time_band);

-- =========================================================
-- photos (メタ情報のみ)
-- 写真本体はあとで R2 などへ
-- =========================================================
CREATE TABLE IF NOT EXISTS sync_trip_photos (
  uid TEXT PRIMARY KEY,
  trip_uid TEXT NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,

  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'error')),

  captured_at TEXT,
  photo_name TEXT,
  photo_type TEXT NOT NULL,
  remote_key TEXT,

  photo_order INTEGER NOT NULL,
  is_cover INTEGER NOT NULL CHECK (is_cover IN (0, 1)),

  FOREIGN KEY (trip_uid) REFERENCES sync_trips(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_trip_photos_trip_uid
  ON sync_trip_photos(trip_uid);

CREATE INDEX IF NOT EXISTS idx_sync_trip_photos_updated_at
  ON sync_trip_photos(updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_trip_photos_deleted_at
  ON sync_trip_photos(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sync_trip_photos_remote_key
  ON sync_trip_photos(remote_key);

CREATE INDEX IF NOT EXISTS idx_sync_trip_photos_trip_uid_order
  ON sync_trip_photos(trip_uid, photo_order);

CREATE INDEX IF NOT EXISTS idx_sync_trip_photos_trip_uid_cover
  ON sync_trip_photos(trip_uid, is_cover);