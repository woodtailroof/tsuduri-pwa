// src/db.ts
import Dexie, { type Table } from "dexie";

export type TripOutcome = "caught" | "skunk";
export type TripTimeBand = "morning" | "day" | "evening" | "night" | "unknown";
export type TideTrend = "up" | "down" | "flat" | "unknown";

export type TripRecord = {
  id?: number;

  createdAt: string; // 投稿作成（=保存）日時 ISO
  startedAt: string; // 釣行の基準時刻（写真EXIF最古 or 手動入力）ISO
  endedAt?: string;

  pointId: string;
  memo: string;

  outcome: TripOutcome;

  // 分析軸
  timeBand: TripTimeBand;

  // 潮（tide736 由来のスナップショット）
  tideDayKey?: string | null; // YYYY-MM-DD
  tideName?: string | null; // 大潮/中潮...
  tidePhase?: string | null; // フェーズ
  tideTrend?: TideTrend | null;
  tideCm?: number | null;

  // 気象（後で実装）
  weatherCode?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  waveHeightM?: number | null;
  airTempC?: number | null;

  envFetchedAt?: string | null;
};

export type TripFish = {
  id?: number;
  tripId: number;

  species: string;
  sizeCm?: number | null;
  count?: number | null;

  createdAt: string; // ISO
};

export type TripPhoto = {
  id?: number;
  tripId: number;

  createdAt: string; // 追加日時 ISO
  capturedAt?: string | null; // EXIF撮影日時（なければ null）

  photoName?: string | null;
  photoType: string;
  photoBlob: Blob;

  order: number; // 0..N
  isCover: 0 | 1;
};

// tide736 day cache
export type TidePoint = { unix?: number; cm: number; time?: string };

export type TideCacheEntry = {
  key: string; // `${pc}:${hc}:${YYYY-MM-DD}`
  pc: string;
  hc: string;
  day: string; // YYYY-MM-DD
  series: TidePoint[];
  tideName?: string | null;
  fetchedAt: string; // ISO
};

/**
 * ✅ 互換シム（ビルド通すため）
 * 旧 catchTransfer / stats / RecordAnalysis が参照している CatchRecord / db.catches を一時的に提供する。
 * 互換不要方針なので、後で旧ファイルをTrip版に置き換えたら削除してOK。
 */
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

class AppDB extends Dexie {
  trips!: Table<TripRecord, number>;
  tripFish!: Table<TripFish, number>;
  tripPhotos!: Table<TripPhoto, number>;
  tideCache!: Table<TideCacheEntry, string>;

  // ✅ 互換シム用（旧コードが参照する）
  catches!: Table<CatchRecord, number>;

  constructor() {
    super("appdb");

    this.version(1).stores({
      trips:
        "++id, createdAt, startedAt, endedAt, pointId, outcome, timeBand, tideDayKey, tideName, tidePhase, tideTrend, weatherCode",
      tripFish: "++id, tripId, species, createdAt, [tripId+species]",
      tripPhotos:
        "++id, tripId, createdAt, capturedAt, isCover, order, [tripId+order], [tripId+isCover]",
      tideCache: "key, day, pc, hc, fetchedAt",

      // ✅ 互換シム（最小でOK）
      catches: "++id, createdAt, capturedAt, result",
    });
  }
}

export const db = new AppDB();
