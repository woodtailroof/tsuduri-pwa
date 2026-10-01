export type TripEnvironment = {
  weatherCode: number | null;
  windSpeedMs: number | null;
  windDirDeg: number | null;
  airTempC: number | null;
  waveHeightM: number | null;
  fetchedAt: string;
  note: string;
};

export function japanHourKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:00`;
}

export function hourlyValue(json: unknown, key: string, time: string): number | null {
  const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly;
  const times = hourly?.time;
  const values = hourly?.[key];
  if (!Array.isArray(times) || !Array.isArray(values)) return null;
  const index = times.indexOf(time);
  const value = index < 0 ? null : values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchTripEnvironment(latitude: number, longitude: number, date: Date, signal: AbortSignal, includeWave = true): Promise<TripEnvironment> {
  const time = japanHourKey(date);
  const day = time.slice(0, 10);
  const daysAgo = (Date.parse(japanHourKey(new Date()).slice(0, 10)) - Date.parse(day)) / 86400000;
  const weatherUrl = new URL(daysAgo > 5 ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/jma");
  const waveUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  for (const url of [weatherUrl, waveUrl]) {
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("timezone", "Asia/Tokyo");
    url.searchParams.set("start_date", day);
    url.searchParams.set("end_date", day);
  }
  weatherUrl.searchParams.set("hourly", "weather_code,temperature_2m,wind_speed_10m,wind_direction_10m");
  weatherUrl.searchParams.set("wind_speed_unit", "ms");
  waveUrl.searchParams.set("hourly", "wave_height");
  waveUrl.searchParams.set("cell_selection", "sea");
  const get = async (url: URL) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`環境情報 HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  const [weather, wave] = await Promise.allSettled([
    get(weatherUrl),
    !includeWave || daysAgo > 92 ? Promise.resolve(null) : get(waveUrl),
  ]);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const w = weather.status === "fulfilled" ? weather.value : null;
  const m = wave.status === "fulfilled" ? wave.value : null;
  const result = {
    weatherCode: hourlyValue(w, "weather_code", time),
    windSpeedMs: hourlyValue(w, "wind_speed_10m", time),
    windDirDeg: hourlyValue(w, "wind_direction_10m", time),
    airTempC: hourlyValue(w, "temperature_2m", time),
    waveHeightM: hourlyValue(m, "wave_height", time),
    fetchedAt: new Date().toISOString(),
    note: `${day} ${time.slice(11,16)}（日本時間）・${daysAgo > 5 ? "過去天気モデル" : "JMAモデル"}${includeWave ? "／沿岸波浪モデル" : "・波高は対象外（河川）"}`,
  };
  const values = [result.weatherCode, result.windSpeedMs, result.windDirDeg, result.airTempC, ...(includeWave ? [result.waveHeightM] : [])];
  const missing = values.filter((v) => v == null).length;
  if (missing === values.length) throw new Error("この日時・地点の環境情報を取得できませんでした。値は未記録で保存できます。");
  if (missing) result.note += "・一部未取得（波高などは期間・地点によって取得不可）";
  return result;
}
