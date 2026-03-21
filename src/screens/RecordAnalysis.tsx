// src/screens/RecordAnalysis.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import PageShell from "../components/PageShell";
import { db, type TripFish, type TripRecord } from "../db";
import { getTimeBand } from "../lib/timeband";

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

const SPECIES_LABEL: Record<string, string> = {
  seabass: "シーバス",
  flounder: "ヒラメ",
  flathead: "マゴチ",
  black_seabream: "クロダイ",
  trevally: "メッキ",
  spanish_mackerel: "サワラ（サゴシ）",
  yellowtail: "ブリ（ワカシ / イナダ / ワラサ）",
  cutlassfish: "タチウオ",
  bass: "ブラックバス",
  catfish: "ナマズ",
  other: "その他",
};

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

type SpeciesInsight = {
  species: string;
  totalCount: number;
  fishRows: number;
  avgSizeCm: number | null;
  bestTimeBand: string;
  bestTimeBandCount: number;
  bestLure: string;
  bestLureCount: number;
  bestTideTrend: string;
  bestTideTrendCount: number;
  timeRows: RowKV[];
  lureRows: RowKV[];
  trendRows: RowKV[];
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

function fmtSizeCm(n: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  const v = Math.round(n * 10) / 10;
  return `${v.toFixed(v % 1 === 0 ? 0 : 1)}cm`;
}

function normalizeSpecies(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "不明";
  return SPECIES_LABEL[s] ?? s;
}

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

function getSafeCount(count: number | null | undefined): number {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return 1;
  }
  return Math.floor(count);
}

function getBestKey(
  rows: RowKV[],
  fallback = "—",
): { key: string; value: number } {
  if (!rows.length) return { key: fallback, value: 0 };
  return { key: rows[0].key, value: rows[0].value };
}

function normalizeTimeBandValue(
  raw: unknown,
  startedAt?: string | null,
): TripRecord["timeBand"] {
  const s = String(raw ?? "").trim();

  if (
    s === "morning" ||
    s === "day" ||
    s === "evening" ||
    s === "night" ||
    s === "unknown"
  ) {
    return s;
  }

  if (s === "朝") return "morning";
  if (s === "昼") return "day";
  if (s === "夕") return "evening";
  if (s === "夜") return "night";
  if (s === "不明") return "unknown";

  if (startedAt) {
    const d = new Date(startedAt);
    if (Number.isFinite(d.getTime())) {
      const band = String(getTimeBand(d)).trim();
      if (
        band === "morning" ||
        band === "day" ||
        band === "evening" ||
        band === "night"
      ) {
        return band;
      }
      if (band === "朝") return "morning";
      if (band === "昼") return "day";
      if (band === "夕") return "evening";
      if (band === "夜") return "night";
    }
  }

  return "unknown";
}

export default function RecordAnalysis({ back }: Props) {
  const [loading, setLoading] = useState(false);
  const [trips, setTrips] = useState<Array<TripRecord & { id: number }>>([]);
  const [fish, setFish] = useState<Array<TripFish & { id: number }>>([]);
  const [error, setError] = useState("");
  const [limitTop, setLimitTop] = useState<number>(8);

  const cardStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 0,
  };

  const pillStyle: CSSProperties = {
    borderRadius: 999,
    padding: "8px 12px",
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    lineHeight: 1.1,
  };

  const subtlePanelStyle: CSSProperties = {
    borderRadius: 14,
    padding: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.12)",
  };

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
        timeBand: normalizeTimeBandValue(t.timeBand, t.startedAt),
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
        timeBand: normalizeTimeBandValue(t.timeBand, t.startedAt),
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
      const count = getSafeCount(jf.count);
      m.set(sp, (m.get(sp) ?? 0) + count);
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
      const count = getSafeCount(jf.count);

      if (!monthMap.has(mk)) monthMap.set(mk, new Map<string, number>());
      const inner = monthMap.get(mk)!;
      inner.set(sp, (inner.get(sp) ?? 0) + count);
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
      const count = getSafeCount(f.count);
      totalBy.set(k, (totalBy.get(k) ?? 0) + count);
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

  const speciesInsights = useMemo(() => {
    const speciesMap = new Map<
      string,
      {
        totalCount: number;
        fishRows: number;
        sizeWeightedSum: number;
        sizeWeight: number;
        timeMap: Map<string, number>;
        lureMap: Map<string, number>;
        trendMap: Map<string, number>;
      }
    >();

    for (const jf of joinedFish) {
      const species = normalizeSpecies(jf.species);
      const count = getSafeCount(jf.count);

      if (!speciesMap.has(species)) {
        speciesMap.set(species, {
          totalCount: 0,
          fishRows: 0,
          sizeWeightedSum: 0,
          sizeWeight: 0,
          timeMap: new Map<string, number>(),
          lureMap: new Map<string, number>(),
          trendMap: new Map<string, number>(),
        });
      }

      const cur = speciesMap.get(species)!;
      cur.totalCount += count;
      cur.fishRows += 1;

      if (
        typeof jf.sizeCm === "number" &&
        Number.isFinite(jf.sizeCm) &&
        jf.sizeCm > 0
      ) {
        cur.sizeWeightedSum += jf.sizeCm * count;
        cur.sizeWeight += count;
      }

      const timeLabel = TIMEBAND_LABEL[jf.timeBand ?? "unknown"] ?? "不明";
      cur.timeMap.set(timeLabel, (cur.timeMap.get(timeLabel) ?? 0) + count);

      const lureLabel = LURE_LABEL[jf.lureType] ?? "不明";
      cur.lureMap.set(lureLabel, (cur.lureMap.get(lureLabel) ?? 0) + count);

      const trendLabel = jf.tideTrend || "不明";
      cur.trendMap.set(trendLabel, (cur.trendMap.get(trendLabel) ?? 0) + count);
    }

    const rows: SpeciesInsight[] = [];

    for (const [species, cur] of speciesMap.entries()) {
      const timeRows: RowKV[] = Array.from(cur.timeMap.entries())
        .map(([key, value]) => ({ key, value }))
        .sort(sortDescByValue);

      const lureRows: RowKV[] = Array.from(cur.lureMap.entries())
        .map(([key, value]) => ({ key, value }))
        .sort(sortDescByValue);

      const trendRows: RowKV[] = Array.from(cur.trendMap.entries())
        .map(([key, value]) => ({ key, value }))
        .sort(sortDescByValue);

      const bestTime = getBestKey(timeRows, "—");
      const bestLure = getBestKey(lureRows, "—");
      const bestTrend = getBestKey(trendRows, "—");

      rows.push({
        species,
        totalCount: cur.totalCount,
        fishRows: cur.fishRows,
        avgSizeCm:
          cur.sizeWeight > 0 ? cur.sizeWeightedSum / cur.sizeWeight : null,
        bestTimeBand: bestTime.key,
        bestTimeBandCount: bestTime.value,
        bestLure: bestLure.key,
        bestLureCount: bestLure.value,
        bestTideTrend: bestTrend.key,
        bestTideTrendCount: bestTrend.value,
        timeRows: timeRows.slice(0, 4),
        lureRows: lureRows.slice(0, 4),
        trendRows: trendRows.slice(0, 4),
      });
    }

    rows.sort((a, b) => b.totalCount - a.totalCount);
    return rows.slice(0, Math.max(1, limitTop));
  }, [joinedFish, limitTop]);

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
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="glass" style={pillStyle}>
            🧾 投稿 {fmtN(totalTrips)} 件
          </span>
          <span className="glass" style={pillStyle}>
            🎣 釣れた {fmtN(caughtTrips)} 件 /{" "}
            {fmtPct(safeRate(caughtTrips, totalTrips))}
          </span>

          <button
            type="button"
            onClick={reload}
            disabled={loading}
            style={{
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.55 : 1,
            }}
            title="DBから再読み込み"
          >
            {loading ? "読み込み中…" : "↻ 更新"}
          </button>

          <label
            className="glass"
            style={{ ...pillStyle, lineHeight: 1 }}
            title="上位の表示件数"
          >
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
          <div
            className="glass-panel strong"
            style={{ ...cardStyle, color: "#ff7a7a" }}
          >
            読み込みエラー：{error}
          </div>
        )}

        <div className="glass-panel strong" style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            🏆 魚種ごとの勝ちパターン
          </div>
          <div style={{ height: 8 }} />

          {speciesInsights.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだ魚データが少ないから、ここはこれから育つよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {speciesInsights.map((row) => (
                <div
                  key={row.species}
                  className="glass"
                  style={subtlePanelStyle}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "baseline",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 15 }}>
                      {row.species}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                    >
                      合計 {fmtN(row.totalCount)}匹 / 平均サイズ{" "}
                      {fmtSizeCm(row.avgSizeCm)}
                    </div>
                  </div>

                  <div style={{ height: 8 }} />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.60)",
                          marginBottom: 4,
                        }}
                      >
                        よく釣れる時間帯
                      </div>
                      <div style={{ fontWeight: 800 }}>
                        {row.bestTimeBand}
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.72)",
                          }}
                        >
                          {fmtN(row.bestTimeBandCount)}匹
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.60)",
                          marginBottom: 4,
                        }}
                      >
                        相性のいいルアー
                      </div>
                      <div style={{ fontWeight: 800 }}>
                        {row.bestLure}
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.72)",
                          }}
                        >
                          {fmtN(row.bestLureCount)}匹
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.60)",
                          marginBottom: 4,
                        }}
                      >
                        強い潮の動き
                      </div>
                      <div style={{ fontWeight: 800 }}>
                        {row.bestTideTrend}
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.72)",
                          }}
                        >
                          {fmtN(row.bestTideTrendCount)}匹
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※「次に何を狙うか」を先に見やすくした要約だよ
          </div>
        </div>

        <div className="glass-panel strong" style={cardStyle}>
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
                    background: "rgba(255,255,255,0.08)",
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

        <div className="glass-panel strong" style={cardStyle}>
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
                      background: "rgba(255,255,255,0.08)",
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

        <div className="glass-panel strong" style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🐟 魚種トップ（魚の数ベース）
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
                    {fmtN(r.value)} 匹
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※count を反映した合計匹数だよ
          </div>
        </div>

        <div className="glass-panel strong" style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>🕒 時間帯 × 魚種</div>
          <div style={{ height: 8 }} />

          {speciesInsights.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだ魚データが無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {speciesInsights.map((row) => (
                <div
                  key={`time:${row.species}`}
                  className="glass"
                  style={subtlePanelStyle}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{row.species}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.70)",
                        fontWeight: 500,
                      }}
                    >
                      合計 {fmtN(row.totalCount)}匹
                    </span>
                  </div>

                  <div style={{ height: 8 }} />
                  <div style={{ display: "grid", gap: 6 }}>
                    {row.timeRows.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.62)",
                        }}
                      >
                        データなし
                      </div>
                    ) : (
                      row.timeRows.map((r) => (
                        <div
                          key={`${row.species}:time:${r.key}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{r.key}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.75)",
                            }}
                          >
                            {fmtN(r.value)} 匹
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※魚種ごとに、どの時間帯で出ているかを見やすくしたよ
          </div>
        </div>

        <div className="glass-panel strong" style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>🧲 ルアー × 魚種</div>
          <div style={{ height: 8 }} />

          {speciesInsights.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだルアーデータが無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {speciesInsights.map((row) => (
                <div
                  key={`lure:${row.species}`}
                  className="glass"
                  style={subtlePanelStyle}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{row.species}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.70)",
                        fontWeight: 500,
                      }}
                    >
                      合計 {fmtN(row.totalCount)}匹
                    </span>
                  </div>

                  <div style={{ height: 8 }} />
                  <div style={{ display: "grid", gap: 6 }}>
                    {row.lureRows.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.62)",
                        }}
                      >
                        データなし
                      </div>
                    ) : (
                      row.lureRows.map((r) => (
                        <div
                          key={`${row.species}:lure:${r.key}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{r.key}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.75)",
                            }}
                          >
                            {fmtN(r.value)} 匹
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※「この魚には何を投げるか」の判断用
          </div>
        </div>

        <div className="glass-panel strong" style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🌊 潮の動き × 魚種
          </div>
          <div style={{ height: 8 }} />

          {speciesInsights.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              まだ潮データが無いよ
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {speciesInsights.map((row) => (
                <div
                  key={`trend:${row.species}`}
                  className="glass"
                  style={subtlePanelStyle}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{row.species}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.70)",
                        fontWeight: 500,
                      }}
                    >
                      合計 {fmtN(row.totalCount)}匹
                    </span>
                  </div>

                  <div style={{ height: 8 }} />
                  <div style={{ display: "grid", gap: 6 }}>
                    {row.trendRows.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.62)",
                        }}
                      >
                        データなし
                      </div>
                    ) : (
                      row.trendRows.map((r) => (
                        <div
                          key={`${row.species}:trend:${r.key}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{r.key}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.75)",
                            }}
                          >
                            {fmtN(r.value)} 匹
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※潮名より実戦寄りの「上げ / 下げ / 止まり」を見やすくしたよ
          </div>
        </div>

        <div className="glass-panel strong" style={cardStyle}>
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
                <div key={m.month} className="glass" style={subtlePanelStyle}>
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
                      魚データ {fmtN(m.totalFish)} 匹
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
                          {fmtN(r.value)} 匹
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

        <div className="glass-panel strong" style={cardStyle}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            🧲 ルアージャンル別（魚の数ベース）
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
                    {fmtN(r.total)} 匹
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            ※count を反映した合計匹数だよ
          </div>
        </div>

        <div className="glass-panel strong" style={cardStyle}>
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
          データ量が少ないうちはブレるけど、溜まってくると「この魚はいつ・何で・どの潮で強いか」が見えてくるよ🎣
        </div>
      </div>
    </PageShell>
  );
}
