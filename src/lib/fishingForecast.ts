import type { TidePoint } from "../db";
import type { FishingPoint } from "../points";
import type { JmaCoastalWave } from "./jmaCoastalWave";

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
  waveSummary: {
    waveHeight: number | null;
    coastalWave: JmaCoastalWave | null;
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
  weather: WeatherLike[];
  tideSeries: TidePoint[];
  tideName: string | null;
  coastalWave?: JmaCoastalWave | null;
}): FishingForecast {
  const {
    point,
    selectedHour,
    weather,
    tideSeries,
    tideName,
    coastalWave = null,
  } = input;

  const waveHeight =
    point.waveExposure === "none" ? null : coastalWave?.maxHeight ?? null;
  const windMax = weather.length
    ? Math.max(...weather.map((row) => row.windSpeed))
    : null;
  const precipitationMax = weather.length
    ? Math.max(...weather.map((row) => row.precipitation))
    : null;

  const safetyReasons: { level: number; text: string }[] = [];
  let safetyLevel = 0;

  if (point.waveExposure === "none") {
    safetyReasons.push({ level: 0, text: "沿岸波浪は判定対象外" });
  } else if (waveHeight == null) {
    safetyLevel = 1;
    safetyReasons.push({ level: 1, text: "気象庁の沿岸波浪が未取得のため注意" });
  } else {
    safetyLevel = safetyLevelForHeight(point, waveHeight);
    if (safetyLevel > 0) {
      safetyReasons.push({
        level: safetyLevel,
        text: `気象庁沿岸予報 最大${waveHeight.toFixed(1)}m${coastalWave?.hasSwell ? "・うねりあり" : ""}`,
      });
    }

    if (
      point.waveExposure === "open" &&
      coastalWave?.hasSwell &&
      waveHeight >= 1.5 &&
      safetyLevel < 4
    ) {
      safetyLevel += 1;
      safetyReasons.push({
        level: safetyLevel,
        text: `気象庁沿岸予報 最大${waveHeight.toFixed(1)}m・うねりあり`,
      });
    }
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
        text: `気象庁沿岸最大${waveHeight.toFixed(1)}m・影響${point.waveImpactLabel}`,
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
      ? "河川のため沿岸波浪を判定に使用しません"
      : waveHeight == null
        ? `${point.waveImpactLabel}・気象庁沿岸波浪データなし`
        : `${point.waveImpactLabel}・気象庁沿岸予報の日内最大${waveHeight.toFixed(1)}mを地点特性に合わせて評価`;

  return {
    safety,
    comfort,
    bite,
    waveSummary: {
      waveHeight,
      coastalWave,
      impactLabel: point.waveImpactLabel,
      impactDetail,
    },
  };
}
