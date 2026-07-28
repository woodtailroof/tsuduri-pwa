-- migrations/0004_expand_lure_type.sql
--
-- lure_type に「サビキ (sabiki)」「エサ釣り (bait)」を追加する。
-- SQLite では既存の CHECK 制約だけを変更できないため、
-- 関連テーブルを新定義へコピーして入れ替える。

PRAGMA foreign_keys = ON;

-- =========================================================
-- 新しい親テーブル
-- 0003_tackle_sync.sql までの列をすべて含める
-- =========================================================
CREATE TABLE sync_trips_new (
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
    lure_type IN (
      'metaljig',
      'minnow',
      'sinkingpencil',
      'top',
      'worm',
      'blade',
      'bigbait',
      'sabiki',
      'bait',
      'other'
    )
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

  env_fetched_at TEXT,

  rod_id REAL,
  reel_id REAL,
  rod_uid TEXT,
  reel_uid TEXT
);

INSERT INTO sync_trips_new (
  uid,
  created_at,
  updated_at,
  deleted_at,
  sync_status,
  started_at,
  ended_at,
  point_id,
  memo,
  outcome,
  time_band,
  lure_type,
  spot_type,
  water_clarity,
  bait_present,
  lat,
  lon,
  tide_day_key,
  tide_name,
  tide_phase,
  tide_trend,
  tide_cm,
  weather_code,
  wind_speed_ms,
  wind_dir_deg,
  wave_height_m,
  air_temp_c,
  env_fetched_at,
  rod_id,
  reel_id,
  rod_uid,
  reel_uid
)
SELECT
  uid,
  created_at,
  updated_at,
  deleted_at,
  sync_status,
  started_at,
  ended_at,
  point_id,
  memo,
  outcome,
  time_band,
  lure_type,
  spot_type,
  water_clarity,
  bait_present,
  lat,
  lon,
  tide_day_key,
  tide_name,
  tide_phase,
  tide_trend,
  tide_cm,
  weather_code,
  wind_speed_ms,
  wind_dir_deg,
  wave_height_m,
  air_temp_c,
  env_fetched_at,
  rod_id,
  reel_id,
  rod_uid,
  reel_uid
FROM sync_trips;

-- =========================================================
-- 新しい魚テーブル
-- =========================================================
CREATE TABLE sync_trip_fish_new (
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
    lure_type IN (
      'metaljig',
      'minnow',
      'sinkingpencil',
      'top',
      'worm',
      'blade',
      'bigbait',
      'sabiki',
      'bait',
      'other'
    )
  ),

  time_band TEXT CHECK (
    time_band IN ('morning', 'day', 'evening', 'night', 'unknown')
  ),

  FOREIGN KEY (trip_uid) REFERENCES sync_trips_new(uid) ON DELETE CASCADE
);

INSERT INTO sync_trip_fish_new (
  uid,
  trip_uid,
  created_at,
  updated_at,
  deleted_at,
  sync_status,
  species,
  size_cm,
  count,
  lure_type,
  time_band
)
SELECT
  uid,
  trip_uid,
  created_at,
  updated_at,
  deleted_at,
  sync_status,
  species,
  size_cm,
  count,
  lure_type,
  time_band
FROM sync_trip_fish;

-- =========================================================
-- 新しい写真テーブル
-- 親テーブル入れ替え時にも写真を確実に保持する
-- =========================================================
CREATE TABLE sync_trip_photos_new (
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

  FOREIGN KEY (trip_uid) REFERENCES sync_trips_new(uid) ON DELETE CASCADE
);

INSERT INTO sync_trip_photos_new (
  uid,
  trip_uid,
  created_at,
  updated_at,
  deleted_at,
  sync_status,
  captured_at,
  photo_name,
  photo_type,
  remote_key,
  photo_order,
  is_cover
)
SELECT
  uid,
  trip_uid,
  created_at,
  updated_at,
  deleted_at,
  sync_status,
  captured_at,
  photo_name,
  photo_type,
  remote_key,
  photo_order,
  is_cover
FROM sync_trip_photos;

-- 子テーブルから先に旧テーブルを削除する。
DROP TABLE sync_trip_fish;
DROP TABLE sync_trip_photos;
DROP TABLE sync_trips;

ALTER TABLE sync_trips_new RENAME TO sync_trips;
ALTER TABLE sync_trip_fish_new RENAME TO sync_trip_fish;
ALTER TABLE sync_trip_photos_new RENAME TO sync_trip_photos;

-- =========================================================
-- インデックスを再作成
-- =========================================================
CREATE INDEX idx_sync_trips_updated_at
  ON sync_trips(updated_at);
CREATE INDEX idx_sync_trips_deleted_at
  ON sync_trips(deleted_at);
CREATE INDEX idx_sync_trips_point_id
  ON sync_trips(point_id);
CREATE INDEX idx_sync_trips_started_at
  ON sync_trips(started_at);
CREATE INDEX idx_sync_trips_outcome
  ON sync_trips(outcome);
CREATE INDEX idx_sync_trips_time_band
  ON sync_trips(time_band);
CREATE INDEX idx_sync_trips_rod_uid
  ON sync_trips(rod_uid);
CREATE INDEX idx_sync_trips_reel_uid
  ON sync_trips(reel_uid);
CREATE INDEX idx_sync_trips_rod_id
  ON sync_trips(rod_id);
CREATE INDEX idx_sync_trips_reel_id
  ON sync_trips(reel_id);

CREATE INDEX idx_sync_trip_fish_trip_uid
  ON sync_trip_fish(trip_uid);
CREATE INDEX idx_sync_trip_fish_updated_at
  ON sync_trip_fish(updated_at);
CREATE INDEX idx_sync_trip_fish_deleted_at
  ON sync_trip_fish(deleted_at);
CREATE INDEX idx_sync_trip_fish_species
  ON sync_trip_fish(species);
CREATE INDEX idx_sync_trip_fish_lure_type
  ON sync_trip_fish(lure_type);
CREATE INDEX idx_sync_trip_fish_time_band
  ON sync_trip_fish(time_band);

CREATE INDEX idx_sync_trip_photos_trip_uid
  ON sync_trip_photos(trip_uid);
CREATE INDEX idx_sync_trip_photos_updated_at
  ON sync_trip_photos(updated_at);
CREATE INDEX idx_sync_trip_photos_deleted_at
  ON sync_trip_photos(deleted_at);
CREATE INDEX idx_sync_trip_photos_remote_key
  ON sync_trip_photos(remote_key);
CREATE INDEX idx_sync_trip_photos_trip_uid_order
  ON sync_trip_photos(trip_uid, photo_order);
CREATE INDEX idx_sync_trip_photos_trip_uid_cover
  ON sync_trip_photos(trip_uid, is_cover);

PRAGMA foreign_key_check;
