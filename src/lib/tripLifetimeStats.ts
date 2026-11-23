import type { TripRecord } from "../db";

type TripDates = Pick<TripRecord, "startedAt" | "endedAt" | "createdAt">;

const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本の日付で、最初の釣行日から今日まで（両日を含む）を集計する。 */
export function tripLifetimeStats(trips: TripDates[], now = new Date()) {
  const today = Math.floor((now.getTime() + JST_OFFSET_MS) / DAY_MS);
  let firstDay: number | null = null;
  let datedTrips = 0;
  let timedTrips = 0;
  let totalDurationMs = 0;

  for (const trip of trips) {
    const start = Date.parse(trip.startedAt);
    const recordedAt = Number.isFinite(start) ? start : Date.parse(trip.createdAt);
    if (Number.isFinite(recordedAt) && recordedAt <= now.getTime()) {
      const day = Math.floor((recordedAt + JST_OFFSET_MS) / DAY_MS);
      firstDay = firstDay == null ? day : Math.min(firstDay, day);
      datedTrips += 1;
    }

    const end = Date.parse(trip.endedAt ?? "");
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end <= now.getTime()) {
      totalDurationMs += end - start;
      timedTrips += 1;
    }
  }

  const elapsedDays = firstDay == null ? 0 : today - firstDay + 1;
  return {
    firstDate: firstDay == null ? null : new Date(firstDay * DAY_MS).toISOString().slice(0, 10),
    elapsedDays,
    datedTrips,
    frequencyDays: datedTrips > 0 ? elapsedDays / datedTrips : null,
    totalMinutes: Math.floor(totalDurationMs / 60_000),
    timedTrips,
  };
}
