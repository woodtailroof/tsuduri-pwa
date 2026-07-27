// src/screens/Weather.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { FIXED_PORT } from "../points";
import TideGraph from "../components/TideGraph";
import {
  getTide736DayCached,
  type TideCacheSource,
  dayKey as dayKeyFromDate,
} from "../lib/tide736Cache";
import type { TidePoint } from "../db";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";
import { decideWeatherEmotion } from "../lib/emotionDeciders/weatherEmotion";
import { useEmotion } from "../lib/emotion";

type Props = {
  back: () => void;
  isActive?: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
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

function parseDateInputValue(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatHMFromMinutes(totalMin: number) {
  const m = clamp(Math.round(totalMin), 0, 1440);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(h)}:${pad2(mm)}`;
}

/**
 * TideGraph と同じ思想：time(HH:mm) 優先、unixはfallback
 */
function toMinutes(p: TidePoint): number | null {
  if (p.time) {
    const [hh, mm] = p.time.split(":").map((v) => Number(v));
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
  }
  if (typeof p.unix === "number") {
    const ms = p.unix < 1e12 ? p.unix * 1000 : p.unix;
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}

type Pt = { min: number; cm: number };
type TideExtreme = { kind: "high" | "low"; min: number; cm: number };

function extractExtremesBySlope(series: TidePoint[]): TideExtreme[] {
  const pts: Pt[] = [];
  for (const p of series) {
    const m = toMinutes(p);
    if (m == null) continue;
    pts.push({ min: clamp(m, 0, 1440), cm: p.cm });
  }
  if (pts.length < 3) return [];

  pts.sort((a, b) => a.min - b.min);

  const uniq: Pt[] = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (last && last.min === p.min) uniq[uniq.length - 1] = p;
    else uniq.push(p);
  }

  if (uniq.length >= 2) {
    const first = uniq[0];
    const last = uniq[uniq.length - 1];
    if (first.min > 0) uniq.unshift({ min: 0, cm: first.cm });
    if (last.min < 1440) uniq.push({ min: 1440, cm: last.cm });
  }

  const EPS_CM = 1;
  const raw: TideExtreme[] = [];
  let prevSlope = 0;

  for (let i = 1; i < uniq.length; i++) {
    const d = uniq[i].cm - uniq[i - 1].cm;
    const slope = Math.abs(d) <= EPS_CM ? 0 : d > 0 ? 1 : -1;

    if (i >= 2) {
      const a = prevSlope;
      const b = slope;
      const mid = uniq[i - 1];
      if (a > 0 && b < 0) {
        raw.push({ kind: "high", min: mid.min, cm: mid.cm });
      } else if (a < 0 && b > 0) {
        raw.push({ kind: "low", min: mid.min, cm: mid.cm });
      }
    }

    if (slope !== 0) prevSlope = slope;
  }

  const MERGE_MIN = 5;
  const merged: TideExtreme[] = [];
  for (const e of raw) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === e.kind &&
      Math.abs(e.min - last.min) <= MERGE_MIN
    ) {
      const pick =
        e.kind === "high"
          ? e.cm >= last.cm
            ? e
            : last
          : e.cm <= last.cm
            ? e
            : last;
      merged[merged.length - 1] = pick;
    } else {
      merged.push(e);
    }
  }

  const highs = merged
    .filter((e) => e.kind === "high")
    .sort((a, b) => a.min - b.min)
    .slice(0, 2);

  const lows = merged
    .filter((e) => e.kind === "low")
    .sort((a, b) => a.min - b.min)
    .slice(0, 2);

  return [...highs, ...lows].sort((a, b) => a.min - b.min);
}

function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
  if (!source) return null;
  if (source === "fetch") return { text: "取得", color: "#0a6" };
  if (source === "cache") return { text: "キャッシュ", color: "#6cf" };
  return {
    text: isStale ? "期限切れキャッシュ" : "キャッシュ",
    color: "#f6c",
  };
}

type WeatherSummary = {
  label: string;
  overview: string;
  tempMin: number;
  tempMax: number;
  windMax: number;
  gustMax: number;
  rainProbMax: number;
  rainSum: number;
};

type WeatherHour = {
  hour: number;
  weatherCode: number;
  temp: number;
  rainProb: number;
  windSpeed: number;
  windDirection: number;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
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
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      dayKey: string;
      summary: WeatherSummary;
      hours: WeatherHour[];
      source: "fetch" | "cache";
    }
  | { status: "error"; message: string };

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const mq = window.matchMedia("(max-width: 820px)");
    const coarse = window.matchMedia("(pointer: coarse)");
    return mq.matches || coarse.matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 820px)");
    const coarse = window.matchMedia("(pointer: coarse)");

    const onChange = () => setIsMobile(mq.matches || coarse.matches);

    mq.addEventListener?.("change", onChange);
    coarse.addEventListener?.("change", onChange);
    window.addEventListener("orientationchange", onChange);

    return () => {
      mq.removeEventListener?.("change", onChange);
      coarse.removeEventListener?.("change", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return isMobile;
}

const YAIZU = { lat: 34.868, lon: 138.3236 };

const WEATHER_CACHE_PREFIX = "tsuduri_openmeteo_daily_v1:";
const WEATHER_TTL_MS = 10 * 60 * 1000;

function wmoToJa(code: number): string {
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

function wmoToIcon(code: number): string {
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

function windDirectionLabel(deg: number): string {
  if (!Number.isFinite(deg)) return "-";
  const labels = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  return labels[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function safeNumber(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchOpenMeteoDaily(lat: number, lon: number) {
  const tz = "Asia/Tokyo";
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max` +
    `&hourly=weather_code,temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m` +
    `&forecast_days=16` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&wind_speed_unit=ms`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const head = (text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (res.status === 429) {
      throw new Error(`openmeteo_rate_limited_429${head ? `:${head}` : ""}`);
    }
    throw new Error(`openmeteo_http_${res.status}${head ? `:${head}` : ""}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`openmeteo_json_parse_failed:${text.slice(0, 160)}`);
  }
  return json;
}

function pickDailySummary(json: any, day: string): WeatherSummary | null {
  const d = json?.daily;
  const times: string[] = Array.isArray(d?.time) ? d.time : [];
  const idx = times.findIndex((t) => typeof t === "string" && t === day);
  if (idx < 0) return null;

  const code = safeNumber(d?.weather_code?.[idx], NaN);
  const tmax = safeNumber(d?.temperature_2m_max?.[idx], 0);
  const tmin = safeNumber(d?.temperature_2m_min?.[idx], 0);
  const pop = safeNumber(d?.precipitation_probability_max?.[idx], 0);
  const psum = safeNumber(d?.precipitation_sum?.[idx], 0);
  const wmax = safeNumber(d?.wind_speed_10m_max?.[idx], 0);
  const gmax = safeNumber(d?.wind_gusts_10m_max?.[idx], 0);

  return {
    label: day,
    overview: wmoToJa(code),
    tempMin: Math.round(tmin * 10) / 10,
    tempMax: Math.round(tmax * 10) / 10,
    windMax: Math.round(wmax * 10) / 10,
    gustMax: Math.round(gmax * 10) / 10,
    rainProbMax: Math.round(pop),
    rainSum: Math.round(psum * 10) / 10,
  };
}

function pickHourlyWeather(json: any, day: string): WeatherHour[] {
  const h = json?.hourly;
  const times: string[] = Array.isArray(h?.time) ? h.time : [];
  const result: WeatherHour[] = [];

  for (let hour = 0; hour < 24; hour += 3) {
    const idx = times.findIndex((t) => t === `${day}T${pad2(hour)}:00`);
    if (idx < 0) continue;
    result.push({
      hour,
      weatherCode: safeNumber(h?.weather_code?.[idx], NaN),
      temp: Math.round(safeNumber(h?.temperature_2m?.[idx], 0) * 10) / 10,
      rainProb: Math.round(safeNumber(h?.precipitation_probability?.[idx], 0)),
      windSpeed: Math.round(safeNumber(h?.wind_speed_10m?.[idx], 0) * 10) / 10,
      windDirection: Math.round(safeNumber(h?.wind_direction_10m?.[idx], 0)),
    });
  }

  return result;
}

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function loadWeatherCache(
  day: string,
): { ts: number; summary: WeatherSummary; hours: WeatherHour[] } | null {
  try {
    const raw = localStorage.getItem(`${WEATHER_CACHE_PREFIX}${day}`);
    if (!raw) return null;
    const obj = JSON.parse(raw) as any;
    if (!obj || typeof obj !== "object") return null;
    const ts = safeNumber(obj.ts, 0);
    const s = obj.summary;
    if (!s || typeof s !== "object") return null;

    const summary: WeatherSummary = {
      label: String(s.label ?? day),
      overview: String(s.overview ?? "不明"),
      tempMin: safeNumber(s.tempMin, 0),
      tempMax: safeNumber(s.tempMax, 0),
      windMax: safeNumber(s.windMax, 0),
      gustMax: safeNumber(s.gustMax, 0),
      rainProbMax: safeNumber(s.rainProbMax, 0),
      rainSum: safeNumber(s.rainSum, 0),
    };
    const hours: WeatherHour[] = Array.isArray(obj.hours)
      ? obj.hours
          .map((item: any) => ({
            hour: safeNumber(item?.hour, -1),
            weatherCode: safeNumber(item?.weatherCode, NaN),
            temp: safeNumber(item?.temp, 0),
            rainProb: safeNumber(item?.rainProb, 0),
            windSpeed: safeNumber(item?.windSpeed, 0),
            windDirection: safeNumber(item?.windDirection, 0),
          }))
          .filter((item: WeatherHour) => item.hour >= 0 && item.hour < 24)
      : [];
    return { ts, summary, hours };
  } catch {
    return null;
  }
}

function saveWeatherCache(
  day: string,
  summary: WeatherSummary,
  hours: WeatherHour[],
) {
  try {
    localStorage.setItem(
      `${WEATHER_CACHE_PREFIX}${day}`,
      JSON.stringify({ ts: Date.now(), summary, hours }),
    );
  } catch {
    // ignore
  }
}

export default function Weather({ back, isActive = true }: Props) {
  console.log("Weather render");

  useAppSettings();

  const { emitEmotion, clearEmotion } = useEmotion();

  useEffect(() => {
    console.log("Weather mounted");
    return () => {
      console.log("Weather unmounted");
    };
  }, []);

  const onBack = useCallback(() => {
    clearEmotion("weather");
    back();
  }, [clearEmotion, back]);

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  const [tab, setTab] = useState<"today" | "tomorrow" | "pick">("today");
  const [picked, setPicked] = useState<string>(toDateInputValue(new Date()));

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [wState, setWState] = useState<WeatherLoadState>({ status: "idle" });

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  const targetDate = useMemo(() => {
    const now = new Date();
    if (tab === "today") return startOfDay(now);
    if (tab === "tomorrow") {
      const t = startOfDay(now);
      t.setDate(t.getDate() + 1);
      return t;
    }
    const d = parseDateInputValue(picked);
    return d ? startOfDay(d) : startOfDay(now);
  }, [tab, picked]);

  useEffect(() => {
    if (tab !== "pick") return;
    setPicked(toDateInputValue(targetDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const day = dayKeyLocal(targetDate);
      if (!online) {
        const cached = loadWeatherCache(day);
        if (cached) {
          setWState({
            status: "ok",
            dayKey: day,
            summary: cached.summary,
            hours: cached.hours,
            source: "cache",
          });
        } else {
          setWState({ status: "error", message: "offline_no_cache" });
        }
        return;
      }

      setWState({ status: "loading" });

      const cached = loadWeatherCache(day);
      if (cached && Date.now() - cached.ts <= WEATHER_TTL_MS) {
        setWState({
          status: "ok",
          dayKey: day,
          summary: cached.summary,
          hours: cached.hours,
          source: "cache",
        });
        return;
      }

      try {
        const json = await fetchOpenMeteoDaily(YAIZU.lat, YAIZU.lon);
        const summary = pickDailySummary(json, day);
        if (!summary) throw new Error("openmeteo_day_not_in_range");
        const hours = pickHourlyWeather(json, day);

        const now = new Date();
        const today = startOfDay(now);
        const tomorrow = startOfDay(now);
        tomorrow.setDate(today.getDate() + 1);

        const label = sameDay(targetDate, today)
          ? "今日"
          : sameDay(targetDate, tomorrow)
            ? "明日"
            : day;

        const s: WeatherSummary = { ...summary, label };

        saveWeatherCache(day, s, hours);

        if (!cancelled) {
          setWState({
            status: "ok",
            dayKey: day,
            summary: s,
            hours,
            source: "fetch",
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setWState({ status: "error", message: msg });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [targetDate, online]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const res = await getTide736DayCached(
          FIXED_PORT.pc,
          FIXED_PORT.hc,
          targetDate,
          { ttlDays: 30 },
        );
        const dayKey = dayKeyFromDate(targetDate);
        if (!cancelled) {
          setState({
            status: "ok",
            series: res.series ?? [],
            tideName: res.tideName ?? null,
            source: res.source,
            isStale: res.isStale,
            dayKey,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setState({ status: "error", message: msg });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [targetDate]);

  const weatherEmotion = useMemo(() => {
    const overview = wState.status === "ok" ? wState.summary.overview : null;
    const rainProbMax =
      wState.status === "ok" ? wState.summary.rainProbMax : null;
    const windMax = wState.status === "ok" ? wState.summary.windMax : null;
    const gustMax = wState.status === "ok" ? wState.summary.gustMax : null;
    const tideName = state.status === "ok" ? state.tideName : null;

    return decideWeatherEmotion({
      overview,
      rainProbMax,
      windMax,
      gustMax,
      tideName,
    });
  }, [wState, state]);

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

  useEffect(() => {
    return () => {
      clearEmotion("weather");
    };
  }, [clearEmotion]);

  const highlightAt = useMemo(() => {
    const now = new Date();
    if (sameDay(targetDate, now)) return now;
    return null;
  }, [targetDate]);

  const extremes = useMemo(() => {
    if (state.status !== "ok") return [];
    return extractExtremesBySlope(state.series ?? []);
  }, [state]);

  const titleNode = (
    <h1
      style={{
        margin: 0,
        fontSize: "clamp(20px, 5.5vw, 32px)",
        lineHeight: 1.15,
      }}
    >
      ☀️ 天気・潮を見る
    </h1>
  );

  const subNode = (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
      📍 天気：焼津周辺（Open-Meteo） / 🌊 潮汐：{FIXED_PORT.name}（pc:
      {FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
      {!online && (
        <span style={{ marginLeft: 10, color: "#f6c" }}>📴 オフライン</span>
      )}
    </div>
  );

  const tileStyle: CSSProperties = {
    borderRadius: 16,
    padding: isDesktop ? 16 : 12,
    minWidth: 0,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
  };

  const tabBtnBase: CSSProperties = {
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(17,17,17,var(--glass-alpha,0.22))",
    color: "rgba(255,255,255,0.82)",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const tabBtn = (active: boolean): CSSProperties => ({
    ...tabBtnBase,
    border: active ? "2px solid #ff4d6d" : tabBtnBase.border,
    background: active
      ? "rgba(17,17,17,var(--glass-alpha-strong,0.35))"
      : tabBtnBase.background,
    color: active ? "#fff" : tabBtnBase.color,
    boxShadow: active
      ? "0 6px 18px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,77,109,0.22)"
      : "none",
  });

  const dateInputStyle: CSSProperties = {
    background: "rgba(17,17,17,var(--glass-alpha-strong,0.35))",
    color: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 10,
    padding: "6px 10px",
    maxWidth: "100%",
  };

  function weatherSourceText() {
    if (wState.status !== "ok") return null;
    return wState.source === "fetch" ? "取得" : "キャッシュ";
  }

  function weatherStatusBadge() {
    if (wState.status === "loading") return { text: "取得中…", color: "#0a6" };
    if (wState.status === "error") {
      return { text: "取得失敗", color: "#ff7a7a" };
    }
    const src = weatherSourceText();
    return src ? { text: src, color: "#6cf" } : null;
  }

  return (
    <PageShell
      title={titleNode}
      subtitle={subNode}
      titleLayout="left"
      maxWidth={1320}
      showBack
      onBack={onBack}
      scrollY={isDesktop ? "hidden" : "auto"}
      displayExpression={weatherEmotion}
    >
      <div
        style={{
          overflowX: "clip",
          maxWidth: "100%",
          minWidth: 0,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          className="glass glass-strong"
          style={{
            ...tileStyle,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => setTab("today")}
            style={tabBtn(tab === "today")}
          >
            今日
          </button>
          <button
            onClick={() => setTab("tomorrow")}
            style={tabBtn(tab === "tomorrow")}
          >
            明日
          </button>
          <button onClick={() => setTab("pick")} style={tabBtn(tab === "pick")}>
            日付指定
          </button>

          {tab === "pick" && (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              <span style={{ fontSize: 12 }}>📅</span>
              <input
                type="date"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                style={dateInputStyle}
              />
            </label>
          )}
        </div>

        {(wState.status === "loading" || wState.status === "error") && (
          <div
            className="glass glass-strong"
            style={{
              ...tileStyle,
              fontSize: 12,
              color: wState.status === "loading" ? "#0a6" : "#ff7a7a",
            }}
          >
            {wState.status === "loading"
              ? "🌤️ Open-Meteo：取得中…"
              : `🌤️ Open-Meteo：取得失敗 → ${wState.message}`}
          </div>
        )}

        {(state.status === "loading" || state.status === "error") && (
          <div
            className="glass glass-strong"
            style={{
              ...tileStyle,
              fontSize: 12,
              color: state.status === "loading" ? "#0a6" : "#ff7a7a",
            }}
          >
            {state.status === "loading"
              ? "🌊 tide736：取得中…"
              : `🌊 tide736：取得失敗 → ${state.message}`}
          </div>
        )}

        <div
          className="glass glass-strong"
          style={{ ...tileStyle, padding: isDesktop ? "10px 16px" : 12 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              📅 {targetDate.toLocaleDateString()}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {(() => {
                const b = weatherStatusBadge();
                if (!b) return null;
                return (
                  <div
                    style={{
                      fontSize: 11,
                      color: b.color,
                      whiteSpace: "nowrap",
                    }}
                    title="Open-Meteo"
                  >
                    🌤️ {b.text}
                  </div>
                );
              })()}

              {state.status === "ok" &&
                (() => {
                  const lab = sourceLabel(state.source, state.isStale);
                  if (!lab) return null;
                  return (
                    <div
                      style={{
                        fontSize: 11,
                        color: lab.color,
                        whiteSpace: "nowrap",
                      }}
                      title="tide736取得元"
                    >
                      🌊 {lab.text}
                    </div>
                  );
                })()}

              {!online && (
                <div
                  style={{ fontSize: 11, color: "#f6c", whiteSpace: "nowrap" }}
                >
                  📴 オフライン
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 8,
              padding: isDesktop ? "7px 14px" : "8px 10px",
              borderRadius: 12,
              background: "rgba(17,17,17,0.18)",
              fontSize: isDesktop ? 16 : 14,
              fontWeight: 900,
              color: "#6cf",
              textAlign: isDesktop ? "center" : "left",
            }}
          >
            🌙 潮名：
            {state.status === "ok"
              ? state.tideName
                ? ` ${state.tideName}`
                : " （未取得）"
              : " -"}
          </div>

          {state.status === "ok" && !state.tideName && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              ※潮名（大潮など）が未取得のキャッシュです（再取得タイミングで入ります）
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop
              ? "minmax(280px, 0.55fr) minmax(0, 1.75fr)"
              : "1fr",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div className="glass glass-strong" style={tileStyle}>
            <div
              style={{
                fontWeight: 900,
                marginBottom: 10,
                fontSize: isDesktop ? 18 : 16,
                textAlign: isDesktop ? "center" : "left",
              }}
            >
              🟡 満潮 / 🔵 干潮
            </div>

            {state.status !== "ok" ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                データ準備中…
              </div>
            ) : state.series.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                {!online
                  ? "📴 オフラインで、この日のキャッシュが無いよ（オンライン復帰後に取得できる）"
                  : "潮位データが無いよ"}
              </div>
            ) : extremes.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                極値がうまく取れなかったよ（データ不足かも）
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {extremes.map((e) => {
                  const high = e.kind === "high";
                  return (
                    <div
                      key={`${e.kind}-${e.min}-${e.cm}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "72px 1fr auto",
                        alignItems: "center",
                        gap: 8,
                        padding: isDesktop ? "10px 12px" : "9px 10px",
                        borderRadius: 12,
                        color: "rgba(255,255,255,0.94)",
                        fontWeight: 800,
                        background: high
                          ? "linear-gradient(90deg, rgba(255,193,111,0.18), rgba(255,126,182,0.08))"
                          : "linear-gradient(90deg, rgba(91,209,255,0.18), rgba(151,121,255,0.08))",
                        border: `1px solid ${
                          high
                            ? "rgba(255,207,132,0.22)"
                            : "rgba(106,218,255,0.22)"
                        }`,
                        fontSize: isDesktop ? 15 : 14,
                      }}
                    >
                      <span>{high ? "🟡 満潮" : "🔵 干潮"}</span>
                      <span style={{ fontSize: isDesktop ? 19 : 17 }}>
                        {formatHMFromMinutes(e.min)}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.66)" }}>
                        {Math.round(e.cm)}cm
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className="glass glass-strong"
            style={{
              ...tileStyle,
              padding: 10,
              minHeight: 0,
            }}
          >
            <div
              style={{
                opacity: state.status === "loading" ? 0.65 : 1,
                transform:
                  state.status === "loading"
                    ? "translateY(4px)"
                    : "translateY(0px)",
                transition: "opacity 220ms ease, transform 220ms ease",
                willChange: "opacity, transform",
              }}
            >
              <TideGraph
                series={state.status === "ok" ? state.series : []}
                baseDate={targetDate}
                highlightAt={highlightAt}
                height={isDesktop ? 188 : 170}
                yDomain={{ min: -50, max: 200 }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                padding: isDesktop ? "9px 10px" : 10,
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
                  marginBottom: 7,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  🌤️ 3時間ごとの概況
                </div>
                {wState.status === "ok" && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.58)",
                    }}
                  >
                    {wState.summary.overview} / {wState.summary.tempMin}〜
                    {wState.summary.tempMax}℃
                  </div>
                )}
              </div>
              {wState.status !== "ok" ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                  {wState.status === "loading"
                    ? "時間別の天気を取得中…"
                    : "時間別の天気データを取得できなかったよ"}
                </div>
              ) : wState.hours.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                  以前のキャッシュには時間別情報がないため、次回オンライン取得時に表示されます
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isDesktop
                      ? "repeat(8, minmax(68px, 1fr))"
                      : "repeat(8, minmax(78px, 1fr))",
                    gap: 6,
                    overflowX: "auto",
                    paddingBottom: 2,
                  }}
                >
                  {wState.hours.map((hour) => (
                    <div
                      key={hour.hour}
                      title={`${wmoToJa(hour.weatherCode)} / 風向 ${windDirectionLabel(hour.windDirection)}`}
                      style={{
                        minWidth: 0,
                        padding: "6px 4px",
                        borderRadius: 11,
                        textAlign: "center",
                        background: "rgba(12,18,38,0.28)",
                        border: "1px solid rgba(255,255,255,0.09)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#ffd4ed",
                        }}
                      >
                        {pad2(hour.hour)}時
                      </div>
                      <div style={{ fontSize: 19, lineHeight: 1.25 }}>
                        {wmoToIcon(hour.weatherCode)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>
                        {hour.temp}℃
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#82ddff",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ☔ {hour.rainProb}%
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.68)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {windDirectionLabel(hour.windDirection)}{" "}
                        {hour.windSpeed}m
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
