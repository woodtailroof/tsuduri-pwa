import type { TideTrend, TripTimeBand } from "../db";
import { getTimeBand } from "./timeband";

export type PhotoRole = "start" | "catch" | "end" | "other";

export function catchTimeBand(iso: string | null | undefined): TripTimeBand {
  const date = new Date(iso ?? "");
  if (!Number.isFinite(date.getTime())) return "unknown";
  const bands: Record<ReturnType<typeof getTimeBand>, TripTimeBand> = {
    朝マズメ: "morning", デイ: "day", 夕マズメ: "evening", ナイト: "night",
  };
  return bands[getTimeBand(date)];
}

export function photoEventDate(
  photos: { role?: PhotoRole; capturedAt: Date | null }[], role: "start" | "end",
): Date | null {
  const dates = photos.filter((photo) => photo.role === role)
    .map((photo) => photo.capturedAt?.getTime())
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!dates.length) return null;
  return new Date(role === "start" ? Math.min(...dates) : Math.max(...dates));
}

/** 実釣した時間帯を列挙。終了時刻が不明な釣行の滞在時間は推定しない。 */
export function fishingTimeBands(startedAt: string, endedAt?: string | null): Set<TripTimeBand> {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt ?? "");
  const bands = new Set<TripTimeBand>();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return bands;
  if (end - start >= 86_400_000) return new Set(["morning", "day", "evening", "night"]);
  bands.add(catchTimeBand(startedAt));
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);
  while (cursor.getTime() < end) {
    bands.add(catchTimeBand(cursor.toISOString()));
    cursor.setHours(cursor.getHours() + 1);
  }
  return bands;
}

export function catchTimeResults(
  trips: { id?: number; startedAt: string; endedAt?: string; outcome: string; timeBand?: string }[],
  fish: { tripId: number; caughtAt?: string | null }[],
) {
  const results = (["morning", "day", "evening", "night"] as TripTimeBand[])
    .map((band) => ({ band, total: 0, caught: 0 }));
  for (const trip of trips) {
    if (trip.timeBand === "unknown") continue;
    const catches = fish.filter((row) => row.tripId === trip.id);
    // 時刻不明の釣果を「この時間には釣れなかった」と数えない。
    if (trip.outcome === "caught" && (!catches.length || catches.some((row) => catchTimeBand(row.caughtAt) === "unknown"))) continue;
    const bands = fishingTimeBands(trip.startedAt, trip.endedAt);
    if (!bands.size) continue;
    if (catches.some((fish) => {
      const time = Date.parse(fish.caughtAt ?? "");
      return time < Date.parse(trip.startedAt) || time > Date.parse(trip.endedAt ?? "");
    })) continue;
    for (const row of results) {
      if (!bands.has(row.band)) continue;
      row.total += 1;
      if (catches.some((fish) => catchTimeBand(fish.caughtAt) === row.band)) row.caught += 1;
    }
  }
  return results;
}

/** 釣果条件は魚自身の時刻・潮のみ。釣行開始時点へはフォールバックしない。 */
export function actualCatchConditions(fish: { caughtAt?: string | null; caughtTideTrend?: TideTrend | null }) {
  const timeBand = catchTimeBand(fish.caughtAt);
  const value = fish.caughtTideTrend;
  const tideTrend: TideTrend = timeBand !== "unknown" && (value === "up" || value === "down" || value === "flat") ? value : "unknown";
  return { timeBand, tideTrend };
}
