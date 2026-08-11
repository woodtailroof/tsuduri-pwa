export type JmaCoastalWave = {
  dayKey: string;
  text: string;
  minHeight: number;
  maxHeight: number;
  hasSwell: boolean;
  reportDatetime: string | null;
};

export type JmaCoastalWaveLoadResult = JmaCoastalWave & {
  source: "fetch" | "cache";
  isStale: boolean;
};

type JmaCoastalWaveCache = JmaCoastalWave & { ts: number };

const JMA_SHIZUOKA_FORECAST_URL =
  "https://www.jma.go.jp/bosai/forecast/data/forecast/220000.json";
const JMA_CENTRAL_AREA_CODE = "220010";
const CACHE_PREFIX = "tsuduri_jma_coastal_wave_v1:";
const CACHE_TTL_MS = 10 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeNumbers(text: string) {
  return text
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/[．。]/g, ".");
}

function parseWaveHeights(text: string) {
  const normalized = normalizeNumbers(text);
  const values = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*メートル/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return {
    minHeight: Math.min(...values),
    maxHeight: Math.max(...values),
  };
}

function parseForecast(json: unknown, dayKey: string): JmaCoastalWave | null {
  if (!Array.isArray(json)) return null;

  for (const rawBlock of json) {
    const block = asRecord(rawBlock);
    const timeSeries = Array.isArray(block?.timeSeries)
      ? block.timeSeries
      : [];

    for (const rawSeries of timeSeries) {
      const series = asRecord(rawSeries);
      const timeDefines = Array.isArray(series?.timeDefines)
        ? series.timeDefines.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const dayIndex = timeDefines.findIndex((time) =>
        time.startsWith(dayKey),
      );
      if (dayIndex < 0) continue;

      const areas = Array.isArray(series?.areas) ? series.areas : [];
      for (const rawArea of areas) {
        const area = asRecord(rawArea);
        const areaInfo = asRecord(area?.area);
        if (areaInfo?.code !== JMA_CENTRAL_AREA_CODE) continue;

        const waves = Array.isArray(area?.waves) ? area.waves : [];
        const text = waves[dayIndex];
        if (typeof text !== "string" || !text.trim()) continue;
        const heights = parseWaveHeights(text);
        if (!heights) continue;

        return {
          dayKey,
          text: text.trim(),
          ...heights,
          hasSwell: text.includes("うねり"),
          reportDatetime:
            typeof block?.reportDatetime === "string"
              ? block.reportDatetime
              : null,
        };
      }
    }
  }
  return null;
}

function readCache(dayKey: string): JmaCoastalWaveCache | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${dayKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JmaCoastalWaveCache;
    if (
      parsed?.dayKey !== dayKey ||
      typeof parsed.text !== "string" ||
      !Number.isFinite(parsed.minHeight) ||
      !Number.isFinite(parsed.maxHeight) ||
      !Number.isFinite(parsed.ts)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(forecast: JmaCoastalWave) {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${forecast.dayKey}`,
      JSON.stringify({ ...forecast, ts: Date.now() } satisfies JmaCoastalWaveCache),
    );
  } catch {
    // キャッシュ不可でも取得値はそのまま利用する。
  }
}

async function fetchForecast() {
  const response = await fetch(JMA_SHIZUOKA_FORECAST_URL, { method: "GET" });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`jma_coastal_http_${response.status}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`jma_coastal_json_parse_failed:${text.slice(0, 120)}`);
  }
}

export async function getJmaCoastalWave(
  dayKey: string,
  options: { online: boolean },
): Promise<JmaCoastalWaveLoadResult> {
  const cached = readCache(dayKey);
  const isFresh = !!cached && Date.now() - cached.ts <= CACHE_TTL_MS;

  if (!options.online) {
    if (!cached) throw new Error("offline_no_jma_coastal_cache");
    return { ...cached, source: "cache", isStale: true };
  }

  if (cached && isFresh) {
    return { ...cached, source: "cache", isStale: false };
  }

  try {
    const json = await fetchForecast();
    const forecast = parseForecast(json, dayKey);
    if (!forecast) throw new Error("jma_coastal_day_not_in_range");
    writeCache(forecast);
    return { ...forecast, source: "fetch", isStale: false };
  } catch (error) {
    if (cached) return { ...cached, source: "cache", isStale: true };
    throw error;
  }
}
