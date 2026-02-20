// src/lib/emotionDeciders/weatherEmotion.ts

export type WeatherEmotionKey =
  | "neutral"
  | "happy"
  | "sad"
  | "think"
  | "surprise"
  | "love";

export type WeatherEmotionInput = {
  overview?: string | null; // 例: "晴れ時々くもり" / "雨" / "雷雨"
  rainProbMax?: number | null; // 0-100
  windMax?: number | null; // m/s
  gustMax?: number | null; // m/s
  tideName?: string | null; // "大潮" / "中潮" / "小潮" / "長潮" / "若潮" / null
};

function n(v: unknown, fallback = 0) {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : fallback;
}

function includesAny(s: string, words: string[]) {
  return words.some((w) => s.includes(w));
}

/**
 * ✅ Weather用：安定型（ころころ変わらない）判定
 * 優先順位：
 * 1) 風で荒れ（surprise）
 * 2) 雨っぽい（sad）
 * 3) 微妙（think）
 * 4) 良い日（happy / love）
 * 5) neutral
 */
export function decideWeatherEmotion(
  input: WeatherEmotionInput,
): WeatherEmotionKey {
  const overview = String(input.overview ?? "").trim();
  const rainProbMax = n(input.rainProbMax, 0);
  const windMax = n(input.windMax, 0);
  const gustMax = n(input.gustMax, 0);
  const tideName = String(input.tideName ?? "").trim();

  // ---- しきい値（静岡サーフ想定の草案）----
  const SURPRISE_WIND = 9.0; // 最大風速
  const SURPRISE_GUST = 13.0; // 突風
  const THINK_WIND = 6.0; // 最大風速
  const THINK_RAIN = 30; // 降水確率
  const SAD_RAIN = 60;

  // 1) 荒れ（風）
  if (gustMax >= SURPRISE_GUST || windMax >= SURPRISE_WIND) return "surprise";

  // 2) 雨っぽさ（概況ワード or 降水確率）
  if (
    includesAny(overview, ["雷雨", "雨", "にわか雨", "霧雨"]) ||
    rainProbMax >= SAD_RAIN
  ) {
    return "sad";
  }

  // 3) 微妙（工夫が要る日）
  if (windMax >= THINK_WIND || rainProbMax >= THINK_RAIN) return "think";

  // 4) 良い日（潮で格上げ）
  //   条件良好：雨低い & 風弱い
  const goodWeather = windMax <= 5.9 && rainProbMax < 30;

  if (goodWeather) {
    if (tideName.includes("大潮") && rainProbMax < 20) return "love";
    if (tideName.includes("大潮") || tideName.includes("中潮")) return "happy";
    // 潮名が弱めでも天気が良いなら neutral〜happy の間だけど、まずは neutral で静かに
    return "neutral";
  }

  // 5) その他
  return "neutral";
}
