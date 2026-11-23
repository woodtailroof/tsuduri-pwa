// Run: node scripts/test-trip-time-range.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function load(relativePath) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", code)(mod.exports, mod);
  return mod.exports;
}
const { parseDateTimeLocalValue: parse, tripTimeRangeError: error } = load("../src/lib/tripTimeRange.ts");
const { tripLifetimeStats } = load("../src/lib/tripLifetimeStats.ts");
const now = parse("2026-11-23T23:59");
assert.equal(parse("2026-02-30T10:00"), null);
assert.equal(parse("2026-11-23T24:00"), null);
assert.equal(parse("not a date"), null);
assert.ok(parse("2024-02-29T10:00"));
assert.equal(error(null, "", now), "");
assert.ok(error(null, "2026-11-23T12:00", now));
assert.ok(error(parse("2026-11-23T10:00"), "2026-11-23T09:00", now));
assert.ok(error(parse("2026-11-23T10:00"), "2026-11-24T10:00", now));
assert.equal(error(parse("2026-11-22T23:00"), "2026-11-23T01:30", now), "");
assert.equal(error(parse("2026-11-23T10:00"), "", now), "");
const start = parse("2026-11-22T23:00");
const end = parse("2026-11-23T01:30");
const saved = { startedAt: start.toISOString(), endedAt: end.toISOString(), createdAt: now.toISOString() };
assert.equal(tripLifetimeStats([saved], now).totalMinutes, 150);
const edited = { ...saved, endedAt: parse("2026-11-23T02:00").toISOString() };
assert.equal(tripLifetimeStats([edited], now).totalMinutes, 180);
const cleared = { ...edited, endedAt: undefined };
assert.equal(tripLifetimeStats([cleared], now).timedTrips, 0);
console.log("PASS: optional times, valid calendar dates, overnight trips, edit/clear and duration aggregation");
