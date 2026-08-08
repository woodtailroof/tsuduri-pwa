// src/lib/emotionDeciders/weatherEmotion.ts

export type WeatherEmotionKey =
  | "neutral"
  | "happy"
  | "sad"
  | "think"
  | "surprise"
  | "love";

import type { ForecastTone } from "../fishingForecast";

export type WeatherEmotionInput = {
  safetyTone: ForecastTone;
  comfortTone: ForecastTone;
  biteTone: ForecastTone;
  tideName?: string | null;
};

/**
 * Weather用感情判定。
 * 画面に表示する「安全度・釣りやすさ・釣れそう度」と同じ、
 * 選択時刻の前後3時間の総合予測を根拠にする。
 */
export function decideWeatherEmotion(
  input: WeatherEmotionInput,
): WeatherEmotionKey {
  const tideName = String(input.tideName ?? "").trim();

  if (input.safetyTone === "stop") return "surprise";
  if (input.safetyTone === "danger") return "sad";
  if (input.safetyTone === "hard") return "think";

  if (input.comfortTone === "hard" && input.biteTone === "hard") {
    return "sad";
  }
  if (
    input.safetyTone === "caution" ||
    input.comfortTone === "hard" ||
    input.biteTone === "hard"
  ) {
    return "think";
  }

  if (input.safetyTone === "good" && input.comfortTone === "good") {
    if (
      input.biteTone === "good" &&
      (tideName.includes("大潮") || tideName.includes("中潮"))
    ) {
      return "love";
    }
    return "happy";
  }

  return "neutral";
}
