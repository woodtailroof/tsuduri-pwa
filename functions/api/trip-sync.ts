// functions/api/trip-sync.ts

type SyncStatus = "pending" | "synced" | "error";

type TripSyncRecord = {
  uid: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  startedAt: string;
  endedAt?: string;

  pointId: string;
  memo: string;

  outcome: "caught" | "skunk";
  timeBand: "morning" | "day" | "evening" | "night" | "unknown";

  lureType?:
    | "metaljig"
    | "minnow"
    | "sinkingpencil"
    | "top"
    | "worm"
    | "blade"
    | "bigbait"
    | "other"
    | null;

  spotType?: "port" | "surf" | null;
  waterClarity?: "clear" | "normal" | "muddy" | null;
  baitPresent?: boolean | null;

  lat?: number | null;
  lon?: number | null;

  tideDayKey?: string | null;
  tideName?: string | null;
  tidePhase?: string | null;
  tideTrend?: "up" | "down" | "flat" | "unknown" | null;
  tideCm?: number | null;

  weatherCode?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  waveHeightM?: number | null;
  airTempC?: number | null;

  envFetchedAt?: string | null;
};

type TripSyncFish = {
  uid: string;
  tripUid: string;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  species: string;
  sizeCm?: number | null;
  count?: number | null;

  lureType?:
    | "metaljig"
    | "minnow"
    | "sinkingpencil"
    | "top"
    | "worm"
    | "blade"
    | "bigbait"
    | "other"
    | null;

  timeBand?: "morning" | "day" | "evening" | "night" | "unknown" | null;
};

type TripSyncPhoto = {
  uid: string;
  tripUid: string;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  capturedAt?: string | null;
  photoName?: string | null;
  photoType: string;
  remoteKey?: string | null;

  order: number;
  isCover: 0 | 1;
};

type TripPushPayload = {
  deviceId: string;
  pushedAt: string;
  trips: TripSyncRecord[];
  fish: TripSyncFish[];
  photos: TripSyncPhoto[];
};

type TripPullResponse = {
  serverTime: string;
  trips: TripSyncRecord[];
  fish: TripSyncFish[];
  photos: TripSyncPhoto[];
};

type Env = {
  DB: D1Database;
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    ...init,
  });
}

function badRequest(message: string) {
  return json({ ok: false, error: message }, { status: 400 });
}

function serverError(message: string) {
  return json({ ok: false, error: message }, { status: 500 });
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isTripRecord(value: unknown): value is TripSyncRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uid === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    typeof v.startedAt === "string" &&
    typeof v.pointId === "string" &&
    typeof v.memo === "string" &&
    typeof v.outcome === "string" &&
    typeof v.timeBand === "string"
  );
}

function isTripFish(value: unknown): value is TripSyncFish {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uid === "string" &&
    typeof v.tripUid === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    typeof v.species === "string"
  );
}

function isTripPhoto(value: unknown): value is TripSyncPhoto {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uid === "string" &&
    typeof v.tripUid === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    typeof v.photoType === "string" &&
    typeof v.order === "number" &&
    (v.isCover === 0 || v.isCover === 1)
  );
}

async function upsertTrip(db: D1Database, row: TripSyncRecord) {
  await db
    .prepare(
      `
      INSERT INTO sync_trips (
        uid, created_at, updated_at, deleted_at, sync_status,
        started_at, ended_at,
        point_id, memo, outcome, time_band,
        lure_type, spot_type, water_clarity, bait_present,
        lat, lon,
        tide_day_key, tide_name, tide_phase, tide_trend, tide_cm,
        weather_code, wind_speed_ms, wind_dir_deg, wave_height_m, air_temp_c,
        env_fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        sync_status = excluded.sync_status,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        point_id = excluded.point_id,
        memo = excluded.memo,
        outcome = excluded.outcome,
        time_band = excluded.time_band,
        lure_type = excluded.lure_type,
        spot_type = excluded.spot_type,
        water_clarity = excluded.water_clarity,
        bait_present = excluded.bait_present,
        lat = excluded.lat,
        lon = excluded.lon,
        tide_day_key = excluded.tide_day_key,
        tide_name = excluded.tide_name,
        tide_phase = excluded.tide_phase,
        tide_trend = excluded.tide_trend,
        tide_cm = excluded.tide_cm,
        weather_code = excluded.weather_code,
        wind_speed_ms = excluded.wind_speed_ms,
        wind_dir_deg = excluded.wind_dir_deg,
        wave_height_m = excluded.wave_height_m,
        air_temp_c = excluded.air_temp_c,
        env_fetched_at = excluded.env_fetched_at
      WHERE excluded.updated_at > sync_trips.updated_at
      `,
    )
    .bind(
      row.uid,
      row.createdAt,
      row.updatedAt,
      asIsoOrNull(row.deletedAt),
      row.syncStatus,

      row.startedAt,
      asIsoOrNull(row.endedAt),

      row.pointId,
      row.memo,
      row.outcome,
      row.timeBand,

      asStringOrNull(row.lureType),
      asStringOrNull(row.spotType),
      asStringOrNull(row.waterClarity),
      asBooleanOrNull(row.baitPresent),

      asNumberOrNull(row.lat),
      asNumberOrNull(row.lon),

      asStringOrNull(row.tideDayKey),
      asStringOrNull(row.tideName),
      asStringOrNull(row.tidePhase),
      asStringOrNull(row.tideTrend),
      asNumberOrNull(row.tideCm),

      asNumberOrNull(row.weatherCode),
      asNumberOrNull(row.windSpeedMs),
      asNumberOrNull(row.windDirDeg),
      asNumberOrNull(row.waveHeightM),
      asNumberOrNull(row.airTempC),

      asStringOrNull(row.envFetchedAt),
    )
    .run();
}

async function upsertFish(db: D1Database, row: TripSyncFish) {
  await db
    .prepare(
      `
      INSERT INTO sync_trip_fish (
        uid, trip_uid,
        created_at, updated_at, deleted_at, sync_status,
        species, size_cm, count,
        lure_type, time_band
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        trip_uid = excluded.trip_uid,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        sync_status = excluded.sync_status,
        species = excluded.species,
        size_cm = excluded.size_cm,
        count = excluded.count,
        lure_type = excluded.lure_type,
        time_band = excluded.time_band
      WHERE excluded.updated_at > sync_trip_fish.updated_at
      `,
    )
    .bind(
      row.uid,
      row.tripUid,
      row.createdAt,
      row.updatedAt,
      asIsoOrNull(row.deletedAt),
      row.syncStatus,
      row.species,
      asNumberOrNull(row.sizeCm),
      asNumberOrNull(row.count),
      asStringOrNull(row.lureType),
      asStringOrNull(row.timeBand),
    )
    .run();
}

async function upsertPhoto(db: D1Database, row: TripSyncPhoto) {
  await db
    .prepare(
      `
      INSERT INTO sync_trip_photos (
        uid, trip_uid,
        created_at, updated_at, deleted_at, sync_status,
        captured_at, photo_name, photo_type, remote_key,
        photo_order, is_cover
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        trip_uid = excluded.trip_uid,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        sync_status = excluded.sync_status,
        captured_at = excluded.captured_at,
        photo_name = excluded.photo_name,
        photo_type = excluded.photo_type,
        remote_key = excluded.remote_key,
        photo_order = excluded.photo_order,
        is_cover = excluded.is_cover
      WHERE excluded.updated_at > sync_trip_photos.updated_at
      `,
    )
    .bind(
      row.uid,
      row.tripUid,
      row.createdAt,
      row.updatedAt,
      asIsoOrNull(row.deletedAt),
      row.syncStatus,
      asIsoOrNull(row.capturedAt),
      asStringOrNull(row.photoName),
      row.photoType,
      asStringOrNull(row.remoteKey),
      row.order,
      row.isCover,
    )
    .run();
}

async function handlePost(request: Request, env: Env) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid json");
  }

  const payload = body as Partial<TripPushPayload>;
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.deviceId !== "string" ||
    typeof payload.pushedAt !== "string" ||
    !Array.isArray(payload.trips) ||
    !Array.isArray(payload.fish) ||
    !Array.isArray(payload.photos)
  ) {
    return badRequest("invalid payload");
  }

  for (const row of payload.trips) {
    if (!isTripRecord(row)) {
      return badRequest("invalid trip row");
    }
  }
  for (const row of payload.fish) {
    if (!isTripFish(row)) {
      return badRequest("invalid fish row");
    }
  }
  for (const row of payload.photos) {
    if (!isTripPhoto(row)) {
      return badRequest("invalid photo row");
    }
  }

  try {
    await env.DB.batch([
      env.DB.prepare(
        `
        INSERT INTO sync_devices (device_id, last_seen_at)
        VALUES (?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `,
      ).bind(payload.deviceId, payload.pushedAt),
    ]);

    for (const row of payload.trips) {
      await upsertTrip(env.DB, row);
    }
    for (const row of payload.fish) {
      await upsertFish(env.DB, row);
    }
    for (const row of payload.photos) {
      await upsertPhoto(env.DB, row);
    }

    return json({
      ok: true,
      result: {
        ok: true,
        pushedTrips: payload.trips.length,
        pushedFish: payload.fish.length,
        pushedPhotos: payload.photos.length,
        pulledTrips: 0,
        pulledFish: 0,
        pulledPhotos: 0,
        errors: [],
      },
    });
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "post failed");
  }
}

async function fetchTripsSince(db: D1Database, since: string | null) {
  const stmt = since
    ? db
        .prepare(
          `
        SELECT
          uid,
          created_at as createdAt,
          updated_at as updatedAt,
          deleted_at as deletedAt,
          sync_status as syncStatus,
          started_at as startedAt,
          ended_at as endedAt,
          point_id as pointId,
          memo,
          outcome,
          time_band as timeBand,
          lure_type as lureType,
          spot_type as spotType,
          water_clarity as waterClarity,
          bait_present as baitPresent,
          lat,
          lon,
          tide_day_key as tideDayKey,
          tide_name as tideName,
          tide_phase as tidePhase,
          tide_trend as tideTrend,
          tide_cm as tideCm,
          weather_code as weatherCode,
          wind_speed_ms as windSpeedMs,
          wind_dir_deg as windDirDeg,
          wave_height_m as waveHeightM,
          air_temp_c as airTempC,
          env_fetched_at as envFetchedAt
        FROM sync_trips
        WHERE updated_at > ?
        ORDER BY updated_at ASC
        `,
        )
        .bind(since)
    : db.prepare(
        `
        SELECT
          uid,
          created_at as createdAt,
          updated_at as updatedAt,
          deleted_at as deletedAt,
          sync_status as syncStatus,
          started_at as startedAt,
          ended_at as endedAt,
          point_id as pointId,
          memo,
          outcome,
          time_band as timeBand,
          lure_type as lureType,
          spot_type as spotType,
          water_clarity as waterClarity,
          bait_present as baitPresent,
          lat,
          lon,
          tide_day_key as tideDayKey,
          tide_name as tideName,
          tide_phase as tidePhase,
          tide_trend as tideTrend,
          tide_cm as tideCm,
          weather_code as weatherCode,
          wind_speed_ms as windSpeedMs,
          wind_dir_deg as windDirDeg,
          wave_height_m as waveHeightM,
          air_temp_c as airTempC,
          env_fetched_at as envFetchedAt
        FROM sync_trips
        ORDER BY updated_at ASC
        `,
      );

  const result = await stmt.all<TripSyncRecord>();
  return result.results ?? [];
}

async function fetchFishSince(db: D1Database, since: string | null) {
  const stmt = since
    ? db
        .prepare(
          `
        SELECT
          uid,
          trip_uid as tripUid,
          created_at as createdAt,
          updated_at as updatedAt,
          deleted_at as deletedAt,
          sync_status as syncStatus,
          species,
          size_cm as sizeCm,
          count,
          lure_type as lureType,
          time_band as timeBand
        FROM sync_trip_fish
        WHERE updated_at > ?
        ORDER BY updated_at ASC
        `,
        )
        .bind(since)
    : db.prepare(
        `
        SELECT
          uid,
          trip_uid as tripUid,
          created_at as createdAt,
          updated_at as updatedAt,
          deleted_at as deletedAt,
          sync_status as syncStatus,
          species,
          size_cm as sizeCm,
          count,
          lure_type as lureType,
          time_band as timeBand
        FROM sync_trip_fish
        ORDER BY updated_at ASC
        `,
      );

  const result = await stmt.all<TripSyncFish>();
  return result.results ?? [];
}

async function fetchPhotosSince(db: D1Database, since: string | null) {
  const stmt = since
    ? db
        .prepare(
          `
        SELECT
          uid,
          trip_uid as tripUid,
          created_at as createdAt,
          updated_at as updatedAt,
          deleted_at as deletedAt,
          sync_status as syncStatus,
          captured_at as capturedAt,
          photo_name as photoName,
          photo_type as photoType,
          remote_key as remoteKey,
          photo_order as order,
          is_cover as isCover
        FROM sync_trip_photos
        WHERE updated_at > ?
        ORDER BY updated_at ASC
        `,
        )
        .bind(since)
    : db.prepare(
        `
        SELECT
          uid,
          trip_uid as tripUid,
          created_at as createdAt,
          updated_at as updatedAt,
          deleted_at as deletedAt,
          sync_status as syncStatus,
          captured_at as capturedAt,
          photo_name as photoName,
          photo_type as photoType,
          remote_key as remoteKey,
          photo_order as order,
          is_cover as isCover
        FROM sync_trip_photos
        ORDER BY updated_at ASC
        `,
      );

  const result = await stmt.all<TripSyncPhoto>();
  return result.results ?? [];
}

async function handleGet(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const since = url.searchParams.get("since");
    const deviceId = url.searchParams.get("deviceId");
    const serverTime = new Date().toISOString();

    if (deviceId) {
      await env.DB.prepare(
        `
        INSERT INTO sync_devices (device_id, last_seen_at)
        VALUES (?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `,
      )
        .bind(deviceId, serverTime)
        .run();
    }

    const [trips, fish, photos] = await Promise.all([
      fetchTripsSince(env.DB, since),
      fetchFishSince(env.DB, since),
      fetchPhotosSince(env.DB, since),
    ]);

    const response: TripPullResponse = {
      serverTime,
      trips,
      fish,
      photos,
    };

    return json(response);
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "get failed");
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  return handleGet(request, env);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  return handlePost(request, env);
};
