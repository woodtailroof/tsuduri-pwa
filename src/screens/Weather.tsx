// src/screens/Weather.tsx
import {
  useEffect,
  useMemo,
  useRef,
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

type Props = {
  back: () => void;
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
      if (a > 0 && b < 0) raw.push({ kind: "high", min: mid.min, cm: mid.cm });
      else if (a < 0 && b > 0)
        raw.push({ kind: "low", min: mid.min, cm: mid.cm });
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
  return { text: isStale ? "期限切れキャッシュ" : "キャッシュ", color: "#f6c" };
}

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

/**
 * ===== Open-Meteo（日別サマリ）=====
 * - ブラウザから直叩き（Cloudflare経由のIP共有ガチャを避ける）
 * - localStorage 10分キャッシュ
 */
const YAIZU = { lat: 34.868, lon: 138.3236 }; // 焼津周辺固定

type WeatherSummary = {
  label: string; // "今日" / "明日" / "yyyy-mm-dd"
  overview: string; // "晴れ" / "くもり" / "雨" etc.
  tempMin: number;
  tempMax: number;
  windMax: number;
  gustMax: number;
  rainProbMax: number;
  rainSum: number;
};

const WEATHER_CACHE_PREFIX = "tsuduri_openmeteo_daily_v1:";
const WEATHER_TTL_MS = 10 * 60 * 1000;

function wmoToJa(code: number): string {
  // WMO weather interpretation codes（ざっくり日本語）
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
    `&forecast_days=16` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&wind_speed_unit=ms`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const head = (text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (res.status === 429)
      throw new Error(`openmeteo_rate_limited_429${head ? `:${head}` : ""}`);
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

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function loadWeatherCache(
  day: string,
): { ts: number; summary: WeatherSummary } | null {
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
    return { ts, summary };
  } catch {
    return null;
  }
}

function saveWeatherCache(day: string, summary: WeatherSummary) {
  try {
    localStorage.setItem(
      `${WEATHER_CACHE_PREFIX}${day}`,
      JSON.stringify({ ts: Date.now(), summary }),
    );
  } catch {
    // ignore
  }
}

export default function Weather({ back }: Props) {
  useAppSettings();

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  const [tab, setTab] = useState<"today" | "tomorrow" | "pick">("today");
  const [picked, setPicked] = useState<string>(toDateInputValue(new Date()));

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [wState, setWState] = useState<WeatherLoadState>({ status: "idle" });

  // ✅ グラフの「横幅に追従した高さ」を作る（横幅維持しつつアス比を自然に）
  const graphWrapRef = useRef<HTMLDivElement | null>(null);
  const [graphHeight, setGraphHeight] = useState<number>(380);

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

  // ✅ グラフ枠の実寸から「自然な高さ」を決める（16:9 を基準）
  useEffect(() => {
    const el = graphWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const compute = (w: number) => {
      // 16:9 基準（横が広がったら縦も増やす）
      const h = Math.round(w * (9 / 16));
      // 端末差を吸収（小さすぎ/大きすぎを抑制）
      return clamp(h, 300, 560);
    };

    // 初回
    setGraphHeight(compute(el.getBoundingClientRect().width));

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w > 0) setGraphHeight(compute(w));
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [isDesktop]);

  // ===== 天気（Open-Meteo）読み込み =====
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
          source: "cache",
        });
        return;
      }

      try {
        const json = await fetchOpenMeteoDaily(YAIZU.lat, YAIZU.lon);
        const summary = pickDailySummary(json, day);
        if (!summary) throw new Error("openmeteo_day_not_in_range");

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

        saveWeatherCache(day, s);

        if (!cancelled) {
          setWState({ status: "ok", dayKey: day, summary: s, source: "fetch" });
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

  // ===== 潮（tide736）読み込み =====
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

  const highlightAt = useMemo(() => {
    const now = new Date();
    if (sameDay(targetDate, now)) return now;
    return null;
  }, [targetDate]);

  const extremes = useMemo(() => {
    if (state.status !== "ok") return [];
    return extractExtremesBySlope(state.series ?? []);
  }, [state]);

  const highs = extremes.filter((e) => e.kind === "high");
  const lows = extremes.filter((e) => e.kind === "low");

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
    padding: 12,
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
    if (wState.status === "error")
      return { text: "取得失敗", color: "#ff7a7a" };
    const src = weatherSourceText();
    return src ? { text: src, color: "#6cf" } : null;
  }

  return (
    <PageShell
      title={titleNode}
      subtitle={subNode}
      titleLayout="left"
      maxWidth={1100}
      showBack
      onBack={back}
      scrollY="auto"
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
        {/* タブ */}
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

        {/* 天気：ステータス */}
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

        {/* 潮：ステータス */}
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

        {/* サマリー（天気＋潮名） */}
        <div className="glass glass-strong" style={tileStyle}>
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

          {/* 天気サマリー */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              🌤️ 天気（焼津）
            </div>
            {wState.status !== "ok" ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                {wState.status === "loading"
                  ? "データ取得中…"
                  : !online
                    ? "📴 オフラインで天気キャッシュが無いよ（オンライン復帰後に取得できる）"
                    : "天気データが取れなかったよ"}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.88)" }}>
                  🧾 概況：{" "}
                  <span style={{ color: "#fff" }}>
                    {wState.summary.overview}
                  </span>
                  <span
                    style={{ marginLeft: 8, color: "rgba(255,255,255,0.55)" }}
                  >
                    （{wState.summary.label}）
                  </span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.78)" }}>
                  🌡️ 気温：{wState.summary.tempMin}〜{wState.summary.tempMax}℃
                </div>
                <div style={{ color: "rgba(255,255,255,0.78)" }}>
                  🌬️ 風：最大{wState.summary.windMax}（突風
                  {wState.summary.gustMax}）m/s
                </div>
                <div style={{ color: "rgba(255,255,255,0.78)" }}>
                  ☔ 雨：最大{wState.summary.rainProbMax}% / 合計
                  {wState.summary.rainSum}mm
                </div>
              </div>
            )}
          </div>

          {/* 潮名 */}
          <div style={{ marginTop: 12, fontSize: 12, color: "#6cf" }}>
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

        {/* 満潮/干潮 + グラフ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop ? "minmax(280px, 360px) 1fr" : "1fr",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div className="glass glass-strong" style={tileStyle}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
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
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.78)" }}>
                  🟡 満潮：
                  {highs.length ? (
                    highs.map((e, i) => (
                      <span key={`h-${e.min}-${e.cm}`}>
                        {i > 0 ? " / " : " "}
                        {formatHMFromMinutes(e.min)}（{Math.round(e.cm)}cm）
                      </span>
                    ))
                  ) : (
                    <span> -</span>
                  )}
                </div>
                <div style={{ color: "rgba(255,255,255,0.78)" }}>
                  🔵 干潮：
                  {lows.length ? (
                    lows.map((e, i) => (
                      <span key={`l-${e.min}-${e.cm}`}>
                        {i > 0 ? " / " : " "}
                        {formatHMFromMinutes(e.min)}（{Math.round(e.cm)}cm）
                      </span>
                    ))
                  ) : (
                    <span> -</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ✅ ここが本命：横幅はそのまま、実寸に合わせて高さを作る */}
          <div
            ref={graphWrapRef}
            className="glass glass-strong"
            style={{
              ...tileStyle,
              padding: 10,
              minHeight: 0,
              height: graphHeight,
              display: "grid",
              alignItems: "center",
            }}
          >
            <div
              style={{
                height: "100%",
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
                yDomain={{ min: -50, max: 200 }}
              />
            </div>
          </div>
        </div>

        {state.status === "ok" && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.50)",
              overflowWrap: "anywhere",
            }}
          >
            tide key: {FIXED_PORT.pc}:{FIXED_PORT.hc}:{state.dayKey}
          </div>
        )}
        {wState.status === "ok" && (
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.50)",
              overflowWrap: "anywhere",
            }}
          >
            weather key: {YAIZU.lat},{YAIZU.lon}:{wState.dayKey}
          </div>
        )}
      </div>
    </PageShell>
  );
}
