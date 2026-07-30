// src/lib/tripSyncTypes.ts

export type SyncStatus = "pending" | "synced" | "error";

export type TripSyncRecord = {
  uid: string;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  syncStatus: SyncStatus;

  startedAt: string;
  endedAt?: string | null;

  pointId: string;
  memo: string;

  outcome: "caught" | "skunk";

  timeBand: "morning" | "day" | "evening" | "night" | "unknown";

  lureType?: string | null;

  rodId?: number | null;
  reelId?: number | null;

  rodUid?: string | null;
  reelUid?: string | null;

  spotType?: string | null;
  waterClarity?: string | null;

  baitPresent?: boolean | null;

  lat?: number | null;
  lon?: number | null;

  tideDayKey?: string | null;
  tideName?: string | null;
  tidePhase?: string | null;
  tideTrend?: string | null;
  tideCm?: number | null;

  weatherCode?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  waveHeightM?: number | null;
  airTempC?: number | null;

  envFetchedAt?: string | null;
};

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

  lureType?: string | null;
  tripTackleUid?: string | null;

  timeBand?: "morning" | "day" | "evening" | "night" | "unknown" | null;
};

export type TripSyncTripTackle = {
  uid: string;
  tripUid: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
  order: number;
  lureType: string;
  rodId?: number | null;
  reelId?: number | null;
  rodUid?: string | null;
  reelUid?: string | null;
};

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

export type TackleSyncRod = {
  rodType: "spinning" | "bait";
  sizeLabel: string;
  lengthFeet?: number | null;
  lengthInches?: number | null;
  tipMm?: number | null;
  buttMm?: number | null;
  weightG?: number | null;
  castWeightMinG?: number | null;
  castWeightMaxG?: number | null;
};

export type TackleSyncReel = {
  reelType: "spinning" | "bait";
  sizeLabel: string;
  weightG?: number | null;
  spoolDiameterMm?: number | null;
  spoolWidthMm?: number | null;
  retrieveCm?: number | null;
};

export type TripSyncTackle = {
  uid: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;

  kind: "rod" | "reel";
  maker: string;
  model: string;
  memo?: string | null;
  active: boolean;
  retiredAt?: string | null;

  rod?: TackleSyncRod | null;
  reel?: TackleSyncReel | null;
};

export type TripPushPayload = {
  deviceId: string;
  pushedAt: string;

  trips: TripSyncRecord[];
  fish: TripSyncFish[];
  tripTackles: TripSyncTripTackle[];
  photos: TripSyncPhoto[];
  tackles: TripSyncTackle[];
};

export type TripPullResponse = {
  ok: boolean;

  serverTime: string;

  trips: TripSyncRecord[];
  fish: TripSyncFish[];
  tripTackles: TripSyncTripTackle[];
  photos: TripSyncPhoto[];
  tackles: TripSyncTackle[];
};

export type SyncApiResponse = {
  ok: boolean;
  error?: string;
};

export type SyncResult = {
  ok: boolean;

  pushedTrips: number;
  pushedFish: number;
  pushedPhotos: number;
  pushedTackles: number;

  pulledTrips: number;
  pulledFish: number;
  pulledPhotos: number;
  pulledTackles: number;

  errors: string[];
};

export type SyncConfig = {
  endpoint: string;
  deviceId: string;
};
