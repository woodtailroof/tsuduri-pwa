// src/screens/Weather.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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

export default function Weather({ back }: Props) {
  const { settings } = useAppSettings();

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // ✅ PageShell と同じ変数名で統一（.glass 系が参照）
  const glassVars = {
    "--glass-alpha": String(clamp(settings.glassAlpha ?? 0.22, 0, 0.6)),
    "--glass-blur": `${clamp(settings.glassBlur ?? 10, 0, 40)}px`,
  } as unknown as CSSProperties;

  const [tab, setTab] = useState<"today" | "tomorrow" | "pick">("today");
  const [picked, setPicked] = useState<string>(toDateInputValue(new Date()));

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [state, setState] = useState<LoadState>({ status: "idle" });

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
        fontSize: "clamp(20px, 3.2vw, 32px)",
        lineHeight: 1.15,
      }}
    >
      ☀️ 天気・潮を見る
    </h1>
  );

  const subtitleNode = (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
      🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
      {!online && (
        <span style={{ marginLeft: 10, color: "#f6c" }}>📴 オフライン</span>
      )}
    </div>
  );

  // ✅ 「履歴をみる」方式：PCは PageShell のヘッダー分を引いて中身を固定
  const DESKTOP_CHROME_PX = 104;

  const pillBtnStyle: CSSProperties = {
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.24)",
    color: "rgba(255,255,255,0.78)",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
  };

  const pillBtnActive: CSSProperties = {
    ...pillBtnStyle,
    border: "2px solid #ff4d6d",
    background: "rgba(255,77,109,0.18)",
    color: "#fff",
  };

  const selectStyle: CSSProperties = {
    background: "rgba(0,0,0,0.24)",
    color: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 12,
    padding: "6px 10px",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
  };

  const statusNode = (() => {
    if (state.status === "loading")
      return (
        <div style={{ fontSize: 12, color: "#0a6" }}>🌊 tide736：取得中…</div>
      );
    if (state.status === "error")
      return (
        <div style={{ fontSize: 12, color: "#ff7a7a" }}>
          🌊 tide736：取得失敗 → {state.message}
        </div>
      );
    if (state.status === "ok") {
      const lab = sourceLabel(state.source, state.isStale);
      return (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
            📅 {targetDate.toLocaleDateString()}
          </div>
          {lab && (
            <div
              style={{ fontSize: 11, color: lab.color, whiteSpace: "nowrap" }}
              title="tide736取得元"
            >
              🌊 {lab.text}
            </div>
          )}
          {state.tideName ? (
            <div style={{ fontSize: 12, color: "#6cf" }}>
              🌙 {state.tideName}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              🌙 潮名（未取得）
            </div>
          )}
        </div>
      );
    }
    return null;
  })();

  const TabBar = (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setTab("today")}
        style={tab === "today" ? pillBtnActive : pillBtnStyle}
      >
        今日
      </button>
      <button
        type="button"
        onClick={() => setTab("tomorrow")}
        style={tab === "tomorrow" ? pillBtnActive : pillBtnStyle}
      >
        明日
      </button>
      <button
        type="button"
        onClick={() => setTab("pick")}
        style={tab === "pick" ? pillBtnActive : pillBtnStyle}
      >
        日付指定
      </button>

      {tab === "pick" && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          📅
          <input
            type="date"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            style={selectStyle}
          />
        </label>
      )}
    </div>
  );

  const ExtremesCard = (
    <div
      className="glass glass-strong"
      style={{
        borderRadius: 16,
        padding: 12,
        display: "grid",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 13 }}>🟡 満潮 / 🔵 干潮</div>

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
          <div style={{ color: "rgba(255,255,255,0.72)" }}>
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
          <div style={{ color: "rgba(255,255,255,0.72)" }}>
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

      {state.status === "ok" && !state.tideName && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          ※潮名（大潮など）が未取得のキャッシュです（TTL切れで再取得されたタイミングで入ります）
        </div>
      )}

      {state.status === "ok" && (
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.50)",
            overflowWrap: "anywhere",
          }}
        >
          key: {FIXED_PORT.pc}:{FIXED_PORT.hc}:{state.dayKey}
        </div>
      )}
    </div>
  );

  return (
    <PageShell
      title={isDesktop ? undefined : titleNode}
      subtitle={isDesktop ? undefined : subtitleNode}
      maxWidth={1400}
      showBack
      onBack={back}
      scrollY={isDesktop ? "hidden" : "auto"}
    >
      <div
        style={{
          ...glassVars,
          overflowX: "clip",
          maxWidth: "100vw",
          minHeight: 0,

          height: isDesktop
            ? `calc(100dvh - ${DESKTOP_CHROME_PX}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`
            : "auto",

          paddingBottom: isDesktop ? 8 : 0,
        }}
      >
        {isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              {titleNode}
              {subtitleNode}
              {TabBar}
              {statusNode}
            </div>

            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 12,
                minHeight: 340,
                overflow: "hidden",
                display: "grid",
                alignItems: "center",
              }}
            >
              <TideGraph
                series={state.status === "ok" ? state.series : []}
                baseDate={targetDate}
                highlightAt={highlightAt}
                yDomain={{ min: -50, max: 200 }}
              />
            </div>

            {ExtremesCard}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(280px, 420px) minmax(520px, 1fr) minmax(300px, 420px)",
              gap: 14,
              alignItems: "start",
              minWidth: 0,
              minHeight: 0,
              height: "100%",
            }}
          >
            {/* 左：タイトル/操作 */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: "auto 1fr",
                gap: 12,
                minWidth: 0,
                minHeight: 0,
                height: "100%",
              }}
            >
              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 16,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                {titleNode}
                {subtitleNode}
                {TabBar}
                {statusNode}
              </div>

              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 16,
                  padding: 12,
                  minHeight: 0,
                  height: "100%",
                  overflow: "hidden",
                  display: "grid",
                  gridTemplateRows: "auto 1fr",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  📌 メモ
                </div>

                <div
                  style={{
                    minHeight: 0,
                    overflowY: "auto",
                    paddingRight: 4,
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.62)",
                    lineHeight: 1.5,
                  }}
                >
                  ・中央のグラフがメイン。右のカードは “読み取り” 用の要約。
                  <br />
                  ・このレイアウトを他画面にも横展開して統一感を作る。
                  <br />
                  ・将来ここに「風/天気（open-meteo）」を入れると、左ペインがそのまま情報棚になるよ。
                </div>
              </div>
            </div>

            {/* 中央：グラフ最大 */}
            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 12,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
                display: "grid",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.14)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "grid",
                  alignItems: "center",
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

            {/* 右：要約/極値 */}
            <div
              style={{
                minWidth: 0,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
                display: "grid",
                gap: 12,
                gridTemplateRows: "auto 1fr",
              }}
            >
              {ExtremesCard}

              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 16,
                  padding: 12,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "grid",
                  gridTemplateRows: "auto 1fr",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13 }}>🧭 状況</div>

                <div
                  style={{
                    minHeight: 0,
                    overflowY: "auto",
                    paddingRight: 4,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.68)",
                    lineHeight: 1.55,
                  }}
                >
                  {state.status === "loading" ? (
                    <div>潮位データを取りに行ってるよ…</div>
                  ) : state.status === "error" ? (
                    <div style={{ color: "#ff7a7a" }}>
                      取得に失敗したよ。オフラインか、API制限の可能性がある…🥲
                      <div style={{ height: 6 }} />
                      {state.message}
                    </div>
                  ) : state.status === "ok" ? (
                    <>
                      <div>
                        ・対象日：<b>{targetDate.toLocaleDateString()}</b>
                      </div>
                      <div>
                        ・潮名：<b>{state.tideName ?? "（未取得）"}</b>
                      </div>
                      <div>
                        ・データ：<b>{state.source}</b>
                        {state.isStale ? "（期限切れ）" : ""}
                      </div>
                      <div style={{ height: 10 }} />
                      <div style={{ color: "rgba(255,255,255,0.55)" }}>
                        ※ここは将来、風向/風速/気温/降水を “読み取りメモ”
                        としてまとめる場所にすると、
                        画面の情報密度が上がって気持ちいい。
                      </div>
                    </>
                  ) : (
                    <div>—</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
