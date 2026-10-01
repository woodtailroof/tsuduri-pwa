export const WEATHER_OPTIONS = [
  { code: 0, label: "晴れ" },
  { code: 1, label: "晴れ時々くもり" },
  { code: 3, label: "くもり" },
  { code: 45, label: "霧" },
  { code: 51, label: "霧雨" },
  { code: 61, label: "雨" },
  { code: 65, label: "強い雨" },
  { code: 71, label: "雪" },
  { code: 80, label: "にわか雨" },
  { code: 95, label: "雷雨" },
];

export function weatherLabel(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return "未記録";
  if (code === 0) return "晴れ";
  if (code === 1 || code === 2) return "晴れ時々くもり";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if (code === 65 || code === 67 || code === 82) return "強い雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 81) return "にわか雨";
  if (code === 85 || code === 86) return "にわか雪";
  if (code >= 95 && code <= 99) return "雷雨";
  return `天気コード ${code}`;
}

export const WIND_DIRECTIONS = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];

export function windDirectionLabel(degrees: number | null | undefined): string {
  if (degrees == null || !Number.isFinite(degrees)) return "";
  return WIND_DIRECTIONS[Math.round(((degrees % 360 + 360) % 360) / 22.5) % 16];
}

// 空欄を0として扱わない。未記録は分析の対象外にする。
export function optionalEnvironmentNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
