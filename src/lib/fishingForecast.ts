import type { TidePoint } from "../db";
import type { FishingPoint } from "../points";
import type { MarineHour } from "./marineWeather";

export type ForecastTone = "good" | "caution" | "hard" | "danger" | "stop";

export type ForecastBadge = {
  label: string;
  detail: string;
  tone: ForecastTone;
  score?: number;
};

export type FishingForecast = {
  safety: ForecastBadge;
  comfort: ForecastBadge;
  bite: ForecastBadge;
  marineSummary: {
    waveHeight: number | null;
    wavePeriod: number | null;
    waveDirection: number | null;
    swellHeight: number | null;
    swellPeriod: number | null;
    seaSurfaceTemperature: number | null;
    impactLabel: string;
    impactDetail: string;
  };
};

type WeatherLike = {
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  weatherCode: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function maxFinite(
  rows: MarineHour[],
  pick: (row: MarineHour) => number | null,
): number | null {
  const values = rows.map(pick).filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : null;
}

function meanFinite(
  rows: MarineHour[],
  pick: (row: MarineHour) => number | null,
): number | null {
  const values = rows.map(pick).filter((v): v is number => v != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function angularDistance(a: number, b: number) {
  const diff = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(diff, 360 - diff);
}

function nearestDirection(
  rows: MarineHour[],
  selectedHour: number,
): number | null {
  const candidates = rows
    .filter((row) => row.waveDirection != null)
    .sort(
      (a, b) =>
        Math.abs(a.hour - selectedHour) - Math.abs(b.hour - selectedHour),
    );
  return candidates[0]?.waveDirection ?? null;
}

function tideMovement(series: TidePoint[], selectedHour: number) {
  const points = series
    .map((point) => {
      if (!point.time) return null;
      const [hour, minute] = point.time.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
      return { minutes: hour * 60 + minute, cm: point.cm };
    })
    .filter((value): value is { minutes: number; cm: number } => !!value)
    .sort((a, b) => a.minutes - b.minutes);

  if (points.length < 2) return null;
  const target = selectedHour * 60;
  const before = [...points]
    .reverse()
    .find((point) => point.minutes <= target - 60);
  const after = points.find((point) => point.minutes >= target + 60);
  if (!before || !after) return null;
  const hours = (after.minutes - before.minutes) / 60;
  if (hours <= 0) return null;
  return Math.abs(after.cm - before.cm) / hours;
}

function safetyLevelForHeight(point: FishingPoint, waveHeight: number) {
  if (point.waveExposure === "open") {
    if (waveHeight >= 2.5) return 4;
    if (waveHeight >= 2.0) return 3;
    if (waveHeight >= 1.6) return 2;
    if (waveHeight >= 0.9) return 1;
    return 0;
  }
  if (point.waveExposure === "sheltered") {
    if (waveHeight >= 4.0) return 4;
    if (waveHeight >= 3.2) return 3;
    if (waveHeight >= 2.5) return 2;
    if (waveHeight >= 1.8) return 1;
  }
  return 0;
}

function safetyBadge(level: number, detail: string): ForecastBadge {
  if (level >= 4) return { label: "釣行不可", detail, tone: "stop" };
  if (level === 3) return { label: "非推奨", detail, tone: "danger" };
  if (level === 2) return { label: "厳しい", detail, tone: "hard" };
  if (level === 1) return { label: "注意", detail, tone: "caution" };
  return { label: "良好", detail, tone: "good" };
}

function strongestReason(reasons: { level: number; text: string }[], fallback: string) {
  return [...reasons].sort((a, b) => b.level - a.level)[0]?.text ?? fallback;
}

export function buildFishingForecast(input: {
  point: FishingPoint;
  selectedHour: number;
  marine: MarineHour[];
  weather: WeatherLike[];
  tideSeries: TidePoint[];
  tideName: string | null;
}): FishingForecast {
  const { point, selectedHour, marine, weather, tideSeries, tideName } = input;

  const waveHeight = maxFinite(marine, (row) => row.waveHeight);
  const wavePeriod = maxFinite(marine, (row) => row.wavePeriod);
  const waveDirection = nearestDirection(marine, selectedHour);
  const swellHeight = maxFinite(marine, (row) => row.swellHeight);
  const swellPeriod = maxFinite(marine, (row) => row.swellPeriod);
  const seaSurfaceTemperature = meanFinite(
    marine,
    (row) => row.seaSurfaceTemperature,
  );
  const windMax = weather.length
    ? Math.max(...weather.map((row) => row.windSpeed))
    : null;
  const precipitationMax = weather.length
    ? Math.max(...weather.map((row) => row.precipitation))
    : null;

  const safetyReasons: { level: number; text: string }[] = [];
  let safetyLevel = 0;

  if (point.waveExposure === "none") {
    safetyReasons.push({ level: 0, text: "沖波は判定対象外" });
  } else if (waveHeight == null) {
    safetyLevel = 1;
    safetyReasons.push({ level: 1, text: "沖波データ不足のため注意" });
  } else {
    safetyLevel = safetyLevelForHeight(point, waveHeight);
    if (safetyLevel > 0) {
      safetyReasons.push({
        level: safetyLevel,
        text: `沖波${waveHeight.toFixed(1)}m・影響${point.waveImpactLabel}`,
      });
    }

    let waveRiskAdjustment = false;
    if (swellPeriod != null && swellPeriod >= 14 && waveHeight >= 1.0) {
      waveRiskAdjustment = true;
      safetyReasons.push({
        level: Math.max(1, safetyLevel + 1),
        text: `長周期うねり${swellPeriod.toFixed(1)}秒`,
      });
    } else if (
      (swellPeriod != null && swellPeriod >= 12 && waveHeight >= 1.2) ||
      (wavePeriod != null && wavePeriod >= 11 && waveHeight >= 1.2)
    ) {
      waveRiskAdjustment = true;
      safetyReasons.push({
        level: Math.max(1, safetyLevel + 1),
        text: `周期長め${Math.max(swellPeriod ?? 0, wavePeriod ?? 0).toFixed(1)}秒`,
      });
    }

    if (
      point.waveExposure === "open" &&
      point.seaFacingDeg != null &&
      waveDirection != null &&
      waveHeight >= 1.8 &&
      angularDistance(point.seaFacingDeg, waveDirection) <= 35
    ) {
      waveRiskAdjustment = true;
      safetyReasons.push({
        level: Math.max(1, safetyLevel + 1),
        text: "正面寄りの波向",
      });
    }

    if (waveRiskAdjustment) safetyLevel += 1;
  }

  if (windMax != null && windMax >= 12) {
    safetyLevel = Math.max(safetyLevel, 4);
    safetyReasons.push({ level: 4, text: `強風${windMax.toFixed(1)}m/s` });
  } else if (windMax != null && windMax >= 10) {
    safetyLevel = Math.max(safetyLevel, 3);
    safetyReasons.push({ level: 3, text: `風強め${windMax.toFixed(1)}m/s` });
  } else if (windMax != null && windMax >= 8) {
    safetyLevel = Math.max(safetyLevel, 2);
    safetyReasons.push({ level: 2, text: `やや強風${windMax.toFixed(1)}m/s` });
  } else if (windMax != null && windMax >= 6) {
    safetyLevel = Math.max(safetyLevel, 1);
    safetyReasons.push({ level: 1, text: `風${windMax.toFixed(1)}m/sに注意` });
  }

  if (precipitationMax != null && precipitationMax >= 10) {
    safetyLevel = Math.max(safetyLevel, point.waterKind === "river" ? 3 : 2);
    safetyReasons.push({
      level: point.waterKind === "river" ? 3 : 2,
      text: `強い雨${precipitationMax.toFixed(1)}mm/h`,
    });
  } else if (precipitationMax != null && precipitationMax >= 5) {
    safetyLevel = Math.max(safetyLevel, point.waterKind === "river" ? 2 : 1);
    safetyReasons.push({
      level: point.waterKind === "river" ? 2 : 1,
      text: `雨${precipitationMax.toFixed(1)}mm/h`,
    });
  } else if (precipitationMax != null && precipitationMax >= 2) {
    safetyLevel = Math.max(safetyLevel, 1);
    safetyReasons.push({ level: 1, text: `雨${precipitationMax.toFixed(1)}mm/h` });
  }

  safetyLevel = clamp(safetyLevel, 0, 4);
  const safetyFallback =
    point.waterKind === "river"
      ? "風雨に大きな問題なし・増水は現地確認"
      : "風雨と地点への波影響に大きな問題なし";
  const safety = safetyBadge(
    safetyLevel,
    strongestReason(safetyReasons, safetyFallback),
  );

  let comfortScore = 100;
  const comfortReasons: { penalty: number; text: string }[] = [];
  if (windMax != null) {
    const penalty = Math.max(0, windMax - 3) * 8;
    comfortScore -= penalty;
    if (penalty >= 8) {
      comfortReasons.push({ penalty, text: `風${windMax.toFixed(1)}m/s` });
    }
  }
  if (precipitationMax != null) {
    const penalty = Math.min(38, precipitationMax * 8);
    comfortScore -= penalty;
    if (penalty >= 4) {
      comfortReasons.push({
        penalty,
        text: `時間雨量${precipitationMax.toFixed(1)}mm`,
      });
    }
  }
  if (point.waveExposure !== "none" && waveHeight != null) {
    const exposureWeight = point.waveExposure === "open" ? 34 : 9;
    const penalty = Math.max(0, waveHeight - 0.35) * exposureWeight;
    comfortScore -= penalty;
    if (penalty >= 6) {
      comfortReasons.push({
        penalty,
        text: `沖波の地点影響${point.waveImpactLabel}`,
      });
    }
  }
  comfortScore = clamp(Math.round(comfortScore), 0, 100);
  const comfortDetail =
    [...comfortReasons].sort((a, b) => b.penalty - a.penalty)[0]?.text ??
    "風雨・波影響とも小さめ";
  const comfort: ForecastBadge =
    comfortScore >= 75
      ? {
          label: "快適",
          detail: comfortDetail,
          tone: "good",
          score: comfortScore,
        }
      : comfortScore >= 50
        ? {
            label: "やや釣りづらい",
            detail: comfortDetail,
            tone: "caution",
            score: comfortScore,
          }
        : {
            label: "釣りづらい",
            detail: comfortDetail,
            tone: "hard",
            score: comfortScore,
          };

  let biteScore = 50;
  const biteGood: { points: number; text: string }[] = [];
  const biteBad: { points: number; text: string }[] = [];
  if (point.tideInfluence !== "none") {
    const movement = tideMovement(tideSeries, selectedHour);
    const tideFactor = point.tideInfluence === "weak" ? 0.5 : 1;
    if (movement != null) {
      if (movement >= 10) {
        const points = Math.round(14 * tideFactor);
        biteScore += points;
        biteGood.push({ points, text: point.tideInfluence === "weak" ? "潮位変化（参考）" : "潮が大きく動く" });
      } else if (movement >= 5) {
        const points = Math.round(8 * tideFactor);
        biteScore += points;
        biteGood.push({ points, text: point.tideInfluence === "weak" ? "潮位変化（参考）" : "潮が動く時間" });
      } else if (movement < 2) {
        const points = Math.round(8 * tideFactor);
        biteScore -= points;
        biteBad.push({ points, text: point.tideInfluence === "weak" ? "潮位変化小さめ（参考）" : "潮の動き小さめ" });
      }
    }
  }

  if (selectedHour >= 5 && selectedHour <= 8) {
    biteScore += 14;
    biteGood.push({ points: 14, text: "朝まずめ" });
  } else if (selectedHour >= 16 && selectedHour <= 19) {
    biteScore += 14;
    biteGood.push({ points: 14, text: "夕まずめ" });
  } else if (selectedHour >= 20 || selectedHour <= 3) {
    biteScore += 4;
    biteGood.push({ points: 4, text: "夜間" });
  }

  if (windMax != null) {
    if (windMax >= 8) {
      biteScore -= 18;
      biteBad.push({ points: 18, text: "強風" });
    } else if (windMax >= 6) {
      biteScore -= 8;
      biteBad.push({ points: 8, text: "風強め" });
    } else if (windMax >= 1.5 && windMax <= 5) {
      biteScore += 6;
      biteGood.push({ points: 6, text: "適度な風" });
    }
  }

  if (precipitationMax != null) {
    if (precipitationMax >= 5) {
      biteScore -= 8;
      biteBad.push({ points: 8, text: "強い雨" });
    } else if (precipitationMax >= 0.1 && precipitationMax <= 1.5) {
      biteScore += 3;
      biteGood.push({ points: 3, text: "弱い雨" });
    }
  }

  if (point.tideInfluence === "normal") {
    if (tideName?.includes("大潮") || tideName?.includes("中潮")) {
      biteScore += 5;
      biteGood.push({ points: 5, text: tideName });
    }
    if (tideName?.includes("長潮") || tideName?.includes("若潮")) {
      biteScore -= 4;
      biteBad.push({ points: 4, text: tideName });
    }
  }

  if (
    point.waveExposure === "open" &&
    waveHeight != null &&
    waveHeight >= 0.3 &&
    waveHeight <= 0.8
  ) {
    biteScore += 5;
    biteGood.push({ points: 5, text: "適度な波気" });
  }
  biteScore = clamp(Math.round(biteScore), 0, 100);

  const bestGood = [...biteGood].sort((a, b) => b.points - a.points)[0]?.text;
  const worstBad = [...biteBad].sort((a, b) => b.points - a.points)[0]?.text;
  const biteDetail =
    biteScore >= 45
      ? bestGood ?? (point.tideInfluence !== "none" ? "目立つ好材料なし" : "時間帯と風雨から判定")
      : worstBad ?? "好材料が少なめ";
  const bite: ForecastBadge =
    biteScore >= 70
      ? {
          label: "狙い目",
          detail: biteDetail,
          tone: "good",
          score: biteScore,
        }
      : biteScore >= 45
        ? {
            label: "ふつう",
            detail: biteDetail,
            tone: "caution",
            score: biteScore,
          }
        : {
            label: "期待薄",
            detail: biteDetail,
            tone: "hard",
            score: biteScore,
          };

  const impactDetail =
    point.waveExposure === "none"
      ? "河川のため沖波を判定に使用しません"
      : waveHeight == null
        ? `${point.waveImpactLabel}・沖波データなし`
        : `${point.waveImpactLabel}・沖波${waveHeight.toFixed(1)}mを地点特性に合わせて評価`;

  return {
    safety,
    comfort,
    bite,
    marineSummary: {
      waveHeight,
      wavePeriod,
      waveDirection,
      swellHeight,
      swellPeriod,
      seaSurfaceTemperature,
      impactLabel: point.waveImpactLabel,
      impactDetail,
    },
  };
}
