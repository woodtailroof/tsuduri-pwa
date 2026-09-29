import type { TidePoint } from "../db";
import type { FishingPoint } from "../points";
import type { JmaCoastalWave } from "./jmaCoastalWave";
import type { MarineWaveHour } from "./marineWave";

export type ForecastTone = "good" | "caution" | "hard" | "danger" | "stop";

export type ForecastBadge = {
  label: string;
  detail: string;
  tone: ForecastTone;
  score?: number;
  method?: string;
  basis?: string[];
};

export type FishingForecast = {
  safety: ForecastBadge;
  comfort: ForecastBadge;
  bite: ForecastBadge;
  conditions: {
    weather: ForecastBadge;
    wind: ForecastBadge;
    wave: ForecastBadge;
  };
  waveSummary: {
    waveHeight: number | null;
    selectedWaveHeight: number | null;
    wavePeriod: number | null;
    regionalDifference: boolean;
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

function toneForLevel(level: number): ForecastTone {
  if (level >= 4) return "stop";
  if (level === 3) return "danger";
  if (level === 2) return "hard";
  if (level === 1) return "caution";
  return "good";
}

function windDirectionLabel(degrees: number) {
  if (!Number.isFinite(degrees)) return "風向不明";
  const labels = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  return labels[Math.round((((degrees % 360) + 360) % 360) / 45) % labels.length];
}

function directWeatherBadge(
  weather: WeatherLike[],
  precipitationMax: number | null,
): ForecastBadge {
  if (weather.length === 0 || precipitationMax == null) {
    return {
      label: "未取得",
      detail: "天気データなし",
      tone: "caution",
      basis: ["現地の空模様を確認"],
    };
  }

  const codes = weather.map((row) => row.weatherCode).filter(Number.isFinite);
  const has = (min: number, max = min) =>
    codes.some((code) => code >= min && code <= max);

  let label = "晴れ";
  let tone: ForecastTone = "good";
  if (has(95, 99)) {
    label = "雷雨";
    tone = "danger";
  } else if (has(71, 77) || has(85, 86)) {
    label = "雪・みぞれ";
    tone = "hard";
  } else if (precipitationMax >= 10 || has(65) || has(82)) {
    label = "強い雨";
    tone = "hard";
  } else if (precipitationMax >= 2 || has(61, 67) || has(80, 81)) {
    label = "雨";
    tone = "caution";
  } else if (precipitationMax > 0 || has(51, 57)) {
    label = "小雨";
    tone = "caution";
  } else if (has(45, 48)) {
    label = "霧";
    tone = "caution";
  } else if (has(3)) {
    label = "くもり";
  } else if (has(1, 2)) {
    label = "晴れ時々くもり";
  }

  return {
    label,
    detail: `前後3時間 最大${precipitationMax.toFixed(1)}mm/h`,
    tone,
    basis: [precipitationMax === 0 ? "降水なし" : `時間雨量 ${precipitationMax.toFixed(1)}mm`],
  };
}

function directWindBadge(weather: WeatherLike[]): ForecastBadge {
  if (weather.length === 0) {
    return {
      label: "未取得",
      detail: "風データなし",
      tone: "caution",
      basis: ["現地の風を確認"],
    };
  }

  const peak = [...weather].sort((a, b) => b.windSpeed - a.windSpeed)[0];
  const speed = peak.windSpeed;
  const level = speed >= 12 ? 4 : speed >= 10 ? 3 : speed >= 8 ? 2 : speed >= 6 ? 1 : 0;
  const label =
    level === 4
      ? "危険な強風"
      : level === 3
        ? "かなり強い"
        : level === 2
          ? "強風"
          : level === 1
            ? "やや強い"
            : speed >= 3
              ? "風あり"
              : "穏やか";

  return {
    label,
    detail: `${windDirectionLabel(peak.windDirection)} 最大${speed.toFixed(1)}m/s`,
    tone: toneForLevel(level),
    basis: [
      level >= 2
        ? "キャストと足元に影響"
        : level === 1
          ? "軽いルアーは扱いづらい"
          : "釣りへの影響は小さめ",
    ],
  };
}

function directWaveBadge(input: {
  point: FishingPoint;
  waveHeight: number | null;
  selectedWaveHeight: number | null;
  wavePeriod: number | null;
  coastalWave: JmaCoastalWave | null;
  regionalDifference: boolean;
}): ForecastBadge {
  const {
    point,
    waveHeight,
    selectedWaveHeight,
    wavePeriod,
    coastalWave,
    regionalDifference,
  } = input;
  if (point.waveExposure === "none") {
    return {
      label: "対象外",
      detail: "河川のため沿岸波浪なし",
      tone: "good",
      basis: ["増水・流速は現地確認"],
    };
  }
  if (waveHeight == null) {
    return {
      label: "未取得",
      detail:
        coastalWave == null
          ? "近海・広域ともデータなし"
          : `近海未取得／広域最大${coastalWave.maxHeight.toFixed(1)}m`,
      tone: "caution",
      basis: ["ライブカメラと現地で確認"],
    };
  }

  const level = safetyLevelForHeight(point, waveHeight);
  const label =
    level === 4
      ? "危険な高波"
      : level === 3
        ? "高波"
        : level === 2
          ? "波高め"
          : level === 1
            ? "波あり"
            : "穏やか";
  const basis = [
    selectedWaveHeight == null
      ? `前後3時間最大 ${waveHeight.toFixed(1)}m`
      : `選択時 ${selectedWaveHeight.toFixed(1)}m／最大 ${waveHeight.toFixed(1)}m`,
    wavePeriod == null ? "周期未取得" : `周期 ${wavePeriod.toFixed(1)}秒`,
    `地点影響 ${point.waveImpactLabel}`,
  ];
  if (regionalDifference && coastalWave) {
    basis.push(`広域最大 ${coastalWave.maxHeight.toFixed(1)}m・予報差あり`);
  }

  return {
    label,
    detail: `近海 前後3時間最大${waveHeight.toFixed(1)}m`,
    tone: toneForLevel(Math.max(level, regionalDifference ? 1 : 0)),
    basis,
  };
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
  marineWaveHours?: MarineWaveHour[];
}): FishingForecast {
  const {
    point,
    selectedHour,
    weather,
    tideSeries,
    tideName,
    coastalWave = null,
    marineWaveHours = [],
  } = input;

  const selectedMarineWave = [...marineWaveHours].sort(
    (a, b) => Math.abs(a.hour - selectedHour) - Math.abs(b.hour - selectedHour),
  )[0];
  const nearbyMarineWaves = marineWaveHours.filter(
    (row) => Math.abs(row.hour - selectedHour) <= 3,
  );
  const selectedWaveHeight =
    point.waveExposure === "none"
      ? null
      : selectedMarineWave?.waveHeight ?? null;
  const waveHeight =
    point.waveExposure === "none" || nearbyMarineWaves.length === 0
      ? null
      : Math.max(...nearbyMarineWaves.map((row) => row.waveHeight));
  const regionalDifference =
    waveHeight != null &&
    coastalWave != null &&
    coastalWave.maxHeight >= 2 &&
    coastalWave.maxHeight - waveHeight >= 1.2;
  const windMax = weather.length
    ? Math.max(...weather.map((row) => row.windSpeed))
    : null;
  const precipitationMax = weather.length
    ? Math.max(...weather.map((row) => row.precipitation))
    : null;

  const safetyReasons: { level: number; text: string }[] = [];
  const safetyBasis: string[] = [];
  let safetyLevel = 0;

  if (point.waveExposure === "none") {
    safetyReasons.push({ level: 0, text: "沿岸波浪は判定対象外" });
    safetyBasis.push("波 対象外");
  } else if (waveHeight == null) {
    const regionalHeight = coastalWave?.maxHeight ?? null;
    safetyLevel =
      regionalHeight == null
        ? 1
        : regionalHeight >= 4
          ? 3
          : regionalHeight >= 3
            ? 2
            : regionalHeight >= 2
              ? 1
              : 1;
    safetyReasons.push({
      level: Math.max(1, safetyLevel),
      text:
        regionalHeight == null
          ? "地点別の波浪データが未取得のため現地確認"
          : `地点波未取得・広域沿岸は最大${regionalHeight.toFixed(1)}m`,
    });
    safetyBasis.push(
      regionalHeight == null
        ? "波 未取得・現地確認"
        : `波 未取得／広域${regionalHeight.toFixed(1)}m`,
    );
  } else {
    safetyLevel = safetyLevelForHeight(point, waveHeight);
    const waveResult = safetyBadge(safetyLevel, "").label;
    safetyBasis.push(
      `波 ${waveHeight.toFixed(1)}m → ${waveResult}`,
    );
    if (safetyLevel > 0) {
      safetyReasons.push({
        level: safetyLevel,
        text: `地点別波浪 前後3時間最大${waveHeight.toFixed(1)}m`,
      });
    }

    if (regionalDifference) {
      safetyLevel = Math.max(safetyLevel, 1);
      safetyReasons.push({
        level: 1,
        text: `地点${waveHeight.toFixed(1)}mに対し広域最大${coastalWave.maxHeight.toFixed(1)}m・予報差あり`,
      });
      safetyBasis.push(
        `広域 ${coastalWave.maxHeight.toFixed(1)}m・予報差`,
      );
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
  safetyBasis.push(
    windMax == null
      ? "風 データなし"
      : `風 ${windMax.toFixed(1)}m/s`,
  );

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
  safetyBasis.push(
    precipitationMax == null
      ? "雨 データなし"
      : `雨 ${precipitationMax.toFixed(1)}mm/h`,
  );

  safetyLevel = clamp(safetyLevel, 0, 4);
  const safetyFallback =
    point.waterKind === "river"
      ? "風雨に大きな問題なし・増水は現地確認"
      : "風雨と地点への波影響に大きな問題なし";
  const safety = safetyBadge(
    safetyLevel,
    strongestReason(safetyReasons, safetyFallback),
  );
  safety.method = "波・風・雨を個別評価し、最も厳しい結果を採用";
  safety.basis = safetyBasis;

  let comfortScore = 100;
  const comfortReasons: { penalty: number; text: string }[] = [];
  const comfortBasis: string[] = [];
  if (windMax != null) {
    const penalty = Math.max(0, windMax - 3) * 8;
    comfortScore -= penalty;
    comfortBasis.push(
      `風 ${windMax.toFixed(1)}m/s ${penalty > 0 ? `−${Math.round(penalty)}点` : "±0点"}`,
    );
    if (penalty >= 8) {
      comfortReasons.push({ penalty, text: `風${windMax.toFixed(1)}m/s` });
    }
  }
  if (precipitationMax != null) {
    const penalty = Math.min(38, precipitationMax * 8);
    comfortScore -= penalty;
    comfortBasis.push(
      `雨 ${precipitationMax.toFixed(1)}mm/h ${penalty > 0 ? `−${Math.round(penalty)}点` : "±0点"}`,
    );
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
    comfortBasis.push(
      `波 ${waveHeight.toFixed(1)}m ${penalty > 0 ? `−${Math.round(penalty)}点` : "±0点"}`,
    );
    if (penalty >= 6) {
      comfortReasons.push({
        penalty,
        text: `地点別波浪${waveHeight.toFixed(1)}m・影響${point.waveImpactLabel}`,
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
  comfort.method = "100点から、前後3時間の風・雨・地点別波高の負担を減点";
  comfort.basis = comfortBasis.length > 0 ? comfortBasis : ["判定材料なし"];

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
  bite.method = "50点を基準に、潮・時間帯・風・雨・潮回りを加減点";
  bite.basis = [
    ...biteGood.map((item) => `${item.text}：＋${item.points}点`),
    ...biteBad.map((item) => `${item.text}：−${item.points}点`),
  ];
  if (bite.basis.length === 0) bite.basis = ["加減点なし"];

  const impactDetail =
    point.waveExposure === "none"
      ? "河川のため沿岸波浪を判定に使用しません"
      : waveHeight == null
        ? `${point.waveImpactLabel}・地点別波浪データなし（気象庁広域予報を参考表示）`
        : `${point.waveImpactLabel}・選択時刻を中心とする地点別波浪${waveHeight.toFixed(1)}mを評価${regionalDifference ? "。広域予報との開きが大きいため現地確認を推奨" : ""}`;

  const conditions = {
    weather: directWeatherBadge(weather, precipitationMax),
    wind: directWindBadge(weather),
    wave: directWaveBadge({
      point,
      waveHeight,
      selectedWaveHeight,
      wavePeriod: selectedMarineWave?.wavePeriod ?? null,
      coastalWave,
      regionalDifference,
    }),
  };

  return {
    safety,
    comfort,
    bite,
    conditions,
    waveSummary: {
      waveHeight,
      selectedWaveHeight,
      wavePeriod: selectedMarineWave?.wavePeriod ?? null,
      regionalDifference,
      coastalWave,
      impactLabel: point.waveImpactLabel,
      impactDetail,
    },
  };
}
