// src/lib/tripSync.ts

import {
  db,
  type TackleItem,
  type TripFish,
  type TripPhoto,
  type TripRecord,
} from "../db";
import type {
  SyncApiResponse,
  SyncConfig,
  SyncResult,
  TripPullResponse,
  TripPushPayload,
  TripSyncFish,
  TripSyncPhoto,
  TripSyncRecord,
} from "./tripSyncTypes";

const DEVICE_ID_STORAGE_KEY = "tsuduri_sync_device_id_v1";
const LAST_SYNC_AT_STORAGE_KEY = "tsuduri_last_sync_at_v1";
const DEFAULT_SYNC_ENDPOINT = "/api/trip-sync";

type TripSyncTackle = {
  uid: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: "pending" | "synced" | "error";

  kind: "rod" | "reel";
  maker: string;
  model: string;
  memo?: string | null;
  active: boolean;
  retiredAt?: string | null;

  rod?: TackleItem["rod"] | null;
  reel?: TackleItem["reel"] | null;
};

type PendingSyncBundle = {
  trips: TripRecord[];
  fish: TripFish[];
  photos: TripPhoto[];
  tackles: TackleItem[];
};

type ExtendedTripPushPayload = TripPushPayload & {
  tackles: TripSyncTackle[];
};

type ExtendedTripPullResponse = TripPullResponse & {
  tackles?: TripSyncTackle[];
};

function makeUid() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getStorageSafe(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateSyncDeviceId(): string {
  const storage = getStorageSafe();
  const existing = storage?.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const next = `device-${makeUid()}`;
  storage?.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

export function getLastSyncAt(): string | null {
  const storage = getStorageSafe();
  const value = storage?.getItem(LAST_SYNC_AT_STORAGE_KEY)?.trim() ?? "";
  return value || null;
}

export function setLastSyncAt(value: string) {
  const storage = getStorageSafe();
  storage?.setItem(LAST_SYNC_AT_STORAGE_KEY, value);
}

export function getSyncConfig(endpoint = DEFAULT_SYNC_ENDPOINT): SyncConfig {
  return {
    endpoint,
    deviceId: getOrCreateSyncDeviceId(),
  };
}

export async function collectPendingTripBundle(): Promise<PendingSyncBundle> {
  const [tripsRaw, fishRaw, photosRaw, tacklesRaw] = await Promise.all([
    db.trips.where("syncStatus").anyOf("pending", "error").toArray(),
    db.tripFish.where("syncStatus").anyOf("pending", "error").toArray(),
    db.tripPhotos.where("syncStatus").anyOf("pending", "error").toArray(),
    db.tackleItems.where("syncStatus").anyOf("pending", "error").toArray(),
  ]);

  const trips = tripsRaw.filter((x) => !!x.uid);
  const fish = fishRaw.filter((x) => !!x.uid && !!x.tripUid);
  const photos = photosRaw.filter((x) => !!x.uid && !!x.tripUid);
  const tackles = tacklesRaw.filter((x) => !!x.uid);

  return { trips, fish, photos, tackles };
}

function serializeTrip(row: TripRecord): TripSyncRecord {
  return {
    uid: row.uid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    syncStatus: row.syncStatus,

    startedAt: row.startedAt,
    endedAt: row.endedAt,

    pointId: row.pointId,
    memo: row.memo,

    outcome: row.outcome,
    timeBand: row.timeBand,

    lureType: row.lureType ?? null,

    rodId: row.rodId ?? null,
    reelId: row.reelId ?? null,
    rodUid: row.rodUid ?? null,
    reelUid: row.reelUid ?? null,

    spotType: row.spotType ?? null,
    waterClarity: row.waterClarity ?? null,
    baitPresent: row.baitPresent ?? null,

    lat: row.lat ?? null,
    lon: row.lon ?? null,

    tideDayKey: row.tideDayKey ?? null,
    tideName: row.tideName ?? null,
    tidePhase: row.tidePhase ?? null,
    tideTrend: row.tideTrend ?? null,
    tideCm: row.tideCm ?? null,

    weatherCode: row.weatherCode ?? null,
    windSpeedMs: row.windSpeedMs ?? null,
    windDirDeg: row.windDirDeg ?? null,
    waveHeightM: row.waveHeightM ?? null,
    airTempC: row.airTempC ?? null,

    envFetchedAt: row.envFetchedAt ?? null,
  };
}

function serializeFish(row: TripFish): TripSyncFish {
  return {
    uid: row.uid,
    tripUid: row.tripUid,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    syncStatus: row.syncStatus,

    species: row.species,
    sizeCm: row.sizeCm ?? null,
    count: row.count ?? null,
    lureType: row.lureType ?? null,
    timeBand: row.timeBand ?? null,
  };
}

function serializePhoto(row: TripPhoto): TripSyncPhoto {
  return {
    uid: row.uid,
    tripUid: row.tripUid,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    syncStatus: row.syncStatus,

    capturedAt: row.capturedAt ?? null,
    photoName: row.photoName ?? null,
    photoType: row.photoType,
    remoteKey: row.remoteKey ?? null,

    order: row.order,
    isCover: row.isCover,
  };
}

function serializeTackle(row: TackleItem): TripSyncTackle {
  return {
    uid: row.uid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    syncStatus: row.syncStatus,

    kind: row.kind,
    maker: row.maker,
    model: row.model,
    memo: row.memo ?? null,
    active: row.active,
    retiredAt: row.retiredAt ?? null,

    rod: row.rod ?? null,
    reel: row.reel ?? null,
  };
}

export async function buildTripPushPayload(): Promise<ExtendedTripPushPayload> {
  const bundle = await collectPendingTripBundle();

  return {
    deviceId: getOrCreateSyncDeviceId(),
    pushedAt: nowIso(),
    trips: bundle.trips.map(serializeTrip),
    fish: bundle.fish.map(serializeFish),
    photos: bundle.photos.map(serializePhoto),
    tackles: bundle.tackles.map(serializeTackle),
  };
}

export async function hasPendingSyncData(): Promise<boolean> {
  const bundle = await collectPendingTripBundle();
  return (
    bundle.trips.length > 0 ||
    bundle.fish.length > 0 ||
    bundle.photos.length > 0 ||
    bundle.tackles.length > 0
  );
}

async function markTripsAsSynced(trips: TripRecord[], syncedAt: string) {
  await db.transaction("rw", db.trips, async () => {
    for (const row of trips) {
      if (!row.id) continue;
      await db.trips.update(row.id, {
        syncStatus: "synced",
        updatedAt: row.deletedAt ? row.updatedAt : syncedAt,
      });
    }
  });
}

async function markFishAsSynced(fish: TripFish[], syncedAt: string) {
  await db.transaction("rw", db.tripFish, async () => {
    for (const row of fish) {
      if (!row.id) continue;
      await db.tripFish.update(row.id, {
        syncStatus: "synced",
        updatedAt: row.deletedAt ? row.updatedAt : syncedAt,
      });
    }
  });
}

async function markPhotosAsSynced(photos: TripPhoto[], syncedAt: string) {
  await db.transaction("rw", db.tripPhotos, async () => {
    for (const row of photos) {
      if (!row.id) continue;
      await db.tripPhotos.update(row.id, {
        syncStatus: "synced",
        updatedAt: row.deletedAt ? row.updatedAt : syncedAt,
      });
    }
  });
}

async function markTacklesAsSynced(tackles: TackleItem[], syncedAt: string) {
  await db.transaction("rw", db.tackleItems, async () => {
    for (const row of tackles) {
      if (!row.id) continue;
      await db.tackleItems.update(row.id, {
        syncStatus: "synced",
        updatedAt: row.deletedAt ? row.updatedAt : syncedAt,
      });
    }
  });
}

async function markTripsAsError(trips: TripRecord[]) {
  await db.transaction("rw", db.trips, async () => {
    for (const row of trips) {
      if (!row.id) continue;
      await db.trips.update(row.id, { syncStatus: "error" });
    }
  });
}

async function markFishAsError(fish: TripFish[]) {
  await db.transaction("rw", db.tripFish, async () => {
    for (const row of fish) {
      if (!row.id) continue;
      await db.tripFish.update(row.id, { syncStatus: "error" });
    }
  });
}

async function markPhotosAsError(photos: TripPhoto[]) {
  await db.transaction("rw", db.tripPhotos, async () => {
    for (const row of photos) {
      if (!row.id) continue;
      await db.tripPhotos.update(row.id, { syncStatus: "error" });
    }
  });
}

async function markTacklesAsError(tackles: TackleItem[]) {
  await db.transaction("rw", db.tackleItems, async () => {
    for (const row of tackles) {
      if (!row.id) continue;
      await db.tackleItems.update(row.id, { syncStatus: "error" });
    }
  });
}

async function markBundleAsSynced(bundle: PendingSyncBundle, syncedAt: string) {
  await Promise.all([
    markTripsAsSynced(bundle.trips, syncedAt),
    markFishAsSynced(bundle.fish, syncedAt),
    markPhotosAsSynced(bundle.photos, syncedAt),
    markTacklesAsSynced(bundle.tackles, syncedAt),
  ]);
}

async function markBundleAsError(bundle: PendingSyncBundle) {
  await Promise.all([
    markTripsAsError(bundle.trips),
    markFishAsError(bundle.fish),
    markPhotosAsError(bundle.photos),
    markTacklesAsError(bundle.tackles),
  ]);
}

async function upsertPulledTrips(rows: TripSyncRecord[]): Promise<number> {
  let changed = 0;

  await db.transaction("rw", db.trips, async () => {
    for (const remote of rows) {
      if (!remote.uid) continue;

      const local = await db.trips.where("uid").equals(remote.uid).first();

      const normalized: TripRecord = {
        ...(remote as TripRecord),
        syncStatus: "synced",
      };

      if (!local) {
        await db.trips.add(normalized);
        changed += 1;
        continue;
      }

      const localUpdatedAt = Date.parse(local.updatedAt || local.createdAt);
      const remoteUpdatedAt = Date.parse(remote.updatedAt || remote.createdAt);

      if (
        Number.isFinite(remoteUpdatedAt) &&
        (!Number.isFinite(localUpdatedAt) || remoteUpdatedAt > localUpdatedAt)
      ) {
        await db.trips.update(local.id!, {
          ...normalized,
          id: local.id,
        });
        changed += 1;
      }
    }
  });

  return changed;
}

async function upsertPulledFish(rows: TripSyncFish[]): Promise<number> {
  let changed = 0;

  await db.transaction("rw", db.tripFish, db.trips, async () => {
    for (const remote of rows) {
      if (!remote.uid || !remote.tripUid) continue;

      const local = await db.tripFish.where("uid").equals(remote.uid).first();
      const parentTrip = await db.trips
        .where("uid")
        .equals(remote.tripUid)
        .first();

      if (!parentTrip?.id) continue;

      const normalized: TripFish = {
        ...(remote as TripFish),
        tripId: parentTrip.id,
        syncStatus: "synced",
      };

      if (!local) {
        await db.tripFish.add(normalized);
        changed += 1;
        continue;
      }

      const localUpdatedAt = Date.parse(local.updatedAt || local.createdAt);
      const remoteUpdatedAt = Date.parse(remote.updatedAt || remote.createdAt);

      if (
        Number.isFinite(remoteUpdatedAt) &&
        (!Number.isFinite(localUpdatedAt) || remoteUpdatedAt > localUpdatedAt)
      ) {
        await db.tripFish.update(local.id!, {
          ...normalized,
          id: local.id,
          tripId: parentTrip.id,
        });
        changed += 1;
      }
    }
  });

  return changed;
}

async function upsertPulledPhotos(rows: TripSyncPhoto[]): Promise<number> {
  let changed = 0;

  await db.transaction("rw", db.tripPhotos, db.trips, async () => {
    for (const remote of rows) {
      if (!remote.uid || !remote.tripUid) continue;

      const local = await db.tripPhotos.where("uid").equals(remote.uid).first();
      const parentTrip = await db.trips
        .where("uid")
        .equals(remote.tripUid)
        .first();

      if (!parentTrip?.id) continue;

      const normalizedIsCover: 0 | 1 = remote.isCover ? 1 : 0;

      if (!local) {
        await db.tripPhotos.add({
          ...remote,
          tripId: parentTrip.id,
          photoBlob: new Blob([], {
            type: remote.photoType || "application/octet-stream",
          }),
          isCover: normalizedIsCover,
          syncStatus: "synced",
        } as TripPhoto);
        changed += 1;
        continue;
      }

      const localUpdatedAt = Date.parse(local.updatedAt || local.createdAt);
      const remoteUpdatedAt = Date.parse(remote.updatedAt || remote.createdAt);

      if (
        Number.isFinite(remoteUpdatedAt) &&
        (!Number.isFinite(localUpdatedAt) || remoteUpdatedAt > localUpdatedAt)
      ) {
        await db.tripPhotos.update(local.id!, {
          ...remote,
          id: local.id,
          tripId: parentTrip.id,
          photoBlob: local.photoBlob,
          isCover: normalizedIsCover,
          syncStatus: "synced",
        });
        changed += 1;
      }
    }
  });

  return changed;
}

async function upsertPulledTackles(rows: TripSyncTackle[]): Promise<number> {
  let changed = 0;

  await db.transaction("rw", db.tackleItems, async () => {
    for (const remote of rows) {
      if (!remote.uid) continue;

      const local = await db.tackleItems
        .where("uid")
        .equals(remote.uid)
        .first();

      const normalized: TackleItem = {
        uid: remote.uid,
        createdAt: remote.createdAt,
        updatedAt: remote.updatedAt,
        deletedAt: remote.deletedAt ?? null,
        syncStatus: "synced",
        kind: remote.kind,
        maker: remote.maker,
        model: remote.model,
        memo: remote.memo ?? null,
        active: remote.active,
        retiredAt: remote.retiredAt ?? null,
        rod: remote.rod ?? null,
        reel: remote.reel ?? null,
      };

      if (!local) {
        await db.tackleItems.add(normalized);
        changed += 1;
        continue;
      }

      const localUpdatedAt = Date.parse(local.updatedAt || local.createdAt);
      const remoteUpdatedAt = Date.parse(remote.updatedAt || remote.createdAt);

      if (
        Number.isFinite(remoteUpdatedAt) &&
        (!Number.isFinite(localUpdatedAt) || remoteUpdatedAt > localUpdatedAt)
      ) {
        await db.tackleItems.update(local.id!, {
          ...normalized,
          id: local.id,
        });
        changed += 1;
      }
    }
  });

  return changed;
}

export async function applyPullResponse(
  response: TripPullResponse,
): Promise<Pick<SyncResult, "pulledTrips" | "pulledFish" | "pulledPhotos">> {
  const extended = response as ExtendedTripPullResponse;

  const pulledTrips = await upsertPulledTrips(extended.trips ?? []);
  const pulledFish = await upsertPulledFish(extended.fish ?? []);
  const pulledPhotos = await upsertPulledPhotos(extended.photos ?? []);
  await upsertPulledTackles(extended.tackles ?? []);

  return {
    pulledTrips,
    pulledFish,
    pulledPhotos,
  };
}

export async function pushTripSync(
  endpoint = DEFAULT_SYNC_ENDPOINT,
): Promise<SyncResult> {
  const bundle = await collectPendingTripBundle();

  if (
    bundle.trips.length === 0 &&
    bundle.fish.length === 0 &&
    bundle.photos.length === 0 &&
    bundle.tackles.length === 0
  ) {
    return {
      ok: true,
      pushedTrips: 0,
      pushedFish: 0,
      pushedPhotos: 0,
      pulledTrips: 0,
      pulledFish: 0,
      pulledPhotos: 0,
      errors: [],
    };
  }

  const payload = await buildTripPushPayload();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      await markBundleAsError(bundle);
      return {
        ok: false,
        pushedTrips: 0,
        pushedFish: 0,
        pushedPhotos: 0,
        pulledTrips: 0,
        pulledFish: 0,
        pulledPhotos: 0,
        errors: [`push failed: ${res.status} ${res.statusText}`],
      };
    }

    const data = (await res.json()) as SyncApiResponse;
    if (!data.ok) {
      await markBundleAsError(bundle);
      return {
        ok: false,
        pushedTrips: 0,
        pushedFish: 0,
        pushedPhotos: 0,
        pulledTrips: 0,
        pulledFish: 0,
        pulledPhotos: 0,
        errors: [data.error || "push failed"],
      };
    }

    return {
      ok: true,
      pushedTrips: payload.trips.length,
      pushedFish: payload.fish.length,
      pushedPhotos: payload.photos.length,
      pulledTrips: 0,
      pulledFish: 0,
      pulledPhotos: 0,
      errors: [],
    };
  } catch (error) {
    await markBundleAsError(bundle);
    return {
      ok: false,
      pushedTrips: 0,
      pushedFish: 0,
      pushedPhotos: 0,
      pulledTrips: 0,
      pulledFish: 0,
      pulledPhotos: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function pullTripSync(
  endpoint = DEFAULT_SYNC_ENDPOINT,
  since?: string | null,
): Promise<SyncResult> {
  try {
    if (typeof window === "undefined") {
      return {
        ok: false,
        pushedTrips: 0,
        pushedFish: 0,
        pushedPhotos: 0,
        pulledTrips: 0,
        pulledFish: 0,
        pulledPhotos: 0,
        errors: ["window is not available"],
      };
    }

    const effectiveSince = since ?? getLastSyncAt();

    const url = new URL(endpoint, window.location.origin);
    if (effectiveSince) {
      url.searchParams.set("since", effectiveSince);
    }
    url.searchParams.set("deviceId", getOrCreateSyncDeviceId());

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        pushedTrips: 0,
        pushedFish: 0,
        pushedPhotos: 0,
        pulledTrips: 0,
        pulledFish: 0,
        pulledPhotos: 0,
        errors: [`pull failed: ${res.status} ${res.statusText}`],
      };
    }

    const data = (await res.json()) as ExtendedTripPullResponse;
    const applied = await applyPullResponse(data);

    setLastSyncAt(data.serverTime || nowIso());

    return {
      ok: true,
      pushedTrips: 0,
      pushedFish: 0,
      pushedPhotos: 0,
      pulledTrips: applied.pulledTrips,
      pulledFish: applied.pulledFish,
      pulledPhotos: applied.pulledPhotos,
      errors: [],
    };
  } catch (error) {
    return {
      ok: false,
      pushedTrips: 0,
      pushedFish: 0,
      pushedPhotos: 0,
      pulledTrips: 0,
      pulledFish: 0,
      pulledPhotos: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function syncTrips(
  endpoint = DEFAULT_SYNC_ENDPOINT,
): Promise<SyncResult> {
  const beforeSyncAt = getLastSyncAt();
  const pendingBundle = await collectPendingTripBundle();

  const pushResult = await pushTripSync(endpoint);
  if (!pushResult.ok) {
    return pushResult;
  }

  if (
    pendingBundle.trips.length > 0 ||
    pendingBundle.fish.length > 0 ||
    pendingBundle.photos.length > 0 ||
    pendingBundle.tackles.length > 0
  ) {
    await markBundleAsSynced(pendingBundle, nowIso());
  }

  const pullResult = await pullTripSync(endpoint, beforeSyncAt);

  return {
    ok: pullResult.ok,
    pushedTrips: pushResult.pushedTrips,
    pushedFish: pushResult.pushedFish,
    pushedPhotos: pushResult.pushedPhotos,
    pulledTrips: pullResult.pulledTrips,
    pulledFish: pullResult.pulledFish,
    pulledPhotos: pullResult.pulledPhotos,
    errors: [...(pushResult.errors ?? []), ...(pullResult.errors ?? [])],
  };
}
