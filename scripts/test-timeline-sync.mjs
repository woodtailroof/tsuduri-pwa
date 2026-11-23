// Run: node scripts/test-timeline-sync.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
const source = fs.readFileSync(new URL("../functions/api/trip-sync.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source + "\nexport { ensureTimelineSchema, upsertFish, upsertPhoto, fetchFishSince, fetchPhotosSince };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", code)(mod.exports, mod);
const { ensureTimelineSchema, upsertFish, upsertPhoto, fetchFishSince, fetchPhotosSince } = mod.exports;
const sql = new DatabaseSync(":memory:");
sql.exec(`CREATE TABLE sync_trip_fish (
 uid TEXT PRIMARY KEY, trip_uid TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, sync_status TEXT,
 species TEXT, size_cm REAL, count INTEGER, lure_type TEXT, time_band TEXT, trip_tackle_uid TEXT);
 CREATE TABLE sync_trip_photos (
 uid TEXT PRIMARY KEY, trip_uid TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, sync_status TEXT,
 captured_at TEXT, photo_name TEXT, photo_type TEXT, remote_key TEXT, photo_order INTEGER, is_cover INTEGER);`);
const db = { prepare(text) {
  let args = [];
  const statement = {
    bind(...values) { args = values; return statement; },
    async run() { return sql.prepare(text).run(...args); },
    async all() { return { results: sql.prepare(text).all(...args) }; },
  };
  return statement;
}};
await ensureTimelineSchema(db);
await ensureTimelineSchema(db);
const stamp = (day) => `2026-11-${day}T12:00:00Z`;
const base = { tripUid: "trip", createdAt: stamp(20), updatedAt: stamp(20), syncStatus: "pending" };
const fish = { ...base, uid: "fish", species: "seabass", count: 1, caughtAt: stamp(19), catchPhotoUid: "photo", caughtTideTrend: "up", timeBand: "evening" };
await upsertFish(db, fish);
await upsertPhoto(db, { ...base, uid: "photo", photoType: "image/jpeg", order: 0, isCover: 1, role: "catch" });
let rows = await fetchFishSince(db, null);
assert.equal(rows[0].caughtAt, stamp(19));
assert.equal(rows[0].catchPhotoUid, "photo");
assert.equal(rows[0].caughtTideTrend, "up");
const legacy = { ...fish, updatedAt: stamp(21) };
delete legacy.caughtAt; delete legacy.catchPhotoUid; delete legacy.caughtTideTrend;
await upsertFish(db, legacy);
rows = await fetchFishSince(db, stamp(20));
assert.equal(rows[0].caughtAt, stamp(19));
await upsertPhoto(db, { ...base, updatedAt: stamp(21), uid: "photo", photoType: "image/jpeg", order: 0, isCover: 1 });
assert.equal((await fetchPhotosSince(db, null))[0].role, "catch");
await upsertFish(db, { ...fish, updatedAt: stamp(22), caughtAt: null, catchPhotoUid: null, caughtTideTrend: null });
await upsertFish(db, fish); // 古いリトライでクリア済みの値を戻さない。
assert.equal((await fetchFishSince(db, null))[0].caughtAt, null);
assert.equal((await fetchFishSince(db, null))[0].catchPhotoUid, null);
console.log("PASS: additive schema, sync round-trip, legacy writes, clearing and stale retry");
sql.close();
