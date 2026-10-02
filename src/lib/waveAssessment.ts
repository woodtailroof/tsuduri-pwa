import type { FishingPoint } from "../points";
import type { MarineWaveHour } from "./marineWave";

export type WaveAssessment = {
  hour: number;
  height: number;
  period: number | null;
  periodBand: number | null;
  periodLabel: string;
  level: number;
  periodLevel: number;
  periodPenalty: number;
  label: string;
  reason: string;
};

/** 釣り場での波の負担を表すアプリ用目安。公的な警報基準ではない。 */
export function assessWave(point: FishingPoint, row: MarineWaveHour): WaveAssessment {
  const height = row.waveHeight;
  const period = row.wavePeriod != null && Number.isFinite(row.wavePeriod) && row.wavePeriod > 0
    ? row.wavePeriod : null;
  const periodBand = period == null ? null
    : period < 6 ? 0 : period < 8 ? 1 : period < 10 ? 2 : period < 12 ? 3 : 4;
  const periodLabel = periodBand == null ? "周期不明"
    : ["短周期", "周期やや長め", "うねりあり", "長周期", "かなり長周期"][periodBand];

  let heightLevel = 0;
  if (point.waveExposure === "open") {
    heightLevel = height >= 2 ? 3 : height >= 1.5 ? 2 : height >= 1 ? 1 : 0;
  } else if (point.waveExposure === "sheltered") {
    heightLevel = height >= 4 ? 4 : height >= 3.2 ? 3 : height >= 2.5 ? 2 : height >= 1.8 ? 1 : 0;
  }

  // 同時刻の波高と周期を組み合わせる。1m未満と港内・河川は周期で負担を上げない。
  const applyPeriod = point.waveExposure === "open" && height >= 1 && periodBand != null;
  const periodLevel = !applyPeriod ? 0
    : height >= 1.5 && periodBand === 4 ? 3
    : periodBand >= 3 ? 2
    : periodBand >= 2 ? 1 : 0;
  const level = Math.max(heightLevel, periodLevel);
  // 同じ色の範囲でも、周期の5段階と波高の大きさに応じて負担スコアを変える。
  const periodPenalty = applyPeriod
    ? Math.round([0, 3, 8, 15, 22][periodBand] * (height >= 2 ? 1.6 : height >= 1.5 ? 1.3 : 1))
    : 0;

  let label: string;
  if (point.waveExposure === "none") {
    label = "対象外";
  } else if (point.waveExposure === "sheltered") {
    label = level >= 4 ? "危険な高波" : level === 3 ? "高波"
      : level === 2 ? "波高め" : level === 1 ? "波あり・注意" : "快適";
  } else if (height < 1) {
    label = period == null ? "波低め・周期不明" : "快適";
  } else if (height >= 2) {
    label = periodBand == null || periodBand < 2 ? "高波・厳しい"
      : periodBand === 2 ? "高波＋うねり"
      : periodBand === 3 ? "高波＋長周期" : "高波＋強い長周期";
  } else if (height >= 1.5) {
    label = periodBand == null || periodBand < 2 ? "波高め・釣りづらい"
      : periodBand === 2 ? "波高＋うねり"
      : periodBand === 3 ? "波高＋長周期" : "強いうねりに警戒";
  } else {
    label = periodBand == null || periodBand < 2 ? "波あり・注意"
      : periodBand === 2 ? "うねりに注意"
      : periodBand === 3 ? "押し引き強めの可能性" : "うねりの負担大";
  }

  const reason = point.waveExposure === "none" ? "河川のため沿岸波浪は対象外"
    : point.waveExposure === "sheltered" ? "港内想定・外海の周期だけでは評価を下げない"
    : periodBand == null ? "周期未取得・うねりの影響は評価できません"
    : height < 1 ? (periodBand >= 2 ? "波高1m未満・うねりの特徴を表示" : "波高1m未満・波の負担は小さめ")
    : periodBand === 4 ? "波高とかなり長い周期が重なり、岸際の押し引きに警戒"
    : periodBand === 3 ? "波高と長周期が重なり、岸際の押し引きが強まる可能性"
    : periodBand === 2 ? "波高もあり、うねりの押し引きに注意"
    : periodBand === 1 ? "周期6〜8秒・波高に応じて押し引きの負担を加味"
    : "短周期・波高による負担を評価";
  return { hour: row.hour, height, period, periodBand, periodLabel, level, periodLevel, periodPenalty, label, reason };
}
