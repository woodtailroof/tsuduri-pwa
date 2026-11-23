// Run: TZ=Asia/Tokyo node scripts/test-trip-history-timeline.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(filename) {
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  new Function('exports','module','require',code)(mod.exports,mod,name=>load(path.resolve(path.dirname(filename),`${name}.ts`)));
  return mod.exports;
}
const { historyTimeline,localDay,durationLabel } = load(path.join(root,'src/lib/tripHistoryTimeline.ts'));
const { actualCatchConditions } = load(path.join(root,'src/lib/tripTimeline.ts'));
const trip={startedAt:'2026-11-22T22:30:00+09:00',endedAt:'2026-11-23T02:00:00+09:00',timeBand:'night',tideTrend:'up'};
const fish=[{uid:'f1',caughtAt:'2026-11-23T00:15:00+09:00',caughtTideTrend:'down',catchPhotoUid:'photo1'},{uid:'f2',caughtAt:null,caughtTideTrend:'up'}];
const photos=[{uid:'end1',role:'end',capturedAt:trip.endedAt},{uid:'end2',role:'end',capturedAt:'2026-11-23T01:00:00+09:00'},{uid:'photo1',role:'catch',capturedAt:fish[0].caughtAt}];
const result=historyTimeline(trip,fish,photos);
assert.equal(result.duration,210);
assert.equal(result.firstCatchMinutes,105);
assert.equal(result.unknownCatches,1);
assert.deepEqual(result.days.map(localDay),['2026-11-22','2026-11-23']);
assert.deepEqual(result.events.filter(e=>e.at).map(e=>e.role),['start','catch','end']);
assert.equal(result.events.find(e=>e.role==='catch').photo.uid,'photo1');
assert.equal(result.events.find(e=>e.role==='end').photo.uid,'end1');
assert.equal(historyTimeline({...trip,timeBand:'unknown'},fish,photos).duration,null);
assert.equal(historyTimeline({...trip,endedAt:undefined},fish,photos).duration,null);
assert.equal(historyTimeline({...trip,endedAt:'2026-11-22T20:00:00+09:00'},fish,photos).duration,null);
assert.equal(historyTimeline(trip,[{caughtAt:'2026-11-22T10:00:00+09:00'}],[]).firstCatchMinutes,null);
assert.equal(durationLabel(210),'3時間30分');
assert.equal(durationLabel(null),'未記録');
// 開始は上げ、翌日の釣果は下げ。魚の条件には開始時刻の情報を渡さない。
assert.deepEqual(actualCatchConditions(fish[0]),{timeBand:'night',tideTrend:'down'});
assert.deepEqual(actualCatchConditions(fish[1]),{timeBand:'unknown',tideTrend:'unknown'});
assert.equal(actualCatchConditions({caughtAt:'invalid',caughtTideTrend:'up'}).tideTrend,'unknown');
assert.equal(actualCatchConditions({caughtAt:fish[0].caughtAt,caughtTideTrend:'unknown'}).tideTrend,'unknown');
console.log('PASS: overnight timeline, durations, photo links, missing times and actual catch tide independent of start tide');
