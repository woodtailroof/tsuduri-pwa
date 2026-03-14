// src/lib/tripSyncTypes.ts

export type SyncStatus = "pending" | "synced" | "error";

/**
 * trips を同期用にシリアライズした形
 * ローカル専用の id は含めない
 */
export type TripSyncRecord = {
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

/**
 * fish を同期用にシリアライズした形
 * ローカル専用の id / tripId は含めない
 */
export type TripSyncFish = {
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

/**
 * photo の「メタ情報」だけを同期する形
 * photoBlob はここに含めない
 */
export type TripSyncPhoto = {
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

/**
 * 端末 -> サーバ に送るメタデータ同期 payload
 * ここには photoBlob を含めない
 */
export type TripPushPayload = {
  deviceId: string;
  pushedAt: string;

  trips: TripSyncRecord[];
  fish: TripSyncFish[];
  photos: TripSyncPhoto[];
};

/**
 * サーバ -> 端末 の pull レスポンス
 * ここでも photoBlob は返さない
 */
export type TripPullResponse = {
  serverTime: string;

  trips: TripSyncRecord[];
  fish: TripSyncFish[];
  photos: TripSyncPhoto[];
};

/**
 * 同期結果
 */
export type SyncResult = {
  ok: boolean;

  pushedTrips: number;
  pushedFish: number;
  pushedPhotos: number;

  pulledTrips: number;
  pulledFish: number;
  pulledPhotos: number;

  errors?: string[];
};

/**
 * API レスポンス
 */
export type SyncApiResponse = {
  ok: boolean;
  result?: SyncResult;
  error?: string;
};

/**
 * ローカルの未同期データをまとめたもの
 * これはクライアント内部用で、まだ DB 型のまま持つ
 */
export type PendingTripBundle = {
  trips: Array<{
    id?: number;
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
  }>;

  fish: Array<{
    id?: number;
    uid: string;
    tripUid: string;

    tripId: number;

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
  }>;

  photos: Array<{
    id?: number;
    uid: string;
    tripUid: string;

    tripId: number;

    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    syncStatus: SyncStatus;

    capturedAt?: string | null;
    photoName?: string | null;
    photoType: string;

    photoBlob: Blob;

    remoteKey?: string | null;

    order: number;
    isCover: 0 | 1;
  }>;
};

/**
 * 同期設定
 */
export type SyncConfig = {
  endpoint: string;
  deviceId: string;
};

/**
 * 写真アップロード用のメタ情報
 * 写真本体は FormData など別経路で送る
 */
export type PhotoUploadTarget = {
  photoUid: string;
  tripUid: string;
  fileName: string;
  fileType: string;
  remoteKey: string;
};

/**
 * 写真アップロード完了レスポンス
 */
export type PhotoUploadResponse = {
  ok: boolean;
  photoUid: string;
  remoteKey: string;
  error?: string;
};
