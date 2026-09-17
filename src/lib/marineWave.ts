export type MarineWaveHour = {
  hour: number;
  waveHeight: number;
  wavePeriod: number | null;
  swellWaveHeight: number | null;
};

export type MarineWaveForecast = {
  dayKey: string;
  hours: MarineWaveHour[];
  gridLatitude: number | null;
  gridLongitude: number | null;
};

export type MarineWaveLoadResult = MarineWaveForecast & {
  source: "fetch" | "cache";
  isStale: boolean;
};

type MarineWaveCache = MarineWaveForecast & { ts: number };

type MarineApiResponse = {
  latitude?: unknown;
  longitude?: unknown;
  hourly?: {
    time?: unknown[];
    wave_height?: unknown[];
    wave_period?: unknown[];
    swell_wave_height?: unknown[];
  };
};

const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
const CACHE_PREFIX = "tsuduri_marine_wave_v1:";
const CACHE_TTL_MS = 30 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function cacheKey(pointId: string, dayKey: string) {
  return `${CACHE_PREFIX}${pointId}:${dayKey}`;
}

function readCache(pointId: string, dayKey: string): MarineWaveCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(pointId, dayKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarineWaveCache;
    if (
      parsed?.dayKey !== dayKey ||
      !Array.isArray(parsed.hours) ||
      !Number.isFinite(parsed.ts)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(pointId: string, forecast: MarineWaveForecast) {
  try {
    localStorage.setItem(
      cacheKey(pointId, forecast.dayKey),
      JSON.stringify({ ...forecast, ts: Date.now() } satisfies MarineWaveCache),
    );
  } catch {
    // キャッシュ不可でも取得値はそのまま利用する。
  }
}

function parseForecast(json: MarineApiResponse, dayKey: string): MarineWaveForecast {
  const hourly = json.hourly;
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const heights = Array.isArray(hourly?.wave_height)
    ? hourly.wave_height
    : [];
  const periods = Array.isArray(hourly?.wave_period)
    ? hourly.wave_period
    : [];
  const swells = Array.isArray(hourly?.swell_wave_height)
    ? hourly.swell_wave_height
    : [];

  const hours = times.flatMap((rawTime, index): MarineWaveHour[] => {
    if (typeof rawTime !== "string" || !rawTime.startsWith(`${dayKey}T`)) {
      return [];
    }
    const hour = Number(rawTime.slice(11, 13));
    const waveHeight = finiteNumber(heights[index]);
    if (!Number.isFinite(hour) || waveHeight == null) return [];
    return [
      {
        hour,
        waveHeight,
        wavePeriod: finiteNumber(periods[index]),
        swellWaveHeight: finiteNumber(swells[index]),
      },
    ];
  });

  if (!hours.length) throw new Error("marine_wave_day_not_in_range");
  return {
    dayKey,
    hours,
    gridLatitude: finiteNumber(json.latitude),
    gridLongitude: finiteNumber(json.longitude),
  };
}

async function fetchForecast(
  latitude: number,
  longitude: number,
  dayKey: string,
) {
  const url = new URL(MARINE_API_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "hourly",
    "wave_height,wave_period,swell_wave_height",
  );
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("start_date", dayKey);
  url.searchParams.set("end_date", dayKey);
  url.searchParams.set("cell_selection", "sea");

  const response = await fetch(url.toString(), { method: "GET" });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`marine_wave_http_${response.status}`);
  }
  try {
    return JSON.parse(text) as MarineApiResponse;
  } catch {
    throw new Error(`marine_wave_json_parse_failed:${text.slice(0, 120)}`);
  }
}

export async function getMarineWaveForecast(
  pointId: string,
  latitude: number,
  longitude: number,
  dayKey: string,
  options: { online: boolean },
): Promise<MarineWaveLoadResult> {
  const cached = readCache(pointId, dayKey);
  const isFresh = !!cached && Date.now() - cached.ts <= CACHE_TTL_MS;

  if (!options.online) {
    if (!cached) throw new Error("offline_no_marine_wave_cache");
    return { ...cached, source: "cache", isStale: true };
  }
  if (cached && isFresh) {
    return { ...cached, source: "cache", isStale: false };
  }

  try {
    const json = await fetchForecast(latitude, longitude, dayKey);
    const forecast = parseForecast(json, dayKey);
    writeCache(pointId, forecast);
    return { ...forecast, source: "fetch", isStale: false };
  } catch (error) {
    if (cached) return { ...cached, source: "cache", isStale: true };
    throw error;
  }
}
