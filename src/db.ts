// src/db.ts
import Dexie, { type Table } from "dexie";

export type TripOutcome = "caught" | "skunk";
export type TripTimeBand = "morning" | "day" | "evening" | "night" | "unknown";
export type TideTrend = "up" | "down" | "flat" | "unknown";

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

  // ✅ 追加：ルアージャンル
  lureType?: LureType | null;

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

  // ✅ 追加：分析用に timeBand を冗長保持（RecordAnalysis.ts が fish.timeBand を参照しても死なない）
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
 * 旧 catchTransfer / stats / RecordAnalysis(旧) が参照している CatchRecord / db.catches を一時的に提供する。
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

    // v1 -> v2: schema（indexes）変更のため version を上げる
    this.version(1).stores({
      trips:
        "++id, createdAt, startedAt, endedAt, pointId, outcome, timeBand, tideDayKey, tideName, tidePhase, tideTrend, weatherCode",
      tripFish: "++id, tripId, species, createdAt, [tripId+species]",
      tripPhotos:
        "++id, tripId, createdAt, capturedAt, isCover, order, [tripId+order], [tripId+isCover]",
      tideCache: "key, day, pc, hc, fetchedAt",
      catches: "++id, createdAt, capturedAt, result",
    });

    this.version(2)
      .stores({
        // ✅ lureType をインデックスに追加（分析で絞り込みしやすい）
        trips:
          "++id, createdAt, startedAt, endedAt, pointId, outcome, timeBand, lureType, tideDayKey, tideName, tidePhase, tideTrend, weatherCode",

        // ✅ timeBand をインデックスに追加（魚→時間帯集計が速い）
        tripFish:
          "++id, tripId, species, timeBand, createdAt, [tripId+species], [tripId+timeBand], [tripId+species+timeBand]",

        tripPhotos:
          "++id, tripId, createdAt, capturedAt, isCover, order, [tripId+order], [tripId+isCover]",
        tideCache: "key, day, pc, hc, fetchedAt",

        // ✅ 互換シム（最小でOK）
        catches: "++id, createdAt, capturedAt, result",
      })
      .upgrade(async () => {
        // 運用前想定。必要なら将来ここで既存データ補完もできる。
      });
  }
}

export const db = new AppDB();
