// src/lib/RecordAnalysis.ts
import { db, type TripRecord, type TripFish } from "../db";

export type SpeciesStats = {
  species: string;
  total: number;
  avgSize: number;
};

export type TimeBandStats = {
  band: string;
  total: number;
};

export type TideStats = {
  tide: string;
  total: number;
};

export type LureStats = {
  lure: string;
  total: number;
};

type TripTimeBandLike = TripRecord["timeBand"];

type TripWithOptionalLure = TripRecord & {
  /** まだDB/型に未導入の想定。導入したら削ってOK */
  lureType?: string | null;
};

function normalizeLabel(raw: unknown, fallback = "unknown"): string {
  if (typeof raw !== "string") return fallback;

  // ✅ 前後空白 + 全角スペース類を軽く正規化（カテゴリ統合はしない）
  const s = raw
    .replace(/\u3000/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return s ? s : fallback;
}

function safeNum(n: unknown): number | null {
  if (typeof n !== "number") return null;
  if (!Number.isFinite(n)) return null;
  return n;
}

function sortByTotalDesc<T extends { total: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => b.total - a.total);
}

function buildTripMap(trips: TripRecord[]): Map<number, TripWithOptionalLure> {
  const m = new Map<number, TripWithOptionalLure>();
  for (const t of trips) {
    if (typeof t.id === "number") m.set(t.id, t as TripWithOptionalLure);
  }
  return m;
}

/**
 * 魚種ごとの釣果（tripFishベース）
 */
export async function analyzeSpecies(): Promise<SpeciesStats[]> {
  const fish: TripFish[] = await db.tripFish.toArray();

  const map = new Map<
    string,
    { total: number; sizeSum: number; sizeCount: number }
  >();

  for (const f of fish) {
    const key = normalizeLabel(f.species, "unknown");

    if (!map.has(key)) map.set(key, { total: 0, sizeSum: 0, sizeCount: 0 });

    const v = map.get(key)!;
    v.total++;

    const sz = safeNum(f.sizeCm);
    if (sz != null && sz > 0) {
      v.sizeSum += sz;
      v.sizeCount++;
    }
  }

  const out = [...map.entries()].map(([species, v]) => ({
    species,
    total: v.total,
    avgSize: v.sizeCount ? v.sizeSum / v.sizeCount : 0,
  }));

  return sortByTotalDesc(out);
}

/**
 * 時間帯分析（tripFishをtripに突合して timeBand で集計）
 * ※「釣れた魚」を時間帯別にカウントする
 */
export async function analyzeTimeBand(): Promise<TimeBandStats[]> {
  const [fish, trips] = await Promise.all([
    db.tripFish.toArray() as Promise<TripFish[]>,
    db.trips.toArray() as Promise<TripRecord[]>,
  ]);

  const tripById = buildTripMap(trips);

  const map = new Map<string, number>();

  for (const f of fish) {
    const tripId = f.tripId;
    const trip = tripById.get(tripId);

    const band: TripTimeBandLike = trip?.timeBand ?? "unknown";
    const key = normalizeLabel(band, "unknown");

    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const out = [...map.entries()].map(([band, total]) => ({ band, total }));
  return sortByTotalDesc(out);
}

/**
 * 潮分析（tripsベース）
 * ✅ 潮名はDBに出てきたものを、そのまま「別状態」として集計する
 * ※ 空/NULLだけ unknown に寄せる
 */
export async function analyzeTide(): Promise<TideStats[]> {
  const trips: TripRecord[] = await db.trips.toArray();

  const map = new Map<string, number>();

  for (const t of trips) {
    const tide = normalizeLabel(t.tideName, "unknown");
    map.set(tide, (map.get(tide) ?? 0) + 1);
  }

  const out = [...map.entries()].map(([tide, total]) => ({ tide, total }));
  return sortByTotalDesc(out);
}

/**
 * ルアー分析（tripsベース）
 * ※ lureType はまだ型に無い想定なので Optional として扱う（ESLint対策で any 禁止）
 */
export async function analyzeLure(): Promise<LureStats[]> {
  const trips: TripWithOptionalLure[] =
    (await db.trips.toArray()) as TripWithOptionalLure[];

  const map = new Map<string, number>();

  for (const t of trips) {
    const lure = normalizeLabel(t.lureType, "unknown");
    map.set(lure, (map.get(lure) ?? 0) + 1);
  }

  const out = [...map.entries()].map(([lure, total]) => ({ lure, total }));
  return sortByTotalDesc(out);
}

/**
 * 月別釣果（tripFishをtripに突合して、釣行基準時刻 startedAt で月を切る）
 * ※ 帰宅投稿でも startedAt なら「釣れた瞬間」に寄せられる
 */
export async function analyzeMonthly(): Promise<Record<string, number>> {
  const [fish, trips] = await Promise.all([
    db.tripFish.toArray() as Promise<TripFish[]>,
    db.trips.toArray() as Promise<TripRecord[]>,
  ]);

  const tripById = buildTripMap(trips);

  const map: Record<string, number> = {};

  for (const f of fish) {
    const trip = tripById.get(f.tripId);

    const iso = trip?.startedAt || trip?.createdAt || f.createdAt;
    const d = new Date(iso);
    const ms = d.getTime();
    if (!Number.isFinite(ms)) continue;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key] = (map[key] ?? 0) + 1;
  }

  return map;
}
