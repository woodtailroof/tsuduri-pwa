// Run: node scripts/test-wave-assessment.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", "require", code)(mod.exports, mod, (name) =>
    load(path.resolve(path.dirname(filename), `${name}.ts`)));
  cache.set(filename, mod.exports);
  return mod.exports;
}

const { buildFishingForecast } = load("src/lib/fishingForecast.ts");
const { FISHING_POINTS } = load("src/points.ts");
const { decideWeatherEmotion } = load("src/lib/emotionDeciders/weatherEmotion.ts");
const open = FISHING_POINTS.find((p) => p.id === "oohama");
const port = FISHING_POINTS.find((p) => p.id === "mochimune-port");
const river = FISHING_POINTS.find((p) => p.id === "tomoe");
const row = (height, period, hour = 9) => ({ hour, waveHeight: height, wavePeriod: period, swellWaveHeight: null });
function forecast(rows, point = open, coastalWave = null) {
  return buildFishingForecast({
    point, selectedHour: 9, weather: [{ windSpeed: 2.4, windDirection: 90, precipitation: 0, weatherCode: 2 }],
    tideSeries: [], tideName: "若潮", marineWaveHours: rows, coastalWave,
  });
}
const cases = [
  [0.5, 6, "good", "快適"],
  [0.5, 10, "good", "低波高・長周期"],
  [0.49, 12, "good", "低波高・長周期"],
  [0.5, 12, "caution", "うねりに注意"],
  [0.69, 10, "good", "低波高・長周期"],
  [0.7, 10, "caution", "うねりに注意"],
  [0.8, 10, "caution", "うねりに注意"],
  [0.9, 6, "caution", "波あり・注意"],
  [1.19, 12, "caution", "うねりに注意"],
  [1.2, 12, "hard", "うねり強め"],
  [1.6, 6, "hard", "波高め"],
  [2, 6, "danger", "高波"],
  [2.5, 6, "stop", "危険な高波"],
  [3, 6, "stop", "危険な高波"],
  [0.5, null, "caution", "波低め・周期不明"],
  [0.5, 0, "caution", "波低め・周期不明"],
];
for (const [height, period, tone, label] of cases) {
  const badge = forecast([row(height, period)]).conditions.wave;
  assert.equal(badge.tone, tone, `${height}m/${period}s tone`);
  assert.equal(badge.label, label, `${height}m/${period}s label`);
}
assert.equal(forecast([row(1.2, 20)], port).conditions.wave.tone, "good");
assert.equal(forecast([row(4, 6)], port).conditions.wave.tone, "stop");
assert.equal(forecast([row(3, 20)], river).conditions.wave.label, "対象外");
// Separate maxima must not fabricate a 1.2m/12s combination.
assert.equal(forecast([row(1.2, 6), row(0.2, 12, 12)]).conditions.wave.tone, "caution");
const nearby = forecast([row(1.2, 12, 6), row(0.5, 6)]);
assert.equal(nearby.conditions.wave.tone, "hard");
assert.ok(nearby.conditions.wave.basis.some((s) => s.includes("06時 1.2m・12.0秒")));
assert.equal(forecast([row(0.5, 6), row(3, 20, 13)]).conditions.wave.tone, "good");
assert.equal(forecast([row(0.5, 6, 20)]).conditions.wave.label, "未取得");
assert.equal(forecast([row(NaN, 6), row(-1, 6)]).conditions.wave.label, "未取得");
const regional = { maxHeight: 2, minHeight: 1.5, hasSwell: false };
assert.equal(forecast([row(0.5, 6)], open, regional).conditions.wave.tone, "good");
const calm = forecast([row(0.8, 6)]);
const long = forecast([row(0.8, 10)]);
assert.ok(long.comfort.score < calm.comfort.score);
assert.equal(long.safety.tone, "caution");
assert.equal(decideWeatherEmotion({ conditions: calm.conditions }), "happy");
assert.equal(decideWeatherEmotion({ conditions: long.conditions }), "think");
assert.equal(decideWeatherEmotion({ conditions: forecast([row(3, 6)]).conditions }), "surprise");
console.log("PASS: wave/period boundaries, paired time windows, port/river, missing data, regional differences, comfort and emotions");
