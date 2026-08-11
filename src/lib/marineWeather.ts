import { WAVE_REFERENCE } from "../points";

export type MarineHour = {
  time: string;
  hour: number;
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  swellHeight: number | null;
  swellDirection: number | null;
  swellPeriod: number | null;
  windWaveHeight: number | null;
  seaSurfaceTemperature: number | null;
};

export type MarineDay = {
  dayKey: string;
  hours: MarineHour[];
  gridLat: number | null;
  gridLon: number | null;
};

export type MarineLoadResult = MarineDay & {
  source: "fetch" | "cache";
  isStale: boolean;
};

type MarineCache = MarineDay & { ts: number };

type MarineApiHourly = {
  time?: unknown[];
  wave_height?: unknown[];
  wave_direction?: unknown[];
  wave_period?: unknown[];
  swell_wave_height?: unknown[];
  swell_wave_direction?: unknown[];
  swell_wave_period?: unknown[];
  wind_wave_height?: unknown[];
  sea_surface_temperature?: unknown[];
};

type MarineApiResponse = {
  latitude?: unknown;
  longitude?: unknown;
  hourly?: MarineApiHourly;
};

const CACHE_PREFIX = "tsuduri_openmeteo_marine_v2_shizuoka_coast:";
const CACHE_TTL_MS = 20 * 60 * 1000;

function finiteOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits: number): number | null {
  if (value == null) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function parseHour(time: string): number | null {
  const match = time.match(/T(\d{2}):/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : null;
}

function parseDay(json: MarineApiResponse, dayKey: string): MarineDay | null {
  const hourly = json?.hourly;
  const times: unknown[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const hours: MarineHour[] = [];

  times.forEach((rawTime, index) => {
    if (typeof rawTime !== "string" || !rawTime.startsWith(`${dayKey}T`)) {
      return;
    }
    const hour = parseHour(rawTime);
    if (hour == null) return;

    hours.push({
      time: rawTime,
      hour,
      waveHeight: round(finiteOrNull(hourly?.wave_height?.[index]), 2),
      waveDirection: round(
        finiteOrNull(hourly?.wave_direction?.[index]),
        0,
      ),
      wavePeriod: round(finiteOrNull(hourly?.wave_period?.[index]), 1),
      swellHeight: round(
        finiteOrNull(hourly?.swell_wave_height?.[index]),
        2,
      ),
      swellDirection: round(
        finiteOrNull(hourly?.swell_wave_direction?.[index]),
        0,
      ),
      swellPeriod: round(
        finiteOrNull(hourly?.swell_wave_period?.[index]),
        1,
      ),
      windWaveHeight: round(
        finiteOrNull(hourly?.wind_wave_height?.[index]),
        2,
      ),
      seaSurfaceTemperature: round(
        finiteOrNull(hourly?.sea_surface_temperature?.[index]),
        1,
      ),
    });
  });

  if (hours.length === 0) return null;
  return {
    dayKey,
    hours,
    gridLat: finiteOrNull(json?.latitude),
    gridLon: finiteOrNull(json?.longitude),
  };
}

function readCache(dayKey: string): MarineCache | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${dayKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarineCache;
    if (
      !parsed ||
      parsed.dayKey !== dayKey ||
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

function writeCache(day: MarineDay) {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${day.dayKey}`,
      JSON.stringify({ ...day, ts: Date.now() } satisfies MarineCache),
    );
  } catch {
    // 容量超過・プライベートモードなどではキャッシュなしで継続する。
  }
}

async function fetchMarineForecast(): Promise<MarineApiResponse> {
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("latitude", String(WAVE_REFERENCE.lat));
  url.searchParams.set("longitude", String(WAVE_REFERENCE.lon));
  url.searchParams.set(
    "hourly",
    [
      "wave_height",
      "wave_direction",
      "wave_period",
      "swell_wave_height",
      "swell_wave_direction",
      "swell_wave_period",
      "wind_wave_height",
      "sea_surface_temperature",
    ].join(","),
  );
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("forecast_days", "8");
  url.searchParams.set("cell_selection", "sea");

  const response = await fetch(url.toString(), { method: "GET" });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const head = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      `marine_http_${response.status}${head ? `:${head}` : ""}`,
    );
  }

  try {
    return JSON.parse(text) as MarineApiResponse;
  } catch {
    throw new Error(`marine_json_parse_failed:${text.slice(0, 160)}`);
  }
}

export async function getMarineDay(
  dayKey: string,
  options: { online: boolean },
): Promise<MarineLoadResult> {
  const cached = readCache(dayKey);
  const isFresh = !!cached && Date.now() - cached.ts <= CACHE_TTL_MS;

  if (!options.online) {
    if (!cached) throw new Error("offline_no_marine_cache");
    return { ...cached, source: "cache", isStale: true };
  }

  if (cached && isFresh) {
    return { ...cached, source: "cache", isStale: false };
  }

  try {
    const json = await fetchMarineForecast();
    const day = parseDay(json, dayKey);
    if (!day) throw new Error("marine_day_not_in_range");
    writeCache(day);
    return { ...day, source: "fetch", isStale: false };
  } catch (error) {
    if (cached) return { ...cached, source: "cache", isStale: true };
    throw error;
  }
}

export function pickMarineAtThreeHours(hours: MarineHour[]): MarineHour[] {
  return hours.filter((item) => item.hour % 3 === 0);
}

export function marineWindow(
  hours: MarineHour[],
  selectedHour: number,
  radiusHours = 3,
): MarineHour[] {
  return hours.filter(
    (item) => Math.abs(item.hour - selectedHour) <= radiusHours,
  );
}
