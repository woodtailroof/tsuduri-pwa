// src/db.ts
import Dexie, { type Table } from "dexie";

export type TripOutcome = "caught" | "skunk";
export type TripTimeBand = "morning" | "day" | "evening" | "night" | "unknown";
export type TideTrend = "up" | "down" | "flat" | "unknown";

export type SpotType = "port" | "surf";
export type WaterClarity = "clear" | "normal" | "muddy";

// ルアーは“ジャンル”だけ（モデル名は入れない方針）
export type LureType =
  | "metaljig"
  | "minnow"
  | "sinkingpencil"
  | "top"
  | "worm"
  | "blade"
  | "bigbait"
  | "other";

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

  // ✅ 互換・暫定用（将来的には TripFish.lureType を主に使う）
  lureType?: LureType | null;

  // ✅ 追加：釣り場タイプ
  spotType?: SpotType | null;

  // ✅ 追加：濁り
  waterClarity?: WaterClarity | null;

  // ✅ 追加：見えベイト
  baitPresent?: boolean | null;

  // ✅ 追加：EXIF由来の位置
  lat?: number | null;
  lon?: number | null;

  // 潮（tide736 由来のスナップショット）
  tideDayKey?: string | null; // YYYY-MM-DD
  tideName?: string | null; // 大潮 / 中潮 / 小潮 / 長潮 / 若潮 ...
  tidePhase?: string | null; // フェーズ
  tideTrend?: TideTrend | null;
  tideCm?: number | null;

  // 気象（あとで実装）
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

  // ✅ 魚ごとのルアージャンル
  lureType?: LureType | null;

  // ✅ 分析用に保持（魚ごとのヒット時間帯）
  timeBand?: TripTimeBand | null;

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
 * 旧 catchTransfer / stats / 旧分析系が参照している CatchRecord / db.catches を一時的に提供する。
 * 互換不要方針なので、旧ファイルをTrip版に置き換えたら削除してOK。
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
      catches: "++id, createdAt, capturedAt, result",
    });

    this.version(2).stores({
      trips:
        "++id, createdAt, startedAt, endedAt, pointId, outcome, timeBand, lureType, tideDayKey, tideName, tidePhase, tideTrend, weatherCode",
      tripFish:
        "++id, tripId, species, timeBand, createdAt, [tripId+species], [tripId+timeBand], [tripId+species+timeBand]",
      tripPhotos:
        "++id, tripId, createdAt, capturedAt, isCover, order, [tripId+order], [tripId+isCover]",
      tideCache: "key, day, pc, hc, fetchedAt",
      catches: "++id, createdAt, capturedAt, result",
    });

    this.version(3)
      .stores({
        // ✅ 分析対応正式版
        trips:
          "++id, createdAt, startedAt, endedAt, pointId, outcome, timeBand, lureType, spotType, waterClarity, baitPresent, lat, lon, tideDayKey, tideName, tidePhase, tideTrend, weatherCode",

        tripFish:
          "++id, tripId, species, lureType, timeBand, createdAt, [tripId+species], [tripId+lureType], [tripId+timeBand], [tripId+species+timeBand]",

        tripPhotos:
          "++id, tripId, createdAt, capturedAt, isCover, order, [tripId+order], [tripId+isCover]",

        tideCache: "key, day, pc, hc, fetchedAt",

        // ✅ 互換シム
        catches: "++id, createdAt, capturedAt, result",
      })
      .upgrade(async () => {
        // 運用前想定。既存データ補完は今は不要。
      });
  }
}

export const db = new AppDB();
