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
  reasons: string[];
  marineSummary: {
    waveHeight: number | null;
    wavePeriod: number | null;
    waveDirection: number | null;
    swellHeight: number | null;
    swellPeriod: number | null;
    seaSurfaceTemperature: number | null;
  };
};

type WeatherLike = {
  windSpeed: number;
  rainProb: number;
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
    if (waveHeight >= 1.5) return 4;
    if (waveHeight >= 1.2) return 3;
    if (waveHeight >= 0.8) return 2;
    if (waveHeight >= 0.5) return 1;
    return 0;
  }
  if (point.waveExposure === "partial") {
    if (waveHeight >= 2.0) return 4;
    if (waveHeight >= 1.5) return 3;
    if (waveHeight >= 1.0) return 2;
    if (waveHeight >= 0.7) return 1;
    return 0;
  }
  if (point.waveExposure === "sheltered") {
    if (waveHeight >= 3.0) return 4;
    if (waveHeight >= 2.2) return 3;
    if (waveHeight >= 1.5) return 2;
    if (waveHeight >= 1.0) return 1;
    return 0;
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
  const rainMax = weather.length
    ? Math.max(...weather.map((row) => row.rainProb))
    : null;

  const reasons: string[] = [];
  let safetyLevel = 0;

  if (point.waveExposure === "none") {
    reasons.push("海の波浪判定対象外");
  } else if (waveHeight == null) {
    safetyLevel = 1;
    reasons.push("波浪データ不足");
  } else {
    safetyLevel = safetyLevelForHeight(point, waveHeight);
    let waveRiskAdjustment = false;

    if (swellPeriod != null && swellPeriod >= 13 && waveHeight >= 0.7) {
      waveRiskAdjustment = true;
      reasons.push(`長周期うねり ${swellPeriod.toFixed(1)}秒`);
    } else if (
      (swellPeriod != null && swellPeriod >= 11 && waveHeight >= 0.8) ||
      (wavePeriod != null && wavePeriod >= 9 && waveHeight >= 0.8)
    ) {
      waveRiskAdjustment = true;
      reasons.push(
        `周期長め ${Math.max(swellPeriod ?? 0, wavePeriod ?? 0).toFixed(1)}秒`,
      );
    }

    if (
      point.seaFacingDeg != null &&
      waveDirection != null &&
      waveHeight >= 0.7 &&
      angularDistance(point.seaFacingDeg, waveDirection) <= 45
    ) {
      waveRiskAdjustment = true;
      reasons.push("正面寄りの波向");
    }

    // 周期と波向は同じ「沖波の岸への効き方」の補正なので重ね掛けしない。
    if (waveRiskAdjustment) safetyLevel += 1;
  }

  if (windMax != null && windMax >= 10) {
    safetyLevel = Math.max(safetyLevel, 4);
    reasons.push(`強風 ${windMax.toFixed(1)}m/s`);
  } else if (windMax != null && windMax >= 8) {
    safetyLevel = Math.max(safetyLevel, 3);
    reasons.push(`風強め ${windMax.toFixed(1)}m/s`);
  } else if (windMax != null && windMax >= 6) {
    safetyLevel = Math.max(safetyLevel, 2);
    reasons.push(`やや強風 ${windMax.toFixed(1)}m/s`);
  }

  safetyLevel = clamp(safetyLevel, 0, 4);
  const waveDetail =
    point.waveExposure === "none"
      ? "海況は判定しません"
      : waveHeight == null
        ? "波浪データなし"
        : `前後3時間 最大${waveHeight.toFixed(1)}m`;
  const safety = safetyBadge(safetyLevel, waveDetail);

  let comfortScore = 100;
  if (windMax != null) comfortScore -= Math.max(0, windMax - 3) * 8;
  if (rainMax != null) comfortScore -= rainMax * 0.18;
  if (point.waveExposure !== "none" && waveHeight != null) {
    const exposureWeight =
      point.waveExposure === "open"
        ? 34
        : point.waveExposure === "partial"
          ? 24
          : 10;
    comfortScore -= Math.max(0, waveHeight - 0.35) * exposureWeight;
  }
  comfortScore = clamp(Math.round(comfortScore), 0, 100);

  const comfort: ForecastBadge =
    comfortScore >= 75
      ? {
          label: "快適",
          detail: `条件指数 ${comfortScore}`,
          tone: "good",
          score: comfortScore,
        }
      : comfortScore >= 50
        ? {
            label: "やや難",
            detail: `条件指数 ${comfortScore}`,
            tone: "caution",
            score: comfortScore,
          }
        : {
            label: "厳しい",
            detail: `条件指数 ${comfortScore}`,
            tone: "hard",
            score: comfortScore,
          };

  let biteScore = 50;
  const movement = tideMovement(tideSeries, selectedHour);
  if (movement != null) {
    if (movement >= 10) biteScore += 14;
    else if (movement >= 5) biteScore += 8;
    else if (movement < 2) biteScore -= 8;
  }
  if (selectedHour >= 5 && selectedHour <= 8) biteScore += 14;
  else if (selectedHour >= 16 && selectedHour <= 19) biteScore += 14;
  else if (selectedHour >= 20 || selectedHour <= 3) biteScore += 4;

  if (windMax != null) {
    if (windMax >= 8) biteScore -= 18;
    else if (windMax >= 6) biteScore -= 8;
    else if (windMax >= 1.5 && windMax <= 5) biteScore += 6;
  }
  if (rainMax != null && rainMax >= 70) biteScore -= 8;
  if (tideName?.includes("大潮") || tideName?.includes("中潮")) biteScore += 5;
  if (tideName?.includes("長潮") || tideName?.includes("若潮")) biteScore -= 4;
  if (
    point.waveExposure === "open" &&
    waveHeight != null &&
    waveHeight >= 0.3 &&
    waveHeight <= 0.8
  ) {
    biteScore += 5;
  }
  biteScore = clamp(Math.round(biteScore), 0, 100);

  const bite: ForecastBadge =
    biteScore >= 70
      ? {
          label: "狙い目",
          detail: `予報条件指数 ${biteScore}`,
          tone: "good",
          score: biteScore,
        }
      : biteScore >= 45
        ? {
            label: "ふつう",
            detail: `予報条件指数 ${biteScore}`,
            tone: "caution",
            score: biteScore,
          }
        : {
            label: "期待薄",
            detail: `予報条件指数 ${biteScore}`,
            tone: "hard",
            score: biteScore,
          };

  if (!reasons.length) reasons.push("大きな阻害要因なし");

  return {
    safety,
    comfort,
    bite,
    reasons,
    marineSummary: {
      waveHeight,
      wavePeriod,
      waveDirection,
      swellHeight,
      swellPeriod,
      seaSurfaceTemperature,
    },
  };
}
