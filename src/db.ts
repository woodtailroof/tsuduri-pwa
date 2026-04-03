// src/db.ts
import Dexie, { type Table } from "dexie";

/* =========================
   🔹 既存型
========================= */

export type TripOutcome = "caught" | "skunk";
export type TripTimeBand = "morning" | "day" | "evening" | "night" | "unknown";
export type TideTrend = "up" | "down" | "flat" | "unknown";

export type SpotType = "port" | "surf";
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
  | "other";

/* =========================
   🎣 タックル型（追加）
========================= */

export type RodType = "spinning" | "bait";
export type ReelType = "spinning" | "bait";
export type TackleKind = "rod" | "reel";

export type TackleItem = {
  id?: number;
  uid: string;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  syncStatus: SyncStatus;

  kind: TackleKind;

  maker: string;
  model: string;
  memo?: string | null;

  active: boolean;
  retiredAt?: string | null;

  rod?: {
    rodType: RodType;
    sizeLabel: string;
    lengthFeet?: number | null;
    lengthInches?: number | null;
    tipMm?: number | null;
    buttMm?: number | null;
    weightG?: number | null;
    castWeightMinG?: number | null;
    castWeightMaxG?: number | null;
  } | null;

  reel?: {
    reelType: ReelType;
    sizeLabel: string;
    weightG?: number | null;
    spoolDiameterMm?: number | null;
    spoolWidthMm?: number | null;
    retrieveCm?: number | null;
  } | null;
};

/* =========================
   🔹 TripRecord（拡張）
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

  // ⭐追加
  rodId?: number | null;
  reelId?: number | null;
};

/* =========================
   🔹 その他
========================= */

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
  timeBand?: TripTimeBand | null;

  createdAt: string;
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
   📦 DB
========================= */

class AppDB extends Dexie {
  trips!: Table<TripRecord, number>;
  tripFish!: Table<TripFish, number>;
  tripPhotos!: Table<TripPhoto, number>;

  // ⭐追加
  tackleItems!: Table<TackleItem, number>;

  constructor() {
    super("appdb");

    this.version(1).stores({
      trips: "++id, createdAt",
      tripFish: "++id, tripId",
      tripPhotos: "++id, tripId",
    });

    this.version(2).stores({
      trips: "++id, createdAt",
      tripFish: "++id, tripId",
      tripPhotos: "++id, tripId",
    });

    this.version(3).stores({
      trips: "++id, createdAt",
      tripFish: "++id, tripId",
      tripPhotos: "++id, tripId",
    });

    this.version(4).stores({
      trips: "++id, uid, createdAt, updatedAt",
      tripFish: "++id, uid, tripId",
      tripPhotos: "++id, uid, tripId",
    });

    // ⭐ここが追加本体
    this.version(5).stores({
      trips: "++id, uid, createdAt, updatedAt, rodId, reelId",
      tripFish: "++id, uid, tripId",
      tripPhotos: "++id, uid, tripId",

      tackleItems: "++id, uid, kind, active, updatedAt",
    });
  }
}

export const db = new AppDB();
