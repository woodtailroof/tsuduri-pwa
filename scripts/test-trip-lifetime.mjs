// Run: node scripts/test-trip-lifetime.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/tripLifetimeStats.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", code)(mod.exports, mod);
const { tripLifetimeStats } = mod.exports;
const now = new Date("2026-11-23T13:00:00+09:00");
const trip = (start, end) => ({ startedAt: start, endedAt: end, createdAt: start });

assert.deepEqual(tripLifetimeStats([], now), {
  firstDate: null, elapsedDays: 0, datedTrips: 0, frequencyDays: null,
  totalMinutes: 0, timedTrips: 0,
});
const records = [
  trip("2026-11-20T23:30:00+09:00", "2026-11-21T01:00:00+09:00"),
  trip("2026-11-23T06:00:00+09:00", "2026-11-23T07:15:00+09:00"),
  trip("2026-11-23T10:00:00+09:00", undefined),
];
const stats = tripLifetimeStats(records, now);
assert.equal(stats.firstDate, "2026-11-20");
assert.equal(stats.elapsedDays, 4);
assert.equal(stats.datedTrips, 3);
assert.equal(stats.frequencyDays, 4 / 3);
assert.equal(stats.totalMinutes, 165);
assert.equal(stats.timedTrips, 2);
const invalid = tripLifetimeStats([
  trip("bad", "bad"),
  trip("2026-11-23T08:00:00+09:00", "2026-11-23T07:00:00+09:00"),
  trip("2026-11-23T08:00:00+09:00", "2026-11-24T07:00:00+09:00"),
  trip("2026-11-24T08:00:00+09:00", undefined),
], now);
assert.equal(invalid.timedTrips, 0);
assert.equal(invalid.totalMinutes, 0);
assert.equal(invalid.datedTrips, 2);
assert.equal(invalid.frequencyDays, 0.5); // 同日の複数釣行もそれぞれ1回。
const fallback = tripLifetimeStats([{ startedAt: "", createdAt: "2026-11-21T18:00:00Z" }], now);
assert.equal(fallback.firstDate, "2026-11-22");
assert.equal(fallback.elapsedDays, 2);
assert.equal(fallback.timedTrips, 0);
const midnight = tripLifetimeStats([trip("2026-11-22T23:59:00+09:00", undefined)], new Date("2026-11-23T00:01:00+09:00"));
assert.equal(midnight.elapsedDays, 2);
assert.equal(tripLifetimeStats(records.slice(1, 2), now).elapsedDays, 1);
console.log("PASS: lifetime duration, missing dates, overnight trips, multiple trips and Japan calendar days");
