// src/screens/RecordAnalysis.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";
import { db, type TripFish, type TripRecord } from "../db";

type Props = {
  back: () => void;
};

type RowKV = { key: string; value: number; extra?: string };

const TIMEBANDS: Array<TripRecord["timeBand"]> = [
  "morning",
  "day",
  "evening",
  "night",
  "unknown",
];

const TIMEBAND_LABEL: Record<TripRecord["timeBand"], string> = {
  morning: "朝",
  day: "昼",
  evening: "夕",
  night: "夜",
  unknown: "不明",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromISO(iso: string): string | null {
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function safeRate(caught: number, total: number): number {
  if (!Number.isFinite(caught) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return caught / total;
}

function fmtPct(x: number): string {
  const v = Math.round(clamp(x, 0, 1) * 1000) / 10;
  return `${v.toFixed(1)}%`;
}

function fmtN(n: number): string {
  return String(Math.max(0, Math.floor(n)));
}

function normalizeSpecies(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  return s ? s : "不明";
}

type LureType =
  | "metaljig"
  | "minnow"
  | "sinkingpencil"
  | "top"
  | "worm"
  | "blade"
  | "bigbait"
  | "other"
  | "unknown";

const LURE_LABEL: Record<LureType, string> = {
  metaljig: "メタルジグ",
  minnow: "ミノー",
  sinkingpencil: "シンペン",
  top: "トップ",
  worm: "ワーム",
  blade: "ブレード",
  bigbait: "ビッグベイト",
  other: "その他",
  unknown: "不明",
};

function getLureTypeFromFish(fish: TripFish): LureType {
  const v = fish.lureType;
  if (
    v === "metaljig" ||
    v === "minnow" ||
    v === "sinkingpencil" ||
    v === "top" ||
    v === "worm" ||
    v === "blade" ||
    v === "bigbait" ||
    v === "other"
  ) {
    return v;
  }
  return "unknown";
}

type JoinedFish = {
  tripId: number;
  tripCreatedAt: string;
  tripStartedAt: string;
  timeBand: TripRecord["timeBand"];
  tideName: string;
  tidePhase: string;
  tideTrend: string;
  weatherCode: number | null;
  windSpeedMs: number | null;
  waveHeightM: number | null;
  lureType: LureType;

  species: string;
  sizeCm: number | null;
  count: number | null;
};

type JoinedTrip = {
  id: number;
  createdAt: string;
  startedAt: string;
  timeBand: TripRecord["timeBand"];
  outcome: TripRecord["outcome"];
  tideName: string;
  tidePhase: string;
  tideTrend: string;
  weatherCode: number | null;
  windSpeedMs: number | null;
  waveHeightM: number | null;
};

function makeTripMap(trips: Array<TripRecord & { id: number }>) {
  const map = new Map<number, TripRecord & { id: number }>();
  for (const t of trips) map.set(t.id, t);
  return map;
}

function labelNullDash(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s ? s : "—";
}

function labelTrend(v: TripRecord["tideTrend"]): string {
  if (v === "up") return "上げ";
  if (v === "down") return "下げ";
  if (v === "flat") return "止まり";
  return "不明";
}

function sortDescByValue(a: RowKV, b: RowKV) {
  return b.value - a.value;
}

export default function RecordAnalysis({ back }: Props) {
  const { settings } = useAppSettings();

  const glassVars = {
    "--glass-alpha": String(clamp(settings.glassAlpha ?? 0.22, 0, 0.6)),
    "--glass-blur": `${clamp(settings.glassBlur ?? 10, 0, 40)}`,
    "--glass-blur-px": `${clamp(settings.glassBlur ?? 10, 0, 40)}px`,
  } as unknown as CSSProperties;

  const cardStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,calc(var(--glass-alpha,0.22) * 0.40 + 0.02))",
    boxShadow:
      "0 6px 18px rgba(0,0,0,0.16), inset 0 0 0 1px rgba(255,255,255,0.04)",
    backdropFilter: "blur(var(--glass-blur-px,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur-px,10px))",
  };

  const pillStyle: CSSProperties = {
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,calc(var(--glass-alpha,0.22) * 0.45 + 0.08))",
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    backdropFilter: "blur(calc(var(--glass-blur-px,10px) * 0.9))",
    WebkitBackdropFilter: "blur(calc(var(--glass-blur-px,10px) * 0.9))",
  };

  const [loading, setLoading] = useState(false);
  const [trips, setTrips] = useState<Array<TripRecord & { id: number }>>([]);
  const [fish, setFish] = useState<Array<TripFish & { id: number }>>([]);
  const [error, setError] = useState("");
  const [limitTop, setLimitTop] = useState<number>(8);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const t = await db.trips.orderBy("createdAt").reverse().toArray();
      const f = await db.tripFish.orderBy("createdAt").reverse().toArray();
      setTrips(t as Array<TripRecord & { id: number }>);
      setFish(f as Array<TripFish & { id: number }>);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const joinedTrips: JoinedTrip[] = useMemo(() => {
    return trips
      .filter((t) => typeof t.id === "number" && Number.isFinite(t.id))
      .map((t) => ({
        id: t.id as number,
        createdAt: t.createdAt,
        startedAt: t.startedAt,
        timeBand: t.timeBand ?? "unknown",
        outcome: t.outcome ?? "skunk",
        tideName: labelNullDash(t.tideName ?? null),
        tidePhase: labelNullDash(t.tidePhase ?? null),
        tideTrend: labelTrend(t.tideTrend ?? "unknown"),
        weatherCode: typeof t.weatherCode === "number" ? t.weatherCode : null,
        windSpeedMs: typeof t.windSpeedMs === "number" ? t.windSpeedMs : null,
        waveHeightM: typeof t.waveHeightM === "number" ? t.waveHeightM : null,
      }));
  }, [trips]);

  const joinedFish: JoinedFish[] = useMemo(() => {
    const map = makeTripMap(trips as Array<TripRecord & { id: number }>);
    const out: JoinedFish[] = [];

    for (const f of fish) {
      const tripId = f.tripId;
      if (typeof tripId !== "number" || !Number.isFinite(tripId)) continue;

      const t = map.get(tripId);
      if (!t) continue;

      out.push({
        tripId,
        tripCreatedAt: t.createdAt,
        tripStartedAt: t.startedAt,
        timeBand: t.timeBand ?? "unknown",
        tideName: labelNullDash(t.tideName ?? null),
        tidePhase: labelNullDash(t.tidePhase ?? null),
        tideTrend: labelTrend(t.tideTrend ?? "unknown"),
        weatherCode: typeof t.weatherCode === "number" ? t.weatherCode : null,
        windSpeedMs: typeof t.windSpeedMs === "number" ? t.windSpeedMs : null,
        waveHeightM: typeof t.waveHeightM === "number" ? t.waveHeightM : null,
        lureType: getLureTypeFromFish(f),
        species: normalizeSpecies(f.species),
        sizeCm:
          typeof f.sizeCm === "number" && Number.isFinite(f.sizeCm)
            ? f.sizeCm
            : null,
        count:
          typeof f.count === "number" && Number.isFinite(f.count)
            ? f.count
            : null,
      });
    }
    return out;
  }, [trips, fish]);

  const totalTrips = joinedTrips.length;
  const caughtTrips = joinedTrips.filter((t) => t.outcome === "caught").length;

  const topSpecies = useMemo(() => {
    const m = new Map<string, number>();
    for (const jf of joinedFish) {
      const sp = normalizeSpecies(jf.species);
      m.set(sp, (m.get(sp) ?? 0) + 1);
    }
    const rows: RowKV[] = Array.from(m.entries()).map(([key, value]) => ({
      key,
      value,
    }));
    rows.sort(sortDescByValue);
    return rows.slice(0, Math.max(1, limitTop));
  }, [joinedFish, limitTop]);

  const timeBandStats = useMemo(() => {
    const totalBy = new Map<TripRecord["timeBand"], number>();
    const caughtBy = new Map<TripRecord["timeBand"], number>();

    for (const t of joinedTrips) {
      const b = t.timeBand ?? "unknown";
      totalBy.set(b, (totalBy.get(b) ?? 0) + 1);
      if (t.outcome === "caught") {
        caughtBy.set(b, (caughtBy.get(b) ?? 0) + 1);
      }
    }

    const rows = TIMEBANDS.map((b) => {
      const total = totalBy.get(b) ?? 0;
      const caught = caughtBy.get(b) ?? 0;
      return {
        band: b,
        total,
        caught,
        rate: safeRate(caught, total),
      };
    });

    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.rate - a.rate;
    });

    return rows;
  }, [joinedTrips]);

  const tideNameStats = useMemo(() => {
    const totalBy = new Map<string, number>();
    const caughtBy = new Map<string, number>();

    for (const t of joinedTrips) {
      const k = labelNullDash(t.tideName);
      totalBy.set(k, (totalBy.get(k) ?? 0) + 1);
      if (t.outcome === "caught") {
        caughtBy.set(k, (caughtBy.get(k) ?? 0) + 1);
      }
    }

    const rows = Array.from(totalBy.entries()).map(([k, total]) => {
      const caught = caughtBy.get(k) ?? 0;
      return { key: k, total, caught, rate: safeRate(caught, total) };
    });

    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.rate - a.rate;
    });

    return rows.slice(0, Math.max(1, limitTop));
  }, [joinedTrips, limitTop]);

  const speciesByMonth = useMemo(() => {
    const monthMap = new Map<string, Map<string, number>>();

    for (const jf of joinedFish) {
      const mk =
        monthKeyFromISO(jf.tripStartedAt) ?? monthKeyFromISO(jf.tripCreatedAt);
      if (!mk) continue;

      const sp = normalizeSpecies(jf.species);

      if (!monthMap.has(mk)) monthMap.set(mk, new Map<string, number>());
      const inner = monthMap.get(mk)!;
      inner.set(sp, (inner.get(sp) ?? 0) + 1);
    }

    const months = Array.from(monthMap.keys()).sort((a, b) => (a < b ? 1 : -1));
    const out: Array<{
      month: string;
      top: RowKV[];
      totalFish: number;
    }> = [];

    for (const m of months) {
      const inner = monthMap.get(m)!;
      let totalFish = 0;
      const rows: RowKV[] = [];
      for (const [sp, n] of inner.entries()) {
        rows.push({ key: sp, value: n });
        totalFish += n;
      }
      rows.sort(sortDescByValue);
      out.push({
        month: m,
        top: rows.slice(0, Math.max(1, limitTop)),
        totalFish,
      });
    }

    return out;
  }, [joinedFish, limitTop]);

  const lureStats = useMemo(() => {
    const totalBy = new Map<LureType, number>();

    for (const f of joinedFish) {
      const k = f.lureType ?? "unknown";
      totalBy.set(k, (totalBy.get(k) ?? 0) + 1);
    }

    const rows = Array.from(totalBy.entries()).map(([k, total]) => ({
      key: k,
      total,
    }));

    rows.sort((a, b) => b.total - a.total);
    return rows.slice(0, Math.max(1, limitTop));
  }, [joinedFish, limitTop]);

  const hasEnvAny = useMemo(() => {
    return joinedTrips.some(
      (t) =>
        typeof t.weatherCode === "number" ||
        typeof t.windSpeedMs === "number" ||
        typeof t.waveHeightM === "number",
    );
  }, [joinedTrips]);

  return (
    <PageShell
      title={
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(20px, 3.2vw, 32px)",
            lineHeight: 1.15,
          }}
        >
          📊 釣行分析
        </h1>
      }
      titleLayout="left"
      maxWidth={1200}
      showBack
      onBack={back}
      scrollY="auto"
    >
      <div style={{ ...glassVars, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={pillStyle}>🧾 投稿 {fmtN(totalTrips)} 件</span>
          <span style={pillStyle}>
            🎣 釣れた {fmtN(caughtTrips)} 件 /{" "}
            {fmtPct(safeRate(caughtTrips, totalTrips))}
          </span>

          <button
            type="button"
            onClick={reload}
            disabled={loading}
            style={{
              ...pillStyle,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.55 : 1,
            }}
            title="DBから再読み込み"
          >
            {loading ? "読み込み中…" : "↻ 更新"}
          </button>

          <label style={pillStyle} title="上位の表示件数">
            上位
            <select
              value={String(limitTop)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 3 && n <= 20) {
                  setLimitTop(n);
                }
              }}
              style={{ marginLeft: 6 }}
            >
              {[5, 8, 10, 12, 15, 20].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div style={{ ...cardStyle, color: "#ff7a7a" }}>
            読み込みエラー：{error}
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🕒 時間帯別（投稿単位）
          </div>
          <div style={{ height: 8 }} />

          <div style={{ display: "grid", gap: 8 }}>
            {timeBandStats.map((r) => (
              <div
                key={r.band}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div
                  style={{ fontWeight: 800, color: "rgba(255,255,255,0.90)" }}
                >
                  {TIMEBAND_LABEL[r.band]}
                </div>

                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    background:
                      "rgba(255,255,255,calc(var(--glass-alpha,0.22) * 0.22 + 0.04))",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  title={`釣れた率 ${fmtPct(r.rate)}（釣れた${r.caught}/総数${r.total}）`}
                >
                  <div
                    style={{
                      width: `${Math.round(r.rate * 100)}%`,
                      height: "100%",
                      background: "rgba(255,77,109,0.78)",
                    }}
                  />
                </div>

                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
                  {fmtPct(r.rate)}（{fmtN(r.caught)}/{fmtN(r.total)}）
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※「釣れた/釣れなかった」は TripRecord.outcome 基準（投稿単位）
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🌙 潮名別（投稿単位）
          </div>
          <div style={{ height: 8 }} />

          {tideNameStats.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              データがまだ無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {tideNameStats.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 800, minWidth: 0 }}>{r.key}</div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background:
                        "rgba(255,255,255,calc(var(--glass-alpha,0.22) * 0.22 + 0.04))",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                    title={`釣れた率 ${fmtPct(r.rate)}（釣れた${r.caught}/総数${r.total}）`}
                  >
                    <div
                      style={{
                        width: `${Math.round(r.rate * 100)}%`,
                        height: "100%",
                        background: "rgba(102,204,255,0.80)",
                      }}
                    />
                  </div>

                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}
                  >
                    {fmtPct(r.rate)}（{fmtN(r.caught)}/{fmtN(r.total)}）
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※潮名は Record保存時点のスナップショット
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🐟 魚種トップ（魚=1行）
          </div>
          <div style={{ height: 8 }} />

          {topSpecies.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだ「釣れた」の魚データが無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {topSpecies.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{r.key}</div>
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}
                  >
                    {fmtN(r.value)} 件
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※1投稿で複数魚が入る想定なので、投稿数とは一致しないよ
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🗓 月別 × 魚種（上位）
          </div>
          <div style={{ height: 8 }} />

          {speciesByMonth.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだ魚データが無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {speciesByMonth.map((m) => (
                <div
                  key={m.month}
                  style={{
                    borderRadius: 14,
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background:
                      "rgba(0,0,0,calc(var(--glass-alpha,0.22) * 0.26 + 0.03))",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{m.month}</div>
                    <div
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                    >
                      魚データ {fmtN(m.totalFish)} 件
                    </div>
                  </div>

                  <div style={{ height: 8 }} />
                  <div style={{ display: "grid", gap: 6 }}>
                    {m.top.map((r) => (
                      <div
                        key={`${m.month}:${r.key}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{r.key}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          {fmtN(r.value)} 件
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※月は Trip.startedAt（基準時刻）優先。無い場合は createdAt を使うよ
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🧲 ルアージャンル別（魚単位）
          </div>
          <div style={{ height: 8 }} />

          {lureStats.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだルアーデータが無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {lureStats.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {LURE_LABEL[r.key as LureType] ?? "不明"}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}
                  >
                    {fmtN(r.total)} 件
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>🌦 天気・風・波</div>
          <div style={{ height: 8 }} />

          {hasEnvAny ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
              すでに env 値が入ってる投稿があるよ（次はここを本格集計できる）✅
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
              まだ未実装なので、ここは “保存の仕組み” が入ったら一気に育つ🌱
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※天気は保存時点でスナップショット化するのが安全
          </div>
        </div>

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
          データ量が少ないうちはブレるけど、週1〜2のペースなら “3か月”
          くらいで偏りが見え始めるよ🎣✨
        </div>
      </div>
    </PageShell>
  );
}
