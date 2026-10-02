import type { FishingPoint } from "../points";
import type { MarineWaveHour } from "./marineWave";

export type WaveAssessment = {
  hour: number;
  height: number;
  period: number | null;
  level: number;
  periodLevel: number;
  label: string;
  reason: string;
};

/** 釣り場での波の負担を表すアプリ用目安。公的な警報基準ではない。 */
export function assessWave(point: FishingPoint, row: MarineWaveHour): WaveAssessment {
  const height = row.waveHeight;
  const period = row.wavePeriod != null && Number.isFinite(row.wavePeriod) && row.wavePeriod > 0
    ? row.wavePeriod : null;
  let heightLevel = 0;
  if (point.waveExposure === "open") {
    heightLevel = height >= 2 ? 3 : height >= 1.5 ? 2 : height >= 1 ? 1 : 0;
  } else if (point.waveExposure === "sheltered") {
    heightLevel = height >= 4 ? 4 : height >= 3.2 ? 3 : height >= 2.5 ? 2 : height >= 1.8 ? 1 : 0;
  }

  // 開放サーフだけ周期を加味。1m未満は周期で負担評価を引き上げない。
  // 必ず同じ時刻の波高と周期を組み合わせ、周期だけで危険判定にしない。
  const periodLevel = point.waveExposure !== "open" || period == null ? 0
    : height >= 1 && period >= 12 ? 2
    : height >= 1 && period >= 9 ? 1 : 0;
  const level = Math.max(heightLevel, periodLevel);
  const hasSwellPeriod = point.waveExposure === "open" && period != null && period >= 9;
  const label = level >= 4 ? "危険な高波"
    : level === 3 ? (point.waveExposure === "open" ? "高波・厳しい" : "高波")
    : level === 2 ? (periodLevel > heightLevel ? "うねり強め" : point.waveExposure === "open" ? "波高め・釣りづらい" : "波高め")
    : level === 1 ? (periodLevel > 0 ? "うねりに注意" : "波あり・注意")
    : point.waveExposure === "none" ? "対象外"
    : point.waveExposure === "open" && period == null ? "波低め・周期不明"
    : "快適";
  const reason = point.waveExposure === "none" ? "河川のため沿岸波浪は対象外"
    : point.waveExposure === "sheltered" ? "港内想定・外海の周期だけでは評価を下げない"
    : period == null ? "周期未取得・うねりの影響は評価できません"
    : periodLevel >= 2 ? "波高と長周期が重なり、岸際の押し引きが強まる可能性"
    : periodLevel === 1 ? "周期9秒以上・波高もあり、岸際の押し引きに注意"
    : hasSwellPeriod ? "うねりの周期だが波高1m未満・周期による評価引き上げなし"
    : level > 0 ? "波高による釣りの負担あり"
    : "波高・周期からみた波の負担は小さめ";
  return { hour: row.hour, height, period, level, periodLevel, label, reason };
}
