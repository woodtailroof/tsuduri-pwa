// src/db.ts
import Dexie, { type Table } from "dexie";

export type TripOutcome = "caught" | "skunk";

export type TripTimeBand = "morning" | "day" | "evening" | "night" | "unknown";

export type TideTrend = "up" | "down" | "flat" | "unknown";

export type SpotType = "port" | "surf" | "river";

export type WaterClarity = "clear" | "normal" | "muddy";

export type SyncStatus = "pending" | "synced" | "error";

export type LureType =
  | "metaljig"
  | "minnow"
  | "sinkingpencil"
  | "top"
  | "worm"
  | "blade"
  | "bigbait"
  | "egi"
  | "sabiki"
  | "bait"
  | "other";

/* =========================
   🎣 タックル型
========================= */

export type RodType = "spinning" | "bait";

export type ReelType = "spinning" | "bait";

export type TackleKind = "rod" | "reel";

export type TackleReel = {
  reelType: ReelType;
  sizeLabel: string;

  weightG?: number | null;

  spoolDiameterMm?: number | null;
  spoolWidthMm?: number | null;

  retrieveCm?: number | null;
};

export type TackleRod = {
  rodType: RodType;
  sizeLabel: string;

  lengthFeet?: number | null;
  lengthInches?: number | null;

  tipMm?: number | null;
  buttMm?: number | null;

  weightG?: number | null;

  castWeightMinG?: number | null;
  castWeightMaxG?: number | null;
};

export type TackleItem = {
  id?: number;

  uid: string;

  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  createdAt: string;

  kind: TackleKind;

  maker: string;
  model: string;

  memo?: string | null;

  active: boolean;

  retiredAt?: string | null;

  reel?: TackleReel | null;
  rod?: TackleRod | null;
};

/* =========================
   🎣 Trip
========================= */

export type TripRecord = {
  id?: number;

  uid: string;

  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  createdAt: string;

  startedAt: string;
  endedAt?: string;

  pointId: string;

  memo: string;

  outcome: TripOutcome;

  timeBand: TripTimeBand;

  lureType?: LureType | null;

  rodId?: number | null;
  reelId?: number | null;

  rodUid?: string | null;
  reelUid?: string | null;

  spotType?: SpotType | null;

  waterClarity?: WaterClarity | null;

  baitPresent?: boolean | null;

  lat?: number | null;
  lon?: number | null;

  tideDayKey?: string | null;
  tideName?: string | null;
  tidePhase?: string | null;
  tideTrend?: TideTrend | null;
  tideCm?: number | null;

  weatherCode?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  waveHeightM?: number | null;
  airTempC?: number | null;

  envFetchedAt?: string | null;
};

export type TripFish = {
  id?: number;

  uid: string;
  tripUid: string;

  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  tripId: number;

  species: string;

  sizeCm?: number | null;
  count?: number | null;

  lureType?: LureType | null;
  tripTackleUid?: string | null;

  timeBand?: TripTimeBand | null;

  createdAt: string;
};

export type TripTackle = {
  id?: number;
  uid: string;
  tripUid: string;
  tripId: number;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  order: number;
  lureType: LureType;
  rodId?: number | null;
  reelId?: number | null;
  rodUid?: string | null;
  reelUid?: string | null;
};

export type TripPhoto = {
  id?: number;

  uid: string;
  tripUid: string;

  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  remoteKey?: string | null;

  tripId: number;

  createdAt: string;

  capturedAt?: string | null;

  photoName?: string | null;

  photoType: string;

  photoBlob: Blob;

  order: number;

  isCover: 0 | 1;
};

/* =========================
   Tide
========================= */

export type TidePoint = {
  unix?: number;
  cm: number;
  time?: string;
};

export type TideCacheEntry = {
  key: string;

  pc: string;
  hc: string;

  day: string;

  series: TidePoint[];

  tideName?: string | null;

  fetchedAt: string;
};

/* =========================
   Catch互換
========================= */

export type CatchRecord = {
  id?: number;

  createdAt: string;

  capturedAt?: string | null;

  result?: "caught" | "skunk" | string;

  species?: string | null;

  sizeCm?: number | null;

  memo?: string | null;

  photoBlob?: Blob | null;

  [k: string]: unknown;
};

/* =========================
   DB
========================= */

class AppDB extends Dexie {
  trips!: Table<TripRecord, number>;

  tripFish!: Table<TripFish, number>;

  tripPhotos!: Table<TripPhoto, number>;
  tripTackles!: Table<TripTackle, number>;

  tideCache!: Table<TideCacheEntry, string>;

  tackleItems!: Table<TackleItem, number>;

  catches!: Table<CatchRecord, number>;

  constructor() {
    super("appdb");

    // v6
    this.version(6).stores({
      trips:
        "++id, uid, createdAt, updatedAt, deletedAt, syncStatus, startedAt, pointId, outcome, timeBand, lureType, rodId, reelId, rodUid, reelUid, [rodUid+createdAt], [reelUid+createdAt]",

      tripFish:
        "++id, uid, tripId, tripUid, species, lureType, timeBand, createdAt",

      tripPhotos:
        "++id, uid, tripId, tripUid, createdAt, remoteKey, capturedAt, isCover, order",

      tideCache: "key, day, pc, hc, fetchedAt",

      catches: "++id, createdAt, capturedAt, result",

      tackleItems:
        "++id, uid, updatedAt, deletedAt, syncStatus, createdAt, kind, active",
    });

    // 🔥 sync index追加
    this.version(7).stores({
      trips:
        "++id, uid, createdAt, updatedAt, deletedAt, syncStatus, startedAt, pointId, outcome, timeBand, lureType, rodId, reelId, rodUid, reelUid, [rodUid+createdAt], [reelUid+createdAt]",

      tripFish:
        "++id, uid, tripId, tripUid, updatedAt, deletedAt, syncStatus, species, lureType, timeBand, createdAt",

      tripPhotos:
        "++id, uid, tripId, tripUid, updatedAt, deletedAt, syncStatus, createdAt, remoteKey, capturedAt, isCover, order",

      tideCache: "key, day, pc, hc, fetchedAt",

      catches: "++id, createdAt, capturedAt, result",

      tackleItems:
        "++id, uid, updatedAt, deletedAt, syncStatus, createdAt, kind, active",
    });

    this.version(8).stores({
      trips:
        "++id, uid, createdAt, updatedAt, deletedAt, syncStatus, startedAt, pointId, outcome, timeBand, lureType, rodId, reelId, rodUid, reelUid, [rodUid+createdAt], [reelUid+createdAt]",
      tripFish:
        "++id, uid, tripId, tripUid, tripTackleUid, updatedAt, deletedAt, syncStatus, species, lureType, timeBand, createdAt",
      tripPhotos:
        "++id, uid, tripId, tripUid, updatedAt, deletedAt, syncStatus, createdAt, remoteKey, capturedAt, isCover, order",
      tripTackles:
        "++id, uid, tripId, tripUid, updatedAt, deletedAt, syncStatus, order, lureType, rodUid, reelUid",
      tideCache: "key, day, pc, hc, fetchedAt",
      catches: "++id, createdAt, capturedAt, result",
      tackleItems:
        "++id, uid, updatedAt, deletedAt, syncStatus, createdAt, kind, active",
    }).upgrade(async (tx) => {
      const trips = await tx.table("trips").toArray();
      const fishTable = tx.table("tripFish");
      const setupTable = tx.table("tripTackles");
      for (const trip of trips) {
        if (!trip.id || !trip.uid || trip.deletedAt) continue;
        const hasLegacySetup =
          trip.rodUid || trip.reelUid || trip.lureType;
        if (!hasLegacySetup) continue;
        const uid = `${trip.uid}:legacy-tackle`;
        await setupTable.add({
          uid,
          tripUid: trip.uid,
          tripId: trip.id,
          updatedAt: trip.updatedAt ?? trip.createdAt,
          deletedAt: null,
          syncStatus: "pending",
          createdAt: trip.createdAt,
          order: 0,
          lureType: trip.lureType ?? "other",
          rodId: trip.rodId ?? null,
          reelId: trip.reelId ?? null,
          rodUid: trip.rodUid ?? null,
          reelUid: trip.reelUid ?? null,
        });
        const rows = await fishTable.where("tripId").equals(trip.id).toArray();
        for (const row of rows) {
          await fishTable.update(row.id, {
            tripTackleUid: uid,
            updatedAt: new Date().toISOString(),
            syncStatus: "pending",
          });
        }
      }
    });
  }
}

export const db = new AppDB();
