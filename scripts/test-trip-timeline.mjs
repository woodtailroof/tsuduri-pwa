// Run: TZ=Asia/Tokyo node scripts/test-trip-timeline.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(filename) {
  const source = fs.readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", "require", code)(mod.exports, mod, (name) => load(path.resolve(path.dirname(filename), `${name}.ts`)));
  return mod.exports;
}
const { catchTimeBand, photoEventDate, fishingTimeBands, catchTimeResults } = load(path.join(root, "src/lib/tripTimeline.ts"));
const at = (hour) => `2026-11-22T${hour}+09:00`;
const photos = [
  { role: "start", capturedAt: new Date(at("14:00")) },
  { role: "catch", capturedAt: new Date(at("16:30")) },
  { role: "end", capturedAt: new Date(at("18:00")) },
  { role: "end", capturedAt: new Date(at("18:10")) },
  { role: "other", capturedAt: new Date(at("08:00")) },
];
assert.equal(photoEventDate(photos, "start").getHours(), 14);
assert.equal(photoEventDate(photos, "end").getMinutes(), 10);
assert.equal(photoEventDate([{ role: "catch", capturedAt: new Date() }], "start"), null);
assert.equal(photoEventDate([{ role: "end", capturedAt: new Date("bad") }], "end"), null);
assert.equal(catchTimeBand(undefined), "unknown");
assert.equal(catchTimeBand(at("16:30")), "evening");
assert.deepEqual([...fishingTimeBands(at("15:00"), at("17:00"))], ["day", "evening"]);
assert.equal(fishingTimeBands(at("15:00")).size, 0);
assert.deepEqual([...fishingTimeBands(at("23:00"), "2026-11-23T05:00:00+09:00")], ["night", "morning"]);
const trips = [
  { id: 1, startedAt: at("15:00"), endedAt: at("17:00"), outcome: "caught" },
  { id: 2, startedAt: at("15:00"), endedAt: at("17:00"), outcome: "skunk" },
  { id: 3, startedAt: at("15:00"), endedAt: at("17:00"), outcome: "caught" },
  { id: 4, startedAt: at("15:00"), outcome: "caught" },
];
const result = catchTimeResults(trips, [
  { tripId: 1, caughtAt: at("16:30") }, { tripId: 1, caughtAt: at("16:40") },
  { tripId: 3 }, { tripId: 4, caughtAt: at("16:30") },
]);
assert.deepEqual(result.find((row) => row.band === "day"), { band: "day", total: 2, caught: 0 });
assert.deepEqual(result.find((row) => row.band === "evening"), { band: "evening", total: 2, caught: 1 });
console.log("PASS: photo roles, actual catch time, overnight exposure and exclusion of incomplete records");
