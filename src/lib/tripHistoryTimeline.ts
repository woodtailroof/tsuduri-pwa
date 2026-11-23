import type { TripRecord, TripFish, TripPhoto } from "../db";

export function validDate(value?: string | null): Date | null {
  const date = new Date(value ?? "");
  return Number.isFinite(date.getTime()) ? date : null;
}
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function durationLabel(minutes: number | null): string {
  if (minutes == null || minutes < 0) return "未記録";
  const n = Math.floor(minutes);
  return n >= 60 ? `${Math.floor(n / 60)}時間${n % 60 ? `${n % 60}分` : ""}` : `${n}分`;
}
export type HistoryEvent = {
  id: string; role: "start" | "catch" | "end"; at: Date | null;
  fish?: TripFish; photo?: TripPhoto;
};
export function historyTimeline(trip: TripRecord, fish: TripFish[], photos: TripPhoto[]) {
  // 古い「日時不明」の開始値は保存時刻を代用していたため、実釣日時に使わない。
  const start = trip.timeBand === "unknown" ? null : validDate(trip.startedAt);
  const end = validDate(trip.endedAt);
  const rolePhoto = (role: "start" | "end") => {
    const candidates = photos.filter(photo => photo.role === role);
    const timed = candidates.filter(photo => validDate(photo.capturedAt)).sort((a,b) => Date.parse(a.capturedAt!) - Date.parse(b.capturedAt!));
    return (role === "start" ? timed[0] : timed[timed.length-1]) ?? candidates[0];
  };
  const catches: HistoryEvent[] = fish.map((row, i) => ({
    id: `catch-${row.uid || i}`, role: "catch", at: validDate(row.caughtAt), fish: row,
    photo: photos.find(p => !!row.catchPhotoUid && p.uid === row.catchPhotoUid),
  }));
  const events: HistoryEvent[] = [
    { id: "start", role: "start", at: start, photo: rolePhoto("start") },
    ...catches,
    { id: "end", role: "end", at: end, photo: rolePhoto("end") },
  ];
  events.sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity)
    || ({start:0,catch:1,end:2}[a.role] - {start:0,catch:1,end:2}[b.role]));
  const knownCatches = catches.filter(e => e.at).sort((a,b) => a.at!.getTime() - b.at!.getTime());
  const first = knownCatches[0]?.at;
  return {
    events, start, end,
    duration: start && end && end >= start ? (end.getTime() - start.getTime()) / 60000 : null,
    firstCatchMinutes: start && first && first >= start && (!end || first <= end) ? (first.getTime() - start.getTime()) / 60000 : null,
    unknownCatches: catches.filter(e => !e.at).length,
    days: [...new Map(events.filter(e => e.at).map(e => [localDay(e.at!), e.at!])).values()].sort((a,b) => a.getTime()-b.getTime()),
  };
}
