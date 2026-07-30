-- 1釣行に複数の使用タックルを持たせ、魚を使用タックルへ紐づける。
PRAGMA foreign_keys = ON;

CREATE TABLE sync_trip_tackles (
  uid TEXT PRIMARY KEY,
  trip_uid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'error')),
  tackle_order INTEGER NOT NULL,
  lure_type TEXT NOT NULL CHECK (
    lure_type IN (
      'metaljig', 'minnow', 'sinkingpencil', 'top', 'worm', 'blade',
      'bigbait', 'egi', 'sabiki', 'bait', 'other'
    )
  ),
  rod_id REAL,
  reel_id REAL,
  rod_uid TEXT,
  reel_uid TEXT,
  FOREIGN KEY (trip_uid) REFERENCES sync_trips(uid) ON DELETE CASCADE
);

CREATE INDEX idx_sync_trip_tackles_trip_uid
  ON sync_trip_tackles(trip_uid);
CREATE INDEX idx_sync_trip_tackles_updated_at
  ON sync_trip_tackles(updated_at);
CREATE INDEX idx_sync_trip_tackles_deleted_at
  ON sync_trip_tackles(deleted_at);
CREATE INDEX idx_sync_trip_tackles_rod_uid
  ON sync_trip_tackles(rod_uid);
CREATE INDEX idx_sync_trip_tackles_reel_uid
  ON sync_trip_tackles(reel_uid);
CREATE INDEX idx_sync_trip_tackles_lure_type
  ON sync_trip_tackles(lure_type);

ALTER TABLE sync_trip_fish ADD COLUMN trip_tackle_uid TEXT;
CREATE INDEX idx_sync_trip_fish_trip_tackle_uid
  ON sync_trip_fish(trip_tackle_uid);

-- 旧記録の1組タックルを「タックル1」へ移行する。
INSERT INTO sync_trip_tackles (
  uid, trip_uid, created_at, updated_at, deleted_at, sync_status,
  tackle_order, lure_type, rod_id, reel_id, rod_uid, reel_uid
)
SELECT
  uid || ':legacy-tackle', uid, created_at, updated_at, deleted_at,
  'synced', 0, COALESCE(lure_type, 'other'),
  rod_id, reel_id, rod_uid, reel_uid
FROM sync_trips
WHERE lure_type IS NOT NULL
   OR rod_id IS NOT NULL OR reel_id IS NOT NULL
   OR rod_uid IS NOT NULL OR reel_uid IS NOT NULL;

UPDATE sync_trip_fish
SET trip_tackle_uid = trip_uid || ':legacy-tackle'
WHERE EXISTS (
  SELECT 1 FROM sync_trip_tackles st
  WHERE st.uid = sync_trip_fish.trip_uid || ':legacy-tackle'
);

PRAGMA foreign_key_check;
