import type { FishingForecast } from "../fishingForecast";

export type WeatherEmotionKey =
  | "neutral"
  | "happy"
  | "sad"
  | "think"
  | "surprise"
  | "love";

export type WeatherEmotionInput = {
  conditions: FishingForecast["conditions"];
};

/** 画面に表示する天気・風・波の評価に感情を揃える。 */
export function decideWeatherEmotion(
  input: WeatherEmotionInput,
): WeatherEmotionKey {
  const badges = Object.values(input.conditions);
  const tones = badges.map((badge) => badge.tone);

  if (tones.includes("stop")) return "surprise";
  if (tones.includes("danger")) return "sad";
  // 既知の悪条件を優先し、未取得だけの場合は判断を保留する。
  if (badges.some((badge) => badge.label !== "未取得" &&
      (badge.tone === "hard" || badge.tone === "caution"))) return "think";
  if (badges.some((badge) => badge.label === "未取得")) return "neutral";
  if (tones.every((tone) => tone === "good")) return "happy";
  return "neutral";
}
