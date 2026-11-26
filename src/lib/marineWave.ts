import type { HistoryWave } from "./runoffRisk";
export type MarineWaveHour = {
  hour: number;
  waveHeight: number;
  wavePeriod: number | null;
  swellWaveHeight: number | null;
};

export type MarineWaveForecast = {
  dayKey: string;
  hours: MarineWaveHour[];
  history?: HistoryWave[];
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
const CACHE_PREFIX = "tsuduri_marine_wave_v2:";
const CACHE_TTL_MS = 30 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
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

export function parseForecast(json: MarineApiResponse, dayKey: string): MarineWaveForecast {
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
    history: times.flatMap((rawTime, i): HistoryWave[] => {
      if(typeof rawTime!=="string") return [];
      const at=Date.parse(`${rawTime}+09:00`), height=finiteNumber(heights[i]);
      if(!Number.isFinite(at) || height==null || height<0) return [];
      return [{at,waveHeight:height,wavePeriod:finiteNumber(periods[i])}];
    }),
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
  const start = new Date(`${dayKey}T00:00:00+09:00`);
  start.setUTCDate(start.getUTCDate()-7);
  url.searchParams.set("start_date", new Date(start.getTime()+9*3600_000).toISOString().slice(0,10));
  url.searchParams.set("end_date", dayKey);
  url.searchParams.set("cell_selection", "sea");

  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  let response: Response, text: string;
  try {response=await fetch(url.toString(),{method:"GET",signal:controller.signal});text=await response.text();}
  finally {clearTimeout(timer);}
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
