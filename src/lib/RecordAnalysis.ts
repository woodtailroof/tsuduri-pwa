// src/lib/RecordAnalysis.ts
import { db } from "../db";

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

/**
 * 魚種ごとの釣果
 */
export async function analyzeSpecies(): Promise<SpeciesStats[]> {
  const fish = await db.tripFish.toArray();

  const map = new Map<string, { total: number; sizeSum: number }>();

  for (const f of fish) {
    const key = f.species ?? "unknown";

    if (!map.has(key)) {
      map.set(key, { total: 0, sizeSum: 0 });
    }

    const v = map.get(key)!;
    v.total++;

    if (f.sizeCm) {
      v.sizeSum += f.sizeCm;
    }
  }

  return [...map.entries()].map(([species, v]) => ({
    species,
    total: v.total,
    avgSize: v.total ? v.sizeSum / v.total : 0,
  }));
}

/**
 * 時間帯分析
 */
export async function analyzeTimeBand(): Promise<TimeBandStats[]> {
  const fish = await db.tripFish.toArray();

  const map = new Map<string, number>();

  for (const f of fish) {
    const band = f.timeBand ?? "unknown";
    map.set(band, (map.get(band) ?? 0) + 1);
  }

  return [...map.entries()].map(([band, total]) => ({
    band,
    total,
  }));
}

/**
 * 潮分析
 */
export async function analyzeTide(): Promise<TideStats[]> {
  const trips = await db.trips.toArray();

  const map = new Map<string, number>();

  for (const t of trips) {
    const tide = t.tideName ?? "unknown";
    map.set(tide, (map.get(tide) ?? 0) + 1);
  }

  return [...map.entries()].map(([tide, total]) => ({
    tide,
    total,
  }));
}

/**
 * ルアー分析
 */
export async function analyzeLure(): Promise<LureStats[]> {
  const trips = await db.trips.toArray();

  const map = new Map<string, number>();

  for (const t of trips) {
    const lure = t.lureType ?? "unknown";
    map.set(lure, (map.get(lure) ?? 0) + 1);
  }

  return [...map.entries()].map(([lure, total]) => ({
    lure,
    total,
  }));
}

/**
 * 月別釣果
 */
export async function analyzeMonthly(): Promise<Record<string, number>> {
  const fish = await db.tripFish.toArray();

  const map: Record<string, number> = {};

  for (const f of fish) {
    const date = new Date(f.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;

    map[key] = (map[key] ?? 0) + 1;
  }

  return map;
}
