// src/db.ts
import Dexie, { type Table } from "dexie";

export type TripOutcome = "caught" | "skunk";

export type TripTimeBand = "morning" | "day" | "evening" | "night" | "unknown";

export type TideTrend = "up" | "down" | "flat" | "unknown";

export type TripRecord = {
  id?: number;

  createdAt: string; // 投稿作成（=保存）日時 ISO
  startedAt: string; // 釣行の基準時刻（写真EXIF最古 or 手動入力）ISO
  endedAt?: string; // 任意（今は未使用でもOK）

  pointId: string;
  memo: string;

  outcome: TripOutcome;

  // 分析軸（保存しておく：将来の区分変更にも強い）
  timeBand: TripTimeBand;

  // 潮（焼津固定：tide736 由来のスナップショット）
  tideDayKey?: string | null; // YYYY-MM-DD
  tideName?: string | null; // 大潮/中潮...
  tidePhase?: string | null; // フェーズ
  tideTrend?: TideTrend | null;
  tideCm?: number | null;

  // 気象（open-meteo等のスナップショット。後で実装）
  weatherCode?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  waveHeightM?: number | null;
  airTempC?: number | null;

  envFetchedAt?: string | null; // 取得した時刻（いつの取得か）
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

// tide736 day cache（今の仕組みを活かす）
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

class AppDB extends Dexie {
  trips!: Table<TripRecord, number>;
  tripFish!: Table<TripFish, number>;
  tripPhotos!: Table<TripPhoto, number>;
  tideCache!: Table<TideCacheEntry, string>;

  constructor() {
    super("appdb");

    // v1（互換不要でこれが初期）
    this.version(1).stores({
      trips:
        "++id, createdAt, startedAt, endedAt, pointId, outcome, timeBand, tideDayKey, tideName, tidePhase, tideTrend, weatherCode",
      tripFish: "++id, tripId, species, createdAt, [tripId+species]",
      tripPhotos:
        "++id, tripId, createdAt, capturedAt, isCover, order, [tripId+order], [tripId+isCover]",
      tideCache: "key, day, pc, hc, fetchedAt",
    });
  }
}

export const db = new AppDB();
