// src/screens/Weather.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import PageShell from "../components/PageShell";
import TideGraph from "../components/TideGraph";
import type { TidePoint } from "../db";
import { useEmotion } from "../lib/emotion";
import { decideWeatherEmotion } from "../lib/emotionDeciders/weatherEmotion";
import {
  buildFishingForecast,
  type ForecastBadge,
  type ForecastTone,
} from "../lib/fishingForecast";
import {
  getMarineDay,
  marineWindow,
  pickMarineAtThreeHours,
  type MarineHour,
} from "../lib/marineWeather";
import { useAppSettings } from "../lib/appSettings";
import {
  dayKey as dayKeyFromDate,
  getTide736DayCached,
  type TideCacheSource,
} from "../lib/tide736Cache";
import {
  DEFAULT_FISHING_POINT_ID,
  FISHING_POINTS,
  FIXED_PORT,
  getFishingPoint,
  WAVE_REFERENCE,
} from "../points";

type Props = {
  back: () => void;
  isActive?: boolean;
};

type WeatherSummary = {
  label: string;
  weatherCode: number;
  overview: string;
  tempMin: number;
  tempMax: number;
  windMax: number;
  rainSum: number;
};

type WeatherHour = {
  hour: number;
  weatherCode: number;
  temp: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
};

type TideExtreme = {
  kind: "high" | "low";
  min: number;
  cm: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | {
      status: "ok";
      series: TidePoint[];
      tideName: string | null;
      source: TideCacheSource;
      isStale: boolean;
      dayKey: string;
    }
  | { status: "error"; message: string };

type WeatherLoadState =
  | { status: "idle" | "loading" }
  | {
      status: "ok";
      dayKey: string;
      summary: WeatherSummary;
      hours: WeatherHour[];
      source: "fetch" | "cache";
    }
  | { status: "error"; message: string };

type MarineLoadState =
  | { status: "idle" | "loading" }
  | {
      status: "ok";
      dayKey: string;
      hours: MarineHour[];
      source: "fetch" | "cache";
      isStale: boolean;
      gridLat: number | null;
      gridLon: number | null;
    }
  | { status: "error"; message: string };

type WeatherApiResponse = {
  daily?: {
    time?: unknown[];
    weather_code?: unknown[];
    temperature_2m_max?: unknown[];
    temperature_2m_min?: unknown[];
    precipitation_sum?: unknown[];
    wind_speed_10m_max?: unknown[];
  };
  hourly?: {
    time?: unknown[];
    weather_code?: unknown[];
    temperature_2m?: unknown[];
    precipitation?: unknown[];
    wind_speed_10m?: unknown[];
    wind_direction_10m?: unknown[];
  };
};

const WEATHER_CACHE_PREFIX = "tsuduri_jma_point_weather_v2:";
const WEATHER_TTL_MS = 10 * 60 * 1000;
const POINT_STORAGE_KEY = "tsuduri_weather_point_v1";
const THREE_HOUR_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21] as const;
const SHIZUOKA_COAST_CAMERA_URL =
  "http://shizuokakaigan.pref.shizuoka.jp/sys/cam/";
const SHIMIZU_NOWPHAS_URL =
  "https://nowphas.mlit.go.jp/yugiha_graph/505/7/";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateInputValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatHMFromMinutes(totalMin: number) {
  const minute = clamp(Math.round(totalMin), 0, 1440);
  return `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

function toMinutes(point: TidePoint): number | null {
  if (point.time) {
    const [hour, minute] = point.time.split(":").map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return hour * 60 + minute;
    }
  }
  if (typeof point.unix === "number") {
    const ms = point.unix < 1e12 ? point.unix * 1000 : point.unix;
    const date = new Date(ms);
    return date.getHours() * 60 + date.getMinutes();
  }
  return null;
}

function extractExtremesBySlope(series: TidePoint[]): TideExtreme[] {
  const points = series
    .map((point) => {
      const min = toMinutes(point);
      return min == null ? null : { min: clamp(min, 0, 1440), cm: point.cm };
    })
    .filter((point): point is { min: number; cm: number } => !!point)
    .sort((a, b) => a.min - b.min);

  if (points.length < 3) return [];

  const unique: { min: number; cm: number }[] = [];
  for (const point of points) {
    const last = unique[unique.length - 1];
    if (last?.min === point.min) unique[unique.length - 1] = point;
    else unique.push(point);
  }

  const raw: TideExtreme[] = [];
  let previousSlope = 0;
  for (let i = 1; i < unique.length; i += 1) {
    const delta = unique[i].cm - unique[i - 1].cm;
    const slope = Math.abs(delta) <= 1 ? 0 : delta > 0 ? 1 : -1;
    if (i >= 2) {
      const middle = unique[i - 1];
      if (previousSlope > 0 && slope < 0) {
        raw.push({ kind: "high", min: middle.min, cm: middle.cm });
      } else if (previousSlope < 0 && slope > 0) {
        raw.push({ kind: "low", min: middle.min, cm: middle.cm });
      }
    }
    if (slope !== 0) previousSlope = slope;
  }

  const merged: TideExtreme[] = [];
  for (const extreme of raw) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === extreme.kind &&
      Math.abs(last.min - extreme.min) <= 5
    ) {
      const replace =
        extreme.kind === "high"
          ? extreme.cm >= last.cm
          : extreme.cm <= last.cm;
      if (replace) merged[merged.length - 1] = extreme;
    } else {
      merged.push(extreme);
    }
  }

  const highs = merged.filter((item) => item.kind === "high").slice(0, 2);
  const lows = merged.filter((item) => item.kind === "low").slice(0, 2);
  return [...highs, ...lows].sort((a, b) => a.min - b.min);
}

function sourceLabel(source: TideCacheSource, isStale: boolean) {
  if (source === "fetch") return { text: "取得", color: "#4be1a1" };
  if (isStale) return { text: "期限切れキャッシュ", color: "#ff83cc" };
  return { text: "キャッシュ", color: "#76dcff" };
}

function safeNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function wmoToJa(code: number) {
  if (!Number.isFinite(code)) return "不明";
  if (code === 0) return "快晴";
  if (code === 1) return "晴れ";
  if (code === 2) return "晴れ時々くもり";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "にわか雨";
  if (code >= 95 && code <= 99) return "雷雨";
  return "天気";
}

function wmoToIcon(code: number) {
  if (!Number.isFinite(code)) return "❔";
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌤️";
}

function directionLabel(deg: number | null) {
  if (deg == null || !Number.isFinite(deg)) return "-";
  const labels = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  return labels[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

async function fetchOpenMeteoDaily(lat: number, lon: number) {
  const url = new URL("https://api.open-meteo.com/v1/jma");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
  );
  url.searchParams.set(
    "hourly",
    "weather_code,temperature_2m,precipitation,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("forecast_days", "11");
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("cell_selection", "land");

  const response = await fetch(url.toString(), { method: "GET" });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const head = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      `openmeteo_http_${response.status}${head ? `:${head}` : ""}`,
    );
  }
  try {
    return JSON.parse(text) as WeatherApiResponse;
  } catch {
    throw new Error(`openmeteo_json_parse_failed:${text.slice(0, 160)}`);
  }
}

function pickDailySummary(
  json: WeatherApiResponse,
  day: string,
): WeatherSummary | null {
  const daily = json?.daily;
  const times = Array.isArray(daily?.time)
    ? daily.time.filter((value): value is string => typeof value === "string")
    : [];
  const index = times.findIndex((time) => time === day);
  if (index < 0) return null;
  const code = safeNumber(daily?.weather_code?.[index], Number.NaN);
  return {
    label: day,
    weatherCode: code,
    overview: wmoToJa(code),
    tempMin: Math.round(safeNumber(daily?.temperature_2m_min?.[index]) * 10) / 10,
    tempMax: Math.round(safeNumber(daily?.temperature_2m_max?.[index]) * 10) / 10,
    windMax: Math.round(safeNumber(daily?.wind_speed_10m_max?.[index]) * 10) / 10,
    rainSum:
      Math.round(safeNumber(daily?.precipitation_sum?.[index]) * 10) / 10,
  };
}

function pickHourlyWeather(json: WeatherApiResponse, day: string): WeatherHour[] {
  const hourly = json?.hourly;
  const times = Array.isArray(hourly?.time)
    ? hourly.time.filter((value): value is string => typeof value === "string")
    : [];
  return THREE_HOUR_SLOTS.flatMap((hour) => {
    const index = times.findIndex((time) => time === `${day}T${pad2(hour)}:00`);
    if (index < 0) return [];
    return [
      {
        hour,
        weatherCode: safeNumber(hourly?.weather_code?.[index], Number.NaN),
        temp:
          Math.round(safeNumber(hourly?.temperature_2m?.[index]) * 10) / 10,
        precipitation:
          Math.round(safeNumber(hourly?.precipitation?.[index]) * 10) / 10,
        windSpeed:
          Math.round(safeNumber(hourly?.wind_speed_10m?.[index]) * 10) / 10,
        windDirection: Math.round(
          safeNumber(hourly?.wind_direction_10m?.[index]),
        ),
      },
    ];
  });
}

function weatherCacheKey(pointId: string, day: string) {
  return `${WEATHER_CACHE_PREFIX}${pointId}:${day}`;
}

function loadWeatherCache(pointId: string, day: string) {
  try {
    const raw = localStorage.getItem(weatherCacheKey(pointId, day));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      ts: number;
      summary: WeatherSummary;
      hours: WeatherHour[];
    };
    if (
      !parsed?.summary ||
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

function saveWeatherCache(
  pointId: string,
  day: string,
  summary: WeatherSummary,
  hours: WeatherHour[],
) {
  try {
    localStorage.setItem(
      weatherCacheKey(pointId, day),
      JSON.stringify({ ts: Date.now(), summary, hours }),
    );
  } catch {
    // キャッシュ不可でも表示は継続する。
  }
}

function initialPointId() {
  try {
    const stored = localStorage.getItem(POINT_STORAGE_KEY) ?? "";
    return FISHING_POINTS.some((point) => point.id === stored)
      ? stored
      : DEFAULT_FISHING_POINT_ID;
  } catch {
    return DEFAULT_FISHING_POINT_ID;
  }
}

function defaultHourFor(date: Date) {
  const now = new Date();
  if (sameDay(date, now)) return clamp(Math.floor(now.getHours() / 3) * 3, 0, 21);
  return 6;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true;
    return (
      window.matchMedia("(max-width: 820px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    );
  });

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 820px)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setIsMobile(narrow.matches || coarse.matches);
    narrow.addEventListener?.("change", update);
    coarse.addEventListener?.("change", update);
    window.addEventListener("orientationchange", update);
    return () => {
      narrow.removeEventListener?.("change", update);
      coarse.removeEventListener?.("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isMobile;
}

function useWideWeatherLayout() {
  const [isWide, setIsWide] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1180px)").matches;
  });

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1180px)");
    const update = () => setIsWide(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return isWide;
}

const toneStyle: Record<ForecastTone, { color: string; bg: string; border: string }> = {
  good: {
    color: "#83f5c1",
    bg: "rgba(39,205,139,0.13)",
    border: "rgba(93,243,180,0.30)",
  },
  caution: {
    color: "#ffe18a",
    bg: "rgba(255,193,78,0.13)",
    border: "rgba(255,218,121,0.30)",
  },
  hard: {
    color: "#ffad82",
    bg: "rgba(255,119,75,0.14)",
    border: "rgba(255,155,112,0.32)",
  },
  danger: {
    color: "#ff87aa",
    bg: "rgba(255,67,119,0.16)",
    border: "rgba(255,101,143,0.38)",
  },
  stop: {
    color: "#fff",
    bg: "linear-gradient(135deg, rgba(225,36,80,0.52), rgba(129,24,79,0.48))",
    border: "rgba(255,110,145,0.72)",
  },
};

function ForecastCard(props: {
  icon: string;
  title: string;
  badge: ForecastBadge;
}) {
  const tone = toneStyle[props.badge.tone];
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 14,
        padding: "9px 11px",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        display: "grid",
        gap: 2,
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.64)" }}>
        {props.icon} {props.title}
      </div>
      <div style={{ fontSize: 19, fontWeight: 950, color: tone.color }}>
        {props.badge.label}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.66)",
          lineHeight: 1.35,
          minHeight: "2.7em",
        }}
      >
        {props.badge.detail}
      </div>
    </div>
  );
}

export default function Weather({ back, isActive = true }: Props) {
  useAppSettings();
  const { emitEmotion, clearEmotion } = useEmotion();
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;
  const isWideLayout = useWideWeatherLayout();

  const [tab, setTab] = useState<"today" | "tomorrow" | "pick">("today");
  const [picked, setPicked] = useState(toDateInputValue(new Date()));
  const [selectedPointId, setSelectedPointId] = useState(initialPointId);
  const [selectedHour, setSelectedHour] = useState(() =>
    defaultHourFor(new Date()),
  );
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [tideState, setTideState] = useState<LoadState>({ status: "idle" });
  const [weatherState, setWeatherState] = useState<WeatherLoadState>({
    status: "idle",
  });
  const [marineState, setMarineState] = useState<MarineLoadState>({
    status: "idle",
  });

  const targetDate = useMemo(() => {
    const now = new Date();
    if (tab === "today") return startOfDay(now);
    if (tab === "tomorrow") {
      const tomorrow = startOfDay(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return startOfDay(parseDateInputValue(picked) ?? now);
  }, [tab, picked]);

  const selectedPoint = useMemo(
    () => getFishingPoint(selectedPointId),
    [selectedPointId],
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setSelectedHour(defaultHourFor(targetDate));
  }, [targetDate]);

  useEffect(() => {
    try {
      localStorage.setItem(POINT_STORAGE_KEY, selectedPointId);
    } catch {
      // 保存できない環境でも選択中の表示は継続する。
    }
  }, [selectedPointId]);

  useEffect(() => {
    let cancelled = false;
    const day = dayKeyLocal(targetDate);

    async function run() {
      const cached = loadWeatherCache(selectedPoint.id, day);
      if (!online) {
        if (cached) {
          setWeatherState({
            status: "ok",
            dayKey: day,
            summary: cached.summary,
            hours: cached.hours,
            source: "cache",
          });
        } else {
          setWeatherState({ status: "error", message: "offline_no_cache" });
        }
        return;
      }

      if (cached && Date.now() - cached.ts <= WEATHER_TTL_MS) {
        setWeatherState({
          status: "ok",
          dayKey: day,
          summary: cached.summary,
          hours: cached.hours,
          source: "cache",
        });
        return;
      }

      setWeatherState({ status: "loading" });
      try {
        const json = await fetchOpenMeteoDaily(
          selectedPoint.weatherLat,
          selectedPoint.weatherLon,
        );
        const summary = pickDailySummary(json, day);
        if (!summary) throw new Error("openmeteo_day_not_in_range");
        const hours = pickHourlyWeather(json, day);
        const today = startOfDay(new Date());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const label = sameDay(targetDate, today)
          ? "今日"
          : sameDay(targetDate, tomorrow)
            ? "明日"
            : day;
        const labeled = { ...summary, label };
        saveWeatherCache(selectedPoint.id, day, labeled, hours);
        if (!cancelled) {
          setWeatherState({
            status: "ok",
            dayKey: day,
            summary: labeled,
            hours,
            source: "fetch",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [targetDate, online, selectedPoint]);

  useEffect(() => {
    let cancelled = false;
    const day = dayKeyLocal(targetDate);
    setMarineState({ status: "loading" });
    getMarineDay(day, { online })
      .then((result) => {
        if (cancelled) return;
        setMarineState({
          status: "ok",
          dayKey: result.dayKey,
          hours: result.hours,
          source: result.source,
          isStale: result.isStale,
          gridLat: result.gridLat,
          gridLon: result.gridLon,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setMarineState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [targetDate, online]);

  useEffect(() => {
    let cancelled = false;
    setTideState({ status: "loading" });
    getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, targetDate, {
      ttlDays: 30,
    })
      .then((result) => {
        if (cancelled) return;
        setTideState({
          status: "ok",
          series: result.series ?? [],
          tideName: result.tideName ?? null,
          source: result.source,
          isStale: result.isStale,
          dayKey: dayKeyFromDate(targetDate),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setTideState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [targetDate]);

  const extremes = useMemo(
    () =>
      tideState.status === "ok"
        ? extractExtremesBySlope(tideState.series)
        : [],
    [tideState],
  );

  const marineHours = useMemo(
    () => (marineState.status === "ok" ? marineState.hours : []),
    [marineState],
  );
  const marineThreeHourly = useMemo(
    () => pickMarineAtThreeHours(marineHours),
    [marineHours],
  );

  const forecast = useMemo(() => {
    const selectedMarine = marineWindow(marineHours, selectedHour, 3);
    const weatherHours =
      weatherState.status === "ok"
        ? weatherState.hours.filter(
            (item) => Math.abs(item.hour - selectedHour) <= 3,
          )
        : [];
    return buildFishingForecast({
      point: selectedPoint,
      selectedHour,
      marine: selectedMarine,
      weather: weatherHours,
      tideSeries: tideState.status === "ok" ? tideState.series : [],
      tideName: tideState.status === "ok" ? tideState.tideName : null,
    });
  }, [marineHours, selectedHour, weatherState, selectedPoint, tideState]);

  const weatherEmotion = useMemo(
    () =>
      decideWeatherEmotion({
        safetyTone: forecast.safety.tone,
        comfortTone: forecast.comfort.tone,
        biteTone: forecast.bite.tone,
        tideName: tideState.status === "ok" ? tideState.tideName : null,
      }),
    [forecast, tideState],
  );

  useEffect(() => {
    if (!isActive) {
      clearEmotion("weather");
      return;
    }
    emitEmotion({
      source: "weather",
      emotion: weatherEmotion,
      priority: 10,
      ttlMs: 30 * 60 * 1000,
    });
  }, [isActive, emitEmotion, clearEmotion, weatherEmotion]);

  useEffect(
    () => () => {
      clearEmotion("weather");
    },
    [clearEmotion],
  );

  const onBack = useCallback(() => {
    clearEmotion("weather");
    back();
  }, [clearEmotion, back]);

  const tileStyle: CSSProperties = {
    borderRadius: 16,
    padding: isDesktop ? 10 : 12,
    minWidth: 0,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
  };

  const controlStyle: CSSProperties = {
    minHeight: 34,
    borderRadius: 999,
    padding: "7px 11px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(17,17,17,var(--glass-alpha-strong,0.35))",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 800,
  };

  const tabStyle = (active: boolean): CSSProperties => ({
    ...controlStyle,
    cursor: "pointer",
    border: active ? "2px solid #ff5f8d" : controlStyle.border,
    color: active ? "#fff" : "rgba(255,255,255,0.74)",
    boxShadow: active ? "inset 0 0 0 1px rgba(255,95,141,0.20)" : "none",
  });

  const selectedWeather =
    weatherState.status === "ok"
      ? weatherState.hours.find((item) => item.hour === selectedHour)
      : undefined;
  const highlightAt = sameDay(targetDate, new Date()) ? new Date() : null;

  const openExternalInfo = useCallback(
    (url: string, windowName: string) => {
      if (isMobile) {
        // PWA本体の表示を置き換えず、OS側の別タブ／ブラウザで開く。
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      const popup = window.open(
        url,
        windowName,
        "popup=yes,width=1080,height=760,resizable=yes,scrollbars=yes",
      );
      popup?.focus();
    },
    [isMobile],
  );

  return (
    <PageShell
      title={
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(20px, 5.5vw, 32px)",
            lineHeight: 1.15,
          }}
        >
          ☀️ 天気・潮を見る
        </h1>
      }
      subtitle={
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          📍 天気・潮：焼津基準 / 🌊 海況：{WAVE_REFERENCE.name}
          {!online && <span style={{ marginLeft: 10, color: "#f6c" }}>📴 オフライン</span>}
        </div>
      }
      titleLayout="left"
      maxWidth={1580}
      showBack
      onBack={onBack}
      scrollY={isWideLayout ? "hidden" : "auto"}
      displayExpression={weatherEmotion}
      desktopContentLayout={isWideLayout ? "wide-left" : "default"}
      contentPadding={isDesktop ? "10px 18px 14px" : "14px 14px 20px"}
    >
      <div
        style={{
          height: isDesktop ? "100%" : undefined,
          minHeight: 0,
          overflowX: "clip",
          display: "grid",
          gridTemplateColumns: isWideLayout
            ? "minmax(236px, 0.43fr) minmax(0, 2.57fr)"
            : "1fr",
          gridTemplateRows: isWideLayout
            ? "auto minmax(0, 1fr)"
            : undefined,
          gap: isDesktop ? 7 : 12,
        }}
      >
        <div
          className="glass glass-strong"
          style={{
            ...tileStyle,
            padding: isDesktop ? "7px 10px" : 10,
            display: "flex",
            gap: 8,
            flexWrap: isWideLayout ? "nowrap" : "wrap",
            flexDirection: isWideLayout ? "column" : "row",
            alignItems: isWideLayout ? "stretch" : "center",
            alignSelf: isWideLayout ? "stretch" : undefined,
            gridColumn: isWideLayout ? 1 : undefined,
            gridRow: isWideLayout ? "1 / 3" : undefined,
            minHeight: 0,
          }}
        >
          {isWideLayout && (
            <div style={{ fontSize: 14, fontWeight: 950, marginBottom: 2 }}>
              📍 日時・釣場を選ぶ
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
          <button onClick={() => setTab("today")} style={tabStyle(tab === "today")}>
            今日
          </button>
          <button
            onClick={() => setTab("tomorrow")}
            style={tabStyle(tab === "tomorrow")}
          >
            明日
          </button>
          <button onClick={() => setTab("pick")} style={tabStyle(tab === "pick")}>
            日付指定
          </button>
          </div>
          {tab === "pick" && (
            <input
              type="date"
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
              style={{
                ...controlStyle,
                borderRadius: 10,
                width: isWideLayout ? "100%" : undefined,
              }}
            />
          )}

          <span
            style={{
              width: isWideLayout ? "100%" : 1,
              height: isWideLayout ? 1 : 24,
              background: "rgba(255,255,255,0.14)",
            }}
          />

          <label
            style={{
              display: "inline-flex",
              flexDirection: isWideLayout ? "column" : "row",
              alignItems: isWideLayout ? "stretch" : "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>釣場</span>
            <select
              value={selectedPointId}
              onChange={(event) => setSelectedPointId(event.target.value)}
              style={{
                ...controlStyle,
                borderRadius: 10,
                width: isWideLayout ? "100%" : undefined,
              }}
            >
              {FISHING_POINTS.map((point) => (
                <option key={point.id} value={point.id} style={{ color: "#111" }}>
                  {point.name}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minHeight: 0,
            }}
          >
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
              判定時刻（前後3時間）
            </span>
            <div
              role="group"
              aria-label="判定時刻"
              style={{
                display: "grid",
                gridTemplateColumns: isWideLayout ? "1fr" : "repeat(4, minmax(68px, 1fr))",
                gap: isWideLayout ? 5 : 6,
                minHeight: 0,
              }}
            >
              {THREE_HOUR_SLOTS.map((hour) => {
                const selected = selectedHour === hour;
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => setSelectedHour(hour)}
                    aria-pressed={selected}
                    style={{
                      ...tabStyle(selected),
                      minHeight: isWideLayout ? 36 : 34,
                      width: "100%",
                      borderRadius: 10,
                      padding: isWideLayout ? "5px 10px" : "5px 7px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      background: selected
                        ? "linear-gradient(90deg, rgba(255,84,139,0.28), rgba(151,121,255,0.18))"
                        : "rgba(17,17,17,var(--glass-alpha-strong,0.35))",
                    }}
                  >
                    <strong style={{ fontSize: isWideLayout ? 15 : 13 }}>
                      {pad2(hour)}:00
                    </strong>
                    {isWideLayout && (
                      <span
                        aria-hidden="true"
                        style={{
                          fontSize: 10,
                          color: selected ? "#ffd4e6" : "rgba(255,255,255,0.48)",
                        }}
                      >
                        {selected ? "選択中 ●" : "○"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop
              ? "minmax(0, 1.75fr) minmax(270px, 0.65fr)"
              : "1fr",
            gap: isDesktop ? 8 : 12,
            minWidth: 0,
            gridColumn: isWideLayout ? 2 : undefined,
            gridRow: isWideLayout ? 1 : undefined,
          }}
        >
          <div className="glass glass-strong" style={{ ...tileStyle, padding: isDesktop ? 9 : 11 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 7,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 14 }}>
                🎣 {selectedPoint.shortName}・{pad2(selectedHour)}時の釣行予測
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: marineState.status === "error" ? "#ff93a9" : "rgba(255,255,255,0.56)",
                  whiteSpace: "nowrap",
                }}
              >
                {marineState.status === "loading"
                  ? "海況取得中…"
                  : marineState.status === "error"
                    ? "海況取得不可"
                    : marineState.status !== "ok"
                      ? "海況準備中…"
                      : marineState.source === "fetch"
                        ? "海況 取得"
                        : marineState.isStale
                          ? "海況 期限切れキャッシュ"
                          : "海況 キャッシュ"}
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(3, minmax(128px, 1fr))" : "repeat(3, minmax(0, 1fr))",
                gap: 7,
                overflowX: isMobile ? "auto" : "visible",
                paddingBottom: isMobile ? 3 : 0,
              }}
            >
              <ForecastCard icon="🛟" title="安全度" badge={forecast.safety} />
              <ForecastCard icon="🎣" title="釣りやすさ" badge={forecast.comfort} />
              <ForecastCard icon="🐟" title="釣れそう度" badge={forecast.bite} />
            </div>
            <div
              style={{
                marginTop: 7,
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 12px",
                fontSize: 11,
                color: "rgba(255,255,255,0.69)",
              }}
            >
              <span>沖波 {forecast.marineSummary.waveHeight?.toFixed(1) ?? "-"}m</span>
              <span>周期 {forecast.marineSummary.wavePeriod?.toFixed(1) ?? "-"}秒</span>
              <span>
                うねり {forecast.marineSummary.swellHeight?.toFixed(1) ?? "-"}m / {forecast.marineSummary.swellPeriod?.toFixed(1) ?? "-"}秒
              </span>
              <span>波向 {directionLabel(forecast.marineSummary.waveDirection)}</span>
              <span>水温 {forecast.marineSummary.seaSurfaceTemperature?.toFixed(1) ?? "-"}℃</span>
              <span style={{ color: "#ffd0e4" }}>
                地点への影響 {forecast.marineSummary.impactLabel}
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.48)" }}>
              {forecast.marineSummary.impactDetail}。{selectedPoint.note}。
              数値は静岡沿岸沖の予報で、岸際・港内の実波高ではありません。
            </div>
          </div>

          <div
            className="glass glass-strong"
            style={{
              ...tileStyle,
              padding: 9,
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(145px, 1fr))"
                : "1fr",
              alignContent: "center",
              gap: 7,
              overflowX: isMobile ? "auto" : "visible",
            }}
          >
            <button
              type="button"
              onClick={() =>
                openExternalInfo(SHIZUOKA_COAST_CAMERA_URL, "tsuduriCoastCamera")
              }
              style={{
                ...tabStyle(false),
                minHeight: 48,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, rgba(43,155,213,0.28), rgba(20,52,91,0.52))",
              }}
            >
              📹 静岡海岸ライブカメラ ↗
            </button>
            <button
              type="button"
              onClick={() =>
                openExternalInfo(SHIMIZU_NOWPHAS_URL, "tsuduriShimizuNowphas")
              }
              style={{
                ...tabStyle(false),
                minHeight: 48,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, rgba(95,105,220,0.28), rgba(22,51,104,0.52))",
              }}
            >
              🌊 清水港NOWPHAS ↗
            </button>
          </div>
        </div>

        <div
          style={{
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: isDesktop ? "minmax(270px, 0.52fr) minmax(0, 1.78fr)" : "1fr",
            gap: isDesktop ? 8 : 12,
            gridColumn: isWideLayout ? 2 : undefined,
            gridRow: isWideLayout ? 2 : undefined,
          }}
        >
          <div
            className="glass glass-strong"
            style={{
              ...tileStyle,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "8px 10px",
                marginBottom: 7,
                borderRadius: 12,
                background: "linear-gradient(90deg, rgba(151,121,255,0.18), rgba(91,209,255,0.12))",
                border: "1px solid rgba(125,205,255,0.20)",
                color: "#78d9ff",
                textAlign: "center",
                fontSize: 15,
                fontWeight: 950,
              }}
            >
              🌙 潮名：{tideState.status === "ok" ? tideState.tideName ?? "未取得" : "-"}
            </div>
            <div style={{ fontWeight: 950, marginBottom: 6, fontSize: 16, textAlign: "center" }}>
              🟡 満潮 / 🔵 干潮
            </div>

            {tideState.status !== "ok" ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                {tideState.status === "error" ? "潮位を取得できなかったよ" : "データ準備中…"}
              </div>
            ) : extremes.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                潮位の極値データがないよ
              </div>
            ) : (
              <div style={{ display: "grid", gap: 5 }}>
                {extremes.map((extreme) => {
                  const high = extreme.kind === "high";
                  return (
                    <div
                      key={`${extreme.kind}-${extreme.min}-${extreme.cm}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr auto",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 11,
                        background: high
                          ? "linear-gradient(90deg, rgba(255,193,111,0.18), rgba(255,126,182,0.08))"
                          : "linear-gradient(90deg, rgba(91,209,255,0.18), rgba(151,121,255,0.08))",
                        border: `1px solid ${high ? "rgba(255,207,132,0.22)" : "rgba(106,218,255,0.22)"}`,
                        fontSize: 14,
                        fontWeight: 850,
                      }}
                    >
                      <span>{high ? "🟡 満潮" : "🔵 干潮"}</span>
                      <span style={{ fontSize: 18 }}>{formatHMFromMinutes(extreme.min)}</span>
                      <span style={{ color: "rgba(255,255,255,0.66)" }}>{Math.round(extreme.cm)}cm</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                marginTop: 10,
                padding: "16px 15px 17px",
                borderRadius: 14,
                background:
                  "linear-gradient(145deg, rgba(255,177,74,0.18), rgba(255,105,174,0.12) 48%, rgba(83,211,255,0.14))",
                border: "1px solid rgba(255,255,255,0.14)",
                flex: "1 1 auto",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-evenly",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <strong style={{ fontSize: 19 }}>
                  🌤️ {pad2(selectedHour)}時の天気
                </strong>
                {weatherState.status === "ok" && (
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                    {weatherState.summary.label}
                  </span>
                )}
              </div>
              {weatherState.status === "ok" && selectedWeather ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "82px minmax(0, 1fr)",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 14,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: 72,
                        lineHeight: 1,
                        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.22))",
                      }}
                    >
                      {wmoToIcon(selectedWeather.weatherCode)}
                    </span>
                    <strong
                      style={{
                        fontSize: 30,
                        lineHeight: 1.1,
                        color: "#fff",
                      }}
                    >
                      {wmoToJa(selectedWeather.weatherCode)}
                    </strong>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 9,
                    }}
                  >
                    <div style={{ padding: "11px 10px", borderRadius: 11, background: "rgba(255,255,255,0.07)" }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>気温</div>
                      <strong style={{ fontSize: 18 }}>🌡️ {selectedWeather.temp}℃</strong>
                    </div>
                    <div style={{ padding: "11px 10px", borderRadius: 11, background: "rgba(83,211,255,0.09)" }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>時間雨量</div>
                      <strong style={{ fontSize: 18, color: "#9ee8ff" }}>☔ {selectedWeather.precipitation.toFixed(1)}mm/h</strong>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>一日合計 {weatherState.summary.rainSum}mm</div>
                    </div>
                    <div style={{ gridColumn: "1 / -1", padding: "11px 10px", borderRadius: 11, background: "rgba(255,105,174,0.08)" }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>選択時刻の風 / 日最大風速</div>
                      <strong style={{ fontSize: 18, color: "#ffd0e4" }}>
                        🍃 {directionLabel(selectedWeather.windDirection)} {selectedWeather.windSpeed}m/s / 最大 {weatherState.summary.windMax}m/s
                      </strong>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: "16px 4px", fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
                  {weatherState.status === "error"
                    ? "天気概況を取得できなかったよ"
                    : "天気概況を準備中…"}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 8,
                paddingTop: 7,
                borderTop: "1px solid rgba(255,255,255,0.10)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 6,
                fontSize: 10,
                color: "rgba(255,255,255,0.58)",
              }}
            >
              <span>📅 {targetDate.toLocaleDateString()}</span>
              <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                {weatherState.status === "ok" && (
                  <span style={{ color: "#76dcff" }}>
                    🌤️ {selectedPoint.shortName}・JMA {weatherState.source === "fetch" ? "取得" : "キャッシュ"}
                  </span>
                )}
                {tideState.status === "ok" && (() => {
                  const label = sourceLabel(tideState.source, tideState.isStale);
                  return <span style={{ color: label.color }}>🌊 {label.text}</span>;
                })()}
              </span>
            </div>
          </div>

          <div className="glass glass-strong" style={{ ...tileStyle, padding: 9, minHeight: 0 }}>
            <TideGraph
              series={tideState.status === "ok" ? tideState.series : []}
              baseDate={targetDate}
              highlightAt={highlightAt}
              height={isDesktop ? 190 : 170}
              yDomain={{ min: -50, max: 200 }}
            />
            <div
              style={{
                marginTop: 5,
                padding: "7px 9px",
                borderRadius: 14,
                background:
                  "linear-gradient(135deg, rgba(255,105,174,0.12), rgba(127,116,255,0.10) 48%, rgba(83,211,255,0.10))",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 5,
                }}
              >
                <strong style={{ fontSize: 13 }}>🌤️ 3時間ごとの天気・海況</strong>
                {weatherState.status === "ok" && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.58)",
                    }}
                  >
                    {weatherState.summary.overview} / {weatherState.summary.tempMin}〜
                    {weatherState.summary.tempMax}℃
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isDesktop
                    ? "repeat(8, minmax(66px, 1fr))"
                    : "repeat(8, minmax(82px, 1fr))",
                  gap: 5,
                  overflowX: "auto",
                  paddingBottom: 2,
                }}
              >
                {THREE_HOUR_SLOTS.map((hour) => {
                  const weather =
                    weatherState.status === "ok"
                      ? weatherState.hours.find((item) => item.hour === hour)
                      : undefined;
                  const marine = marineThreeHourly.find((item) => item.hour === hour);
                  const selected = selectedHour === hour;
                  return (
                    <button
                      key={hour}
                      onClick={() => setSelectedHour(hour)}
                      title="この時間を釣行判定に使う"
                      style={{
                        minWidth: 0,
                        padding: "5px 3px",
                        borderRadius: 10,
                        textAlign: "center",
                        color: "#fff",
                        cursor: "pointer",
                        background: selected
                          ? "rgba(255,84,139,0.20)"
                          : "rgba(12,18,38,0.28)",
                        border: selected
                          ? "2px solid #ff6598"
                          : "1px solid rgba(255,255,255,0.09)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 950,
                          color: selected ? "#ffd4e6" : "#ffd4ed",
                        }}
                      >
                        {pad2(hour)}時
                      </div>
                      <div style={{ fontSize: 17, lineHeight: 1.2 }}>
                        {weather ? wmoToIcon(weather.weatherCode) : "・"}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 850 }}>
                        {weather ? `${weather.temp}℃` : "-℃"}
                      </div>
                      <div style={{ fontSize: 9, color: "#82ddff", whiteSpace: "nowrap" }}>
                        ☔ {weather ? `${weather.precipitation.toFixed(1)}mm` : "-"}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "rgba(255,255,255,0.68)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {weather
                          ? `${directionLabel(weather.windDirection)} ${weather.windSpeed}m`
                          : "風 -"}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 9,
                          color:
                            marine?.waveHeight != null
                              ? "#ffc0dc"
                              : "rgba(255,255,255,0.46)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        🌊 {marine?.waveHeight != null ? `${marine.waveHeight.toFixed(1)}m` : "-"}
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          color: "rgba(255,255,255,0.55)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {marine?.wavePeriod != null
                          ? `${marine.wavePeriod.toFixed(1)}秒`
                          : "周期 -"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div
          className="glass glass-strong"
          style={{
            ...tileStyle,
            minHeight: 0,
            padding: 9,
            gridColumn: isWideLayout ? 1 : undefined,
            gridRow: isWideLayout ? "1 / 4" : undefined,
            display: "none",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "8px 9px",
              borderRadius: 13,
              background:
                "linear-gradient(135deg, rgba(255,105,174,0.15), rgba(127,116,255,0.12) 48%, rgba(83,211,255,0.12))",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 950, marginBottom: 6 }}>
              🌤️ 天気概況
            </div>
            {weatherState.status === "ok" ? (
              <div style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: 18, color: "#fff" }}>
                  {weatherState.summary.overview}
                </strong>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.76)" }}>
                  🌡 {weatherState.summary.tempMin}〜{weatherState.summary.tempMax}℃
                </span>
                <span style={{ fontSize: 11, color: "#83ddff" }}>
                  ☔ 一日合計 {weatherState.summary.rainSum}mm
                </span>
                <span style={{ fontSize: 11, color: "#ffd0e4" }}>
                  🍃 最大 {weatherState.summary.windMax}m/s
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                {weatherState.status === "error"
                  ? "天気概況を取得できなかったよ"
                  : "天気概況を準備中…"}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 8,
              marginBottom: 6,
              fontSize: 12,
              fontWeight: 950,
            }}
          >
            🕒 3時間ごとの天気・海況
          </div>
          <div
            style={{
              minHeight: 0,
              overflowY: isWideLayout ? "auto" : "visible",
              overflowX: isWideLayout ? "hidden" : "auto",
              display: "grid",
              gridTemplateColumns: isWideLayout
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(8, minmax(82px, 1fr))",
              alignContent: "start",
              gap: 5,
              paddingRight: isWideLayout ? 2 : 0,
              paddingBottom: 2,
            }}
          >
            {THREE_HOUR_SLOTS.map((hour) => {
              const weather =
                weatherState.status === "ok"
                  ? weatherState.hours.find((item) => item.hour === hour)
                  : undefined;
              const marine = marineThreeHourly.find((item) => item.hour === hour);
              const selected = selectedHour === hour;
              return (
                <button
                  key={hour}
                  onClick={() => setSelectedHour(hour)}
                  title="この時間を釣行判定に使う"
                  style={{
                    minWidth: 0,
                    padding: "6px 3px",
                    borderRadius: 10,
                    textAlign: "center",
                    color: "#fff",
                    cursor: "pointer",
                    background: selected
                      ? "rgba(255,84,139,0.20)"
                      : "rgba(12,18,38,0.28)",
                    border: selected
                      ? "2px solid #ff6598"
                      : "1px solid rgba(255,255,255,0.09)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 950,
                      color: selected ? "#ffd4e6" : "#ffd4ed",
                    }}
                  >
                    {pad2(hour)}時
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1.2 }}>
                    {weather ? wmoToIcon(weather.weatherCode) : "・"}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 850 }}>
                    {weather ? `${weather.temp}℃` : "-℃"}
                  </div>
                  <div style={{ fontSize: 9, color: "#82ddff", whiteSpace: "nowrap" }}>
                    ☔ {weather ? `${weather.precipitation.toFixed(1)}mm` : "-"}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.68)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {weather
                      ? `${directionLabel(weather.windDirection)} ${weather.windSpeed}m`
                      : "風 -"}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 9,
                      color:
                        marine?.waveHeight != null
                          ? "#ffc0dc"
                          : "rgba(255,255,255,0.46)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🌊 {marine?.waveHeight != null ? `${marine.waveHeight.toFixed(1)}m` : "-"}
                  </div>
                  <div
                    style={{
                      fontSize: 8,
                      color: "rgba(255,255,255,0.55)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {marine?.wavePeriod != null
                      ? `${marine.wavePeriod.toFixed(1)}秒`
                      : "周期 -"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

    </PageShell>
  );
}
