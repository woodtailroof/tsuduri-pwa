// Run: TZ=Asia/Tokyo node scripts/test-runoff-risk.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map();
function load(file){
 const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('exports','module','require',code)(mod.exports,mod,n=>load(path.resolve(path.dirname(filename),n+'.ts')));cache.set(filename,mod.exports);return mod.exports;
}
const {RUNOFF_PROFILES}=load('src/lib/runoffProfiles.ts');
const {assessRunoff,rainMetrics,runoffHint}=load('src/lib/runoffRisk.ts');
const {parseRainResponse,nullableNumber,selectedJstTime,getRainHistory}=load('src/lib/rainHistory.ts');
const {buildFishingForecast}=load('src/lib/fishingForecast.ts');
const {FISHING_POINTS}=load('src/points.ts');
const {parseForecast}=load('src/lib/marineWave.ts');
const H=3600000,T=Date.parse('2026-11-26T15:00:00+09:00');
function history(pointId='oohama',wetAt=T-12*H,amount=30){
 return RUNOFF_PROFILES[pointId].sites.map(site=>({site,gridLat:site.lat,gridLon:site.lon,fetchedAt:T,stale:false,hours:Array.from({length:241},(_,i)=>{const at=T-(240-i)*H;return {at,rain:at===wetAt?amount:0,windSpeed:0,windDirection:0}})}));
}
assert.equal(nullableNumber(null),null);assert.equal(nullableNumber(''),null);assert.equal(nullableNumber('0'),null);assert.equal(nullableNumber(0),0);
assert.equal(selectedJstTime('2026-11-26',15),T);
const raw={latitude:1,longitude:2,hourly:{time:[T/1000,(T-H)/1000],precipitation:[null,0],wind_speed_10m:[null,2]}};
const parsed=parseRainResponse(raw,RUNOFF_PROFILES.oohama.sites[0],T);assert.equal(parsed.hours[0].rain,null);assert.equal(parsed.hours[1].rain,0);
const clear=history('oohama',T-12*H,0);
assert.equal(assessRunoff('oohama',T,clear).debrisLevel,0);
assert.equal(assessRunoff('oohama',T,clear,[{at:T,waveHeight:1.8,wavePeriod:10}]).comfortPenalty,0); // 波だけでゴミ減点しない
const recent=assessRunoff('oohama',T,history());
const old=assessRunoff('oohama',T,history('oohama',T-70*H));
assert.ok(recent.debrisLevel>old.debrisLevel);assert.ok(recent.comfortPenalty>0);
assert.ok(recent.metrics.every(m=>m.dryBeforeHours>=72));
const wetBefore=history();for(const d of wetBefore)for(const h of d.hours)if(h.at===T-24*H)h.rain=1;
assert.ok(assessRunoff('oohama',T,wetBefore).metrics.every(m=>m.dryBeforeHours<72));
const upstream=history();upstream[0].hours.forEach(h=>h.rain=0);
assert.ok(assessRunoff('oohama',T,upstream).debrisLevel>=2);
const missing=history();missing[1].hours.find(h=>h.at===T-100*H).rain=null;
assert.equal(assessRunoff('oohama',T,missing).status,'unknown');assert.equal(assessRunoff('oohama',T,missing).comfortPenalty,0);
assert.equal(assessRunoff('oohama',T,[]).status,'unknown');
const stale=history();stale[0].stale=true;assert.equal(assessRunoff('oohama',T,stale).comfortPenalty,0);
// 対象時刻より後の雨を混ぜない。日付指定では現在時刻でなく選択時刻を基準にする。
assert.equal(assessRunoff('oohama',T-24*H,history()).debrisLevel,0);
const future=history();future.forEach(d=>d.fetchedAt=T-24*H);assert.ok(assessRunoff('oohama',T,future).metrics.every(m=>m.forecastHours72===24));
assert.ok(runoffHint(assessRunoff('oohama',T,future)).includes('予報降雨を含む'));
const m=rainMetrics(history()[0],T);assert.equal(m.rain24,30);assert.equal(m.rain72,30);assert.equal(m.lastRainHours,12);
const edge=history('oohama',T-24*H,30);assert.equal(rainMetrics(edge[0],T).rain24,0);assert.equal(rainMetrics(edge[0],T).rain48,30);
const duplicated=history();duplicated.forEach(d=>d.hours.push({...d.hours.at(-1)}));assert.equal(assessRunoff('oohama',T,duplicated).debrisLevel,recent.debrisLevel);
// 同一格子・複数代表点は加算しない。
const one=history();const allSame=one.map(d=>({...d,gridLat:1,gridLon:1}));assert.equal(assessRunoff('oohama',T,allSame).comfortPenalty,recent.comfortPenalty);
const daily={hourly:{time:['2026-11-25T15:00','2026-11-26T15:00','2026-11-26T16:00'],wave_height:[1.2,null,1.3],wave_period:[6,6,null],swell_wave_height:[.6,null,.6]}};
const marine=parseForecast(daily,'2026-11-26');assert.equal(marine.hours.length,1);assert.equal(marine.history.length,2);assert.equal(marine.hours[0].wavePeriod,null);
const base={point:FISHING_POINTS.find(p=>p.id==='oohama'),selectedHour:15,weather:[{windSpeed:0,windDirection:0,precipitation:0,weatherCode:0}],tideSeries:[],tideName:null,marineWaveHours:[{hour:15,waveHeight:1.2,wavePeriod:6,swellWaveHeight:null}]};
const normal=buildFishingForecast(base),risk=buildFishingForecast({...base,runoffRisk:recent});
assert.equal(normal.comfort.label,'釣りづらい');assert.ok(risk.comfort.score<normal.comfort.score);assert.deepEqual(risk.safety,normal.safety);assert.deepEqual(risk.bite,normal.bite);
for(const id of Object.keys(RUNOFF_PROFILES))assert.equal(assessRunoff(id,T,history(id)).status,'ok');
assert.notEqual(assessRunoff('oohama',T,history('oohama',T-12*H,20)).comfortPenalty,assessRunoff('fishuna',T,history('fishuna',T-12*H,20)).comfortPenalty);
// APIの複数地点取得、同時リクエスト合流、オフラインキャッシュをモックで検証。
const originalNow=Date.now;Date.now=()=>T;
let calls=0;global.localStorage={getItem(){return null},setItem(){},removeItem(){}};
global.fetch=async url=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('timeformat'),'unixtime');assert.equal(u.searchParams.get('past_days'),'10');assert.equal(u.searchParams.get('forecast_days'),'1');return {ok:true,json:async()=>RUNOFF_PROFILES.oohama.sites.map(()=>raw)}};
const [a,b]=await Promise.all([getRainHistory('oohama','2026-11-26'),getRainHistory('oohama','2026-11-26')]);assert.equal(calls,1);assert.equal(a.length,3);assert.deepEqual(a,b);
assert.equal((await getRainHistory('oohama','2026-11-26',false)).length,3);
await assert.rejects(getRainHistory('tomoe','2026-11-25',false));
global.fetch=async()=>{throw Error('network')};await assert.rejects(getRainHistory('fishuna','2026-11-25'));
// チャット側も共通の雨・波判定を使い、片方の取得失敗でも返答材料を返す。
const {fishingConditionsHint}=load('src/lib/fishingConditionsHint.ts');
global.fetch=async url=>{
 const u=new URL(url);
 if(u.hostname.startsWith('marine-api')) return {ok:true,text:async()=>JSON.stringify({hourly:{time:['2026-11-26T15:00'],wave_height:[1.2],wave_period:[6],swell_wave_height:[.5]}})};
 const id=u.searchParams.get('latitude').split(',').length===3?'oohama':'tomoe';
 return {ok:true,json:async()=>history(id).map(d=>({hourly:{time:d.hours.map(h=>h.at/1000),precipitation:d.hours.map(h=>h.rain),wind_speed_10m:d.hours.map(h=>h.windSpeed),wind_direction_10m:d.hours.map(h=>h.windDirection)}}))};
};
const chatHint=await fishingConditionsHint('tomoe',T);
assert.ok(chatHint.includes('巴川'));assert.ok(chatHint.includes('実測ではない'));assert.ok(chatHint.includes('波の操作性'));assert.ok(chatHint.includes('対象外'));
global.fetch=async()=>{throw Error('network')};
const failedHint=await fishingConditionsHint('fishuna',T);
assert.ok(failedHint.includes('降雨影響は不明'));assert.ok(failedHint.includes('未取得'));
Date.now=originalNow;
console.log('PASS: rainfall windows, decay, upstream-only rain, dry-period boost, missing/stale data, no future leakage, per-point rules, wave separation, forecast integration and API/cache fallback');
