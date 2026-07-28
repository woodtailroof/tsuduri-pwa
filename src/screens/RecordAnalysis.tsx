// src/screens/RecordAnalysis.tsx
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import PageShell from "../components/PageShell";
import {
  db,
  type LureType as DbLureType,
  type TripFish,
  type TripRecord,
  type TackleItem,
} from "../db";
import { getTimeBand } from "../lib/timeband";
import {
  CHARACTERS_STORAGE_KEY,
  type CharacterProfile,
} from "./CharacterSettings";

type Props = {
  back: () => void;
};

type LureType = DbLureType | "unknown";

type JoinedTrip = {
  id: number;
  createdAt: string;
  startedAt: string;
  timeBand: TripRecord["timeBand"];
  outcome: TripRecord["outcome"];
  tideName: string;
  tideTrend: string;
  windSpeedMs: number | null;
  waveHeightM: number | null;
  rodId: number | null;
  reelId: number | null;
  rodUid: string | null;
  reelUid: string | null;
  lureType: LureType;
};

type JoinedFish = {
  tripId: number;
  tripStartedAt: string;
  timeBand: TripRecord["timeBand"];
  tideTrend: string;
  lureType: LureType;
  species: string;
  sizeCm: number | null;
  count: number;
};

type RateRow = {
  key: string;
  total: number;
  caught: number;
  rate: number;
  score: number;
};

type SpeciesInsight = {
  species: string;
  totalCount: number;
  avgSizeCm: number | null;
  maxSizeCm: number | null;
  bestTime: string;
  bestLure: string;
  bestTrend: string;
  timeRows: Array<{ key: string; value: number }>;
  lureRows: Array<{ key: string; value: number }>;
  trendRows: Array<{ key: string; value: number }>;
};

type TackleInsight = {
  id: string;
  label: string;
  active: boolean;
  useCount: number;
  caughtTrips: number;
  totalFish: number;
  rate: number;
  bestSpecies: string;
};

type CharacterComment = {
  id: "tsuduri" | "matsuri" | "kokoro" | "lulu";
  name: string;
  role: string;
  mark: string;
  accent: string;
  text: string;
};

type AiCharacterComment = {
  characterId: string;
  characterName: string;
  color: string;
  text: string;
};

type AiCommentCache = {
  version: 1;
  fingerprint: string;
  generatedAt: string;
  comments: AiCharacterComment[];
};

const ANALYSIS_COMMENT_CACHE_KEY = "tsuduri_analysis_ai_comments_v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function loadCharacters(): CharacterProfile[] {
  const value = safeJsonParse<unknown>(
    localStorage.getItem(CHARACTERS_STORAGE_KEY),
    [],
  );
  return Array.isArray(value)
    ? value.filter(
        (item): item is CharacterProfile =>
          !!item &&
          typeof item === "object" &&
          typeof (item as CharacterProfile).id === "string" &&
          typeof (item as CharacterProfile).name === "string",
      )
    : [];
}

function iconPath(characterId: string, characterName: string): string {
  const identity = `${characterId} ${characterName}`.toLowerCase();

  const knownIconId =
    identity.includes("tsuduri") || identity.includes("つづり")
      ? "tsuduri"
      : identity.includes("matsuri") || identity.includes("まつり")
        ? "matsuri"
        : identity.includes("kokoro") || identity.includes("こころ")
          ? "kokoro"
          : identity.includes("lulu") || identity.includes("るる")
            ? "lulu"
            : characterId;

  return `/assets/character-icons/${encodeURIComponent(knownIconId)}.png`;
}

function characterOrder(characterId: string, characterName: string): number {
  const identity = `${characterId} ${characterName}`.toLowerCase();

  if (identity.includes("tsuduri") || identity.includes("つづり")) return 0;
  if (identity.includes("matsuri") || identity.includes("まつり")) return 1;
  if (identity.includes("kokoro") || identity.includes("こころ")) return 2;
  if (identity.includes("lulu") || identity.includes("るる")) return 3;
  return 99;
}

function sortAiComments(comments: AiCharacterComment[]): AiCharacterComment[] {
  return [...comments].sort(
    (a, b) =>
      characterOrder(a.characterId, a.characterName) -
      characterOrder(b.characterId, b.characterName),
  );
}

const TIMEBANDS: Array<TripRecord["timeBand"]> = [
  "morning",
  "day",
  "evening",
  "night",
];

const TIMEBAND_LABEL: Record<TripRecord["timeBand"], string> = {
  morning: "朝",
  day: "昼",
  evening: "夕",
  night: "夜",
  unknown: "不明",
};

const TREND_ORDER = ["上げ", "下げ", "止まり"];

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

const LURE_LABEL: Record<LureType, string> = {
  metaljig: "メタルジグ",
  minnow: "ミノー",
  sinkingpencil: "シンペン",
  top: "トップ",
  worm: "ワーム",
  blade: "ブレード",
  bigbait: "ビッグベイト",
  sabiki: "サビキ",
  bait: "エサ釣り",
  other: "その他",
  unknown: "不明",
};

const panelStyle: CSSProperties = {
  borderRadius: 22,
  padding: "clamp(14px, 2vw, 20px)",
  border: "1px solid rgba(255,255,255,0.14)",
  background:
    "linear-gradient(145deg, rgba(17,28,46,0.76), rgba(26,15,43,0.66))",
  boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
  minWidth: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeRate(caught: number, total: number) {
  return total > 0 ? caught / total : 0;
}

function fmtPct(rate: number) {
  return `${(clamp(rate, 0, 1) * 100).toFixed(1)}%`;
}

function fmtSize(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}cm`;
}

function normalizeSpecies(raw: string | null | undefined) {
  const value = (raw ?? "").trim();
  return value ? (SPECIES_LABEL[value] ?? value) : "不明";
}

function labelTrend(value: TripRecord["tideTrend"] | null | undefined) {
  if (value === "up") return "上げ";
  if (value === "down") return "下げ";
  if (value === "flat") return "止まり";
  return "不明";
}

function normalizeLureType(value: DbLureType | null | undefined): LureType {
  if (
    value === "metaljig" ||
    value === "minnow" ||
    value === "sinkingpencil" ||
    value === "top" ||
    value === "worm" ||
    value === "blade" ||
    value === "bigbait" ||
    value === "sabiki" ||
    value === "bait" ||
    value === "other"
  ) {
    return value;
  }
  return "unknown";
}

function getLureType(fish: TripFish): LureType {
  return normalizeLureType(fish.lureType);
}

function getFishCount(count: number | null | undefined) {
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 1;
}

function monthKey(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeTimeBand(
  raw: unknown,
  startedAt?: string | null,
): TripRecord["timeBand"] {
  if (typeof raw === "string") {
    const value = raw.trim();
    const lower = value.toLowerCase();
    if (lower === "morning" || value === "朝" || value === "朝マズメ") {
      return "morning";
    }
    if (lower === "day" || value === "昼" || value === "デイ") return "day";
    if (lower === "evening" || value === "夕" || value === "夕マズメ") {
      return "evening";
    }
    if (lower === "night" || value === "夜" || value === "ナイト") {
      return "night";
    }
  }

  if (startedAt) {
    const date = new Date(startedAt);
    if (Number.isFinite(date.getTime())) {
      return normalizeTimeBand(String(getTimeBand(date)));
    }
  }
  return "unknown";
}

/**
 * 成功率だけで少数データが1位にならないよう、Wilson下限を順位に使う。
 */
function wilsonLower(caught: number, total: number) {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = caught / total;
  const z2 = z * z;
  return (
    (p +
      z2 / (2 * total) -
      z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) /
    (1 + z2 / total)
  );
}

function confidence(total: number) {
  if (total >= 10) return { label: "信頼度 高", tone: "#79f2c0" };
  if (total >= 5) return { label: "信頼度 中", tone: "#ffd166" };
  return { label: "暫定", tone: "#ff9fbd" };
}

function addCount(map: Map<string, number>, key: string, value = 1) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function sortedRows(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key, "ja"));
}

function formatTackleLabel(
  tackle: TackleItem | undefined,
  kind: "rod" | "reel",
) {
  if (!tackle || tackle.kind !== kind) {
    return kind === "rod" ? "不明なロッド" : "不明なリール";
  }
  const size = kind === "rod" ? tackle.rod?.sizeLabel : tackle.reel?.sizeLabel;
  return `${tackle.active ? "" : "【過去】"}${tackle.maker} ${tackle.model} ${
    size ?? ""
  }`.trim();
}

function Panel({
  title,
  icon,
  note,
  className = "",
  children,
}: {
  title: string;
  icon: string;
  note?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`analysis-panel ${className}`} style={panelStyle}>
      <div className="analysis-heading">
        <span className="analysis-heading-icon">{icon}</span>
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="analysis-metric"
      style={{
        borderColor: `${color}55`,
        background: `linear-gradient(145deg, ${color}1f, rgba(255,255,255,0.035))`,
      }}
    >
      <div className="analysis-metric-label">
        <span>{icon}</span>
        {label}
      </div>
      <strong style={{ color }}>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  text,
  color = "#ff6fa6",
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  color?: string;
}) {
  const width = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div className="analysis-bar-row">
      <div className="analysis-bar-label" title={label}>
        {label}
      </div>
      <div className="analysis-bar-track">
        <div
          className="analysis-bar-fill"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
          }}
        />
      </div>
      <div className="analysis-bar-value">{text}</div>
    </div>
  );
}

function RadarChart({
  axes,
}: {
  axes: Array<{ label: string; value: number }>;
}) {
  const size = 290;
  const center = size / 2;
  const radius = 92;
  const pointAt = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
    return {
      x: center + Math.cos(angle) * radius * ratio,
      y: center + Math.sin(angle) * radius * ratio,
    };
  };
  const polygon = (ratio: number) =>
    axes
      .map((_, index) => {
        const point = pointAt(index, ratio);
        return `${point.x},${point.y}`;
      })
      .join(" ");
  const values = axes
    .map((axis, index) => {
      const point = pointAt(index, clamp(axis.value / 100, 0, 1));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <svg
      className="analysis-radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="釣りスタイルのレーダーチャート"
    >
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6fa6" stopOpacity="0.66" />
          <stop offset="100%" stopColor="#72d7ff" stopOpacity="0.44" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <polygon
          key={ratio}
          points={polygon(ratio)}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, index) => {
        const point = pointAt(index, 1);
        return (
          <line
            key={index}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            stroke="rgba(255,255,255,0.12)"
          />
        );
      })}
      <polygon
        points={values}
        fill="url(#radarFill)"
        stroke="#ff9fc5"
        strokeWidth="2.5"
      />
      {axes.map((axis, index) => {
        const dot = pointAt(index, clamp(axis.value / 100, 0, 1));
        const label = pointAt(index, 1.28);
        return (
          <g key={axis.label}>
            <circle cx={dot.x} cy={dot.y} r="4" fill="#fff" />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.86)"
              fontSize="11"
              fontWeight="700"
            >
              {axis.label}
            </text>
            <text
              x={label.x}
              y={label.y + 14}
              textAnchor="middle"
              fill="#ffb2cf"
              fontSize="10"
              fontWeight="800"
            >
              {Math.round(axis.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendChart({
  rows,
}: {
  rows: Array<{ month: string; trips: number; caught: number; fish: number }>;
}) {
  if (rows.length === 0) {
    return <div className="analysis-empty">月別データがまだ無いよ</div>;
  }
  const width = 640;
  const height = 250;
  const left = 38;
  const right = 16;
  const top = 18;
  const bottom = 38;
  const chartW = width - left - right;
  const chartH = height - top - bottom;
  const maxFish = Math.max(1, ...rows.map((row) => row.fish));
  const step = chartW / Math.max(1, rows.length);
  const ratePoints = rows
    .map((row, index) => {
      const x = left + step * index + step / 2;
      const y = top + chartH * (1 - safeRate(row.caught, row.trips));
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="analysis-trend"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="月ごとの釣果数とキャッチ率"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = top + chartH * ratio;
        return (
          <line
            key={ratio}
            x1={left}
            y1={y}
            x2={width - right}
            y2={y}
            stroke="rgba(255,255,255,0.10)"
          />
        );
      })}
      {rows.map((row, index) => {
        const x = left + step * index + step * 0.2;
        const barW = step * 0.6;
        const barH = (row.fish / maxFish) * chartH;
        return (
          <g key={row.month}>
            <rect
              x={x}
              y={top + chartH - barH}
              width={barW}
              height={barH}
              rx="5"
              fill="rgba(114,215,255,0.52)"
            />
            <text
              x={x + barW / 2}
              y={height - 17}
              textAnchor="middle"
              fill="rgba(255,255,255,0.68)"
              fontSize="10"
            >
              {row.month.slice(5)}月
            </text>
          </g>
        );
      })}
      <polyline
        points={ratePoints}
        fill="none"
        stroke="#ff79ad"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {rows.map((row, index) => {
        const x = left + step * index + step / 2;
        const y = top + chartH * (1 - safeRate(row.caught, row.trips));
        return (
          <circle
            key={`dot:${row.month}`}
            cx={x}
            cy={y}
            r="4"
            fill="#fff"
            stroke="#ff79ad"
            strokeWidth="2"
          />
        );
      })}
      <text x="6" y="16" fill="#72d7ff" fontSize="10" fontWeight="700">
        匹数（棒）
      </text>
      <text x={width - 92} y="16" fill="#ff9fc5" fontSize="10" fontWeight="700">
        キャッチ率（線）
      </text>
    </svg>
  );
}

export default function RecordAnalysis({ back }: Props) {
  const [loading, setLoading] = useState(false);
  const [trips, setTrips] = useState<Array<TripRecord & { id: number }>>([]);
  const [fish, setFish] = useState<Array<TripFish & { id: number }>>([]);
  const [tackles, setTackles] = useState<Array<TackleItem & { id: number }>>(
    [],
  );
  const [error, setError] = useState("");
  const [limitTop, setLimitTop] = useState(5);
  const [aiComments, setAiComments] = useState<AiCharacterComment[]>([]);
  const [aiGeneratedAt, setAiGeneratedAt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [selectedAiCharacterId, setSelectedAiCharacterId] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [tripRows, fishRows, tackleRows] = await Promise.all([
        db.trips.orderBy("createdAt").reverse().toArray(),
        db.tripFish.orderBy("createdAt").reverse().toArray(),
        db.tackleItems.toArray(),
      ]);
      setTrips(
        tripRows.filter(
          (row): row is TripRecord & { id: number } =>
            typeof row.id === "number" && !row.deletedAt,
        ),
      );
      setFish(
        fishRows.filter(
          (row): row is TripFish & { id: number } =>
            typeof row.id === "number" && !row.deletedAt,
        ),
      );
      setTackles(
        tackleRows.filter(
          (row): row is TackleItem & { id: number } =>
            typeof row.id === "number" && !row.deletedAt,
        ),
      );
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const joinedTrips = useMemo<JoinedTrip[]>(
    () =>
      trips.map((trip) => ({
        id: trip.id,
        createdAt: trip.createdAt,
        startedAt: trip.startedAt,
        timeBand: normalizeTimeBand(trip.timeBand, trip.startedAt),
        outcome: trip.outcome ?? "skunk",
        tideName: (trip.tideName ?? "").trim() || "不明",
        tideTrend: labelTrend(trip.tideTrend),
        windSpeedMs:
          typeof trip.windSpeedMs === "number" ? trip.windSpeedMs : null,
        waveHeightM:
          typeof trip.waveHeightM === "number" ? trip.waveHeightM : null,
        rodId: typeof trip.rodId === "number" ? trip.rodId : null,
        reelId: typeof trip.reelId === "number" ? trip.reelId : null,
        rodUid:
          typeof trip.rodUid === "string" && trip.rodUid.trim()
            ? trip.rodUid
            : null,
        reelUid:
          typeof trip.reelUid === "string" && trip.reelUid.trim()
            ? trip.reelUid
            : null,
        lureType: normalizeLureType(trip.lureType),
      })),
    [trips],
  );

  const joinedFish = useMemo<JoinedFish[]>(() => {
    const tripMap = new Map(trips.map((trip) => [trip.id, trip]));
    return fish.flatMap((row) => {
      const trip = tripMap.get(row.tripId);
      if (!trip) return [];
      return [
        {
          tripId: row.tripId,
          tripStartedAt: trip.startedAt,
          timeBand: normalizeTimeBand(
            row.timeBand ?? trip.timeBand,
            trip.startedAt,
          ),
          tideTrend: labelTrend(trip.tideTrend),
          lureType: getLureType(row),
          species: normalizeSpecies(row.species),
          sizeCm:
            typeof row.sizeCm === "number" && Number.isFinite(row.sizeCm)
              ? row.sizeCm
              : null,
          count: getFishCount(row.count),
        },
      ];
    });
  }, [trips, fish]);

  const totalTrips = joinedTrips.length;
  const caughtTrips = joinedTrips.filter(
    (trip) => trip.outcome === "caught",
  ).length;
  const totalFish = joinedFish.reduce((sum, row) => sum + row.count, 0);
  const catchRate = safeRate(caughtTrips, totalTrips);

  const lureInsights = useMemo(() => {
    const map = new Map<
      LureType,
      { lureType: LureType; total: number; caught: number }
    >();
    joinedTrips.forEach((trip) => {
      if (trip.lureType === "unknown") return;
      const current = map.get(trip.lureType) ?? {
        lureType: trip.lureType,
        total: 0,
        caught: 0,
      };
      current.total += 1;
      if (trip.outcome === "caught") current.caught += 1;
      map.set(trip.lureType, current);
    });
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        label: LURE_LABEL[row.lureType],
        rate: safeRate(row.caught, row.total),
        score: wilsonLower(row.caught, row.total),
      }))
      .sort((a, b) => b.score - a.score || b.total - a.total)
      .slice(0, limitTop);
  }, [joinedTrips, limitTop]);
  const uniqueSpecies = new Set(joinedFish.map((row) => row.species)).size;
  const measuredFish = joinedFish.filter(
    (row) => row.sizeCm != null && row.sizeCm > 0,
  );
  const avgSize =
    measuredFish.length > 0
      ? measuredFish.reduce((sum, row) => sum + (row.sizeCm ?? 0), 0) /
        measuredFish.length
      : null;
  const maxSize =
    measuredFish.length > 0
      ? Math.max(...measuredFish.map((row) => row.sizeCm ?? 0))
      : null;

  const timeStats = useMemo<RateRow[]>(() => {
    return [...TIMEBANDS, "unknown" as const]
      .map((band) => {
        const rows = joinedTrips.filter((trip) => trip.timeBand === band);
        const caught = rows.filter((trip) => trip.outcome === "caught").length;
        return {
          key: TIMEBAND_LABEL[band],
          total: rows.length,
          caught,
          rate: safeRate(caught, rows.length),
          score: wilsonLower(caught, rows.length),
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.score - a.score || b.total - a.total);
  }, [joinedTrips]);

  const tideStats = useMemo<RateRow[]>(() => {
    const total = new Map<string, number>();
    const caught = new Map<string, number>();
    joinedTrips.forEach((trip) => {
      addCount(total, trip.tideName);
      if (trip.outcome === "caught") addCount(caught, trip.tideName);
    });
    return Array.from(total.entries())
      .map(([key, count]) => {
        const caughtCount = caught.get(key) ?? 0;
        return {
          key,
          total: count,
          caught: caughtCount,
          rate: safeRate(caughtCount, count),
          score: wilsonLower(caughtCount, count),
        };
      })
      .sort((a, b) => b.score - a.score || b.total - a.total)
      .slice(0, limitTop);
  }, [joinedTrips, limitTop]);

  const heatmap = useMemo(() => {
    const map = new Map<string, { total: number; caught: number }>();
    joinedTrips.forEach((trip) => {
      const time = TIMEBAND_LABEL[trip.timeBand];
      if (time === "不明" || trip.tideTrend === "不明") return;
      const key = `${time}|${trip.tideTrend}`;
      const current = map.get(key) ?? { total: 0, caught: 0 };
      current.total += 1;
      if (trip.outcome === "caught") current.caught += 1;
      map.set(key, current);
    });
    return map;
  }, [joinedTrips]);

  const patterns = useMemo(() => {
    const map = new Map<string, { total: number; caught: number }>();
    joinedTrips.forEach((trip) => {
      const time = TIMEBAND_LABEL[trip.timeBand];
      if (time === "不明" || trip.tideTrend === "不明") return;
      const key = `${time} × ${trip.tideTrend}`;
      const current = map.get(key) ?? { total: 0, caught: 0 };
      current.total += 1;
      if (trip.outcome === "caught") current.caught += 1;
      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([key, value]) => {
        const [time, trend] = key.split(" × ");
        const lureMap = new Map<string, number>();
        joinedFish
          .filter(
            (row) =>
              TIMEBAND_LABEL[row.timeBand] === time && row.tideTrend === trend,
          )
          .forEach((row) =>
            addCount(lureMap, LURE_LABEL[row.lureType], row.count),
          );
        const bestLure = sortedRows(lureMap)[0]?.key ?? "ルアー未解析";
        return {
          key,
          ...value,
          rate: safeRate(value.caught, value.total),
          score: wilsonLower(value.caught, value.total),
          bestLure,
        };
      })
      .sort((a, b) => b.score - a.score || b.total - a.total)
      .slice(0, 3);
  }, [joinedTrips, joinedFish]);

  const monthly = useMemo(() => {
    const map = new Map<
      string,
      { month: string; trips: number; caught: number; fish: number }
    >();
    joinedTrips.forEach((trip) => {
      const key = monthKey(trip.startedAt) ?? monthKey(trip.createdAt);
      if (!key) return;
      const row = map.get(key) ?? { month: key, trips: 0, caught: 0, fish: 0 };
      row.trips += 1;
      if (trip.outcome === "caught") row.caught += 1;
      map.set(key, row);
    });
    joinedFish.forEach((fishRow) => {
      const key = monthKey(fishRow.tripStartedAt);
      const row = key ? map.get(key) : undefined;
      if (row) row.fish += fishRow.count;
    });
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [joinedTrips, joinedFish]);

  const speciesInsights = useMemo<SpeciesInsight[]>(() => {
    const map = new Map<
      string,
      {
        count: number;
        sizeSum: number;
        sizeWeight: number;
        maxSize: number | null;
        time: Map<string, number>;
        lure: Map<string, number>;
        trend: Map<string, number>;
      }
    >();
    joinedFish.forEach((row) => {
      const current = map.get(row.species) ?? {
        count: 0,
        sizeSum: 0,
        sizeWeight: 0,
        maxSize: null,
        time: new Map<string, number>(),
        lure: new Map<string, number>(),
        trend: new Map<string, number>(),
      };
      current.count += row.count;
      if (row.sizeCm != null && row.sizeCm > 0) {
        current.sizeSum += row.sizeCm * row.count;
        current.sizeWeight += row.count;
        current.maxSize = Math.max(current.maxSize ?? 0, row.sizeCm);
      }
      addCount(current.time, TIMEBAND_LABEL[row.timeBand], row.count);
      addCount(current.lure, LURE_LABEL[row.lureType], row.count);
      addCount(current.trend, row.tideTrend, row.count);
      map.set(row.species, current);
    });

    return Array.from(map.entries())
      .map(([species, row]) => {
        const timeRows = sortedRows(row.time);
        const lureRows = sortedRows(row.lure);
        const trendRows = sortedRows(row.trend);
        return {
          species,
          totalCount: row.count,
          avgSizeCm: row.sizeWeight > 0 ? row.sizeSum / row.sizeWeight : null,
          maxSizeCm: row.maxSize,
          bestTime: timeRows[0]?.key ?? "—",
          bestLure: lureRows[0]?.key ?? "—",
          bestTrend: trendRows[0]?.key ?? "—",
          timeRows,
          lureRows,
          trendRows,
        };
      })
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, limitTop);
  }, [joinedFish, limitTop]);

  const tackleInsights = useMemo(() => {
    const byId = new Map(tackles.map((tackle) => [tackle.id, tackle]));
    const byUid = new Map(
      tackles
        .filter((tackle) => tackle.uid?.trim())
        .map((tackle) => [tackle.uid, tackle]),
    );
    const tripFish = new Map<number, JoinedFish[]>();
    joinedFish.forEach((row) => {
      tripFish.set(row.tripId, [...(tripFish.get(row.tripId) ?? []), row]);
    });

    const build = (kind: "rod" | "reel"): TackleInsight[] => {
      const map = new Map<
        string,
        {
          tackle: TackleItem | undefined;
          useCount: number;
          caughtTrips: number;
          totalFish: number;
          species: Map<string, number>;
        }
      >();
      joinedTrips.forEach((trip) => {
        const id = kind === "rod" ? trip.rodId : trip.reelId;
        const uid = kind === "rod" ? trip.rodUid : trip.reelUid;
        const tackle =
          (id != null ? byId.get(id) : undefined) ??
          (uid ? byUid.get(uid) : undefined);
        const key = tackle?.uid ?? uid ?? (id != null ? `id:${id}` : "");
        if (!key) return;
        const current = map.get(key) ?? {
          tackle,
          useCount: 0,
          caughtTrips: 0,
          totalFish: 0,
          species: new Map<string, number>(),
        };
        current.useCount += 1;
        if (trip.outcome === "caught") current.caughtTrips += 1;
        (tripFish.get(trip.id) ?? []).forEach((fishRow) => {
          current.totalFish += fishRow.count;
          addCount(current.species, fishRow.species, fishRow.count);
        });
        map.set(key, current);
      });
      return Array.from(map.entries())
        .map(([id, row]) => ({
          id,
          label: formatTackleLabel(row.tackle, kind),
          active: row.tackle?.active ?? false,
          useCount: row.useCount,
          caughtTrips: row.caughtTrips,
          totalFish: row.totalFish,
          rate: safeRate(row.caughtTrips, row.useCount),
          bestSpecies: sortedRows(row.species)[0]?.key ?? "釣果なし",
        }))
        .sort(
          (a, b) =>
            Number(b.active) - Number(a.active) ||
            wilsonLower(b.caughtTrips, b.useCount) -
              wilsonLower(a.caughtTrips, a.useCount) ||
            b.useCount - a.useCount,
        )
        .slice(0, limitTop);
    };
    return { rods: build("rod"), reels: build("reel") };
  }, [tackles, joinedTrips, joinedFish, limitTop]);

  const envStats = useMemo(() => {
    const wind = [
      { label: "0〜2.9m/s", min: 0, max: 3 },
      { label: "3〜4.9m/s", min: 3, max: 5 },
      { label: "5m/s以上", min: 5, max: Infinity },
    ].map((bucket) => {
      const rows = joinedTrips.filter(
        (trip) =>
          trip.windSpeedMs != null &&
          trip.windSpeedMs >= bucket.min &&
          trip.windSpeedMs < bucket.max,
      );
      const caught = rows.filter((trip) => trip.outcome === "caught").length;
      return {
        ...bucket,
        total: rows.length,
        caught,
        rate: safeRate(caught, rows.length),
      };
    });
    const wave = [
      { label: "0〜0.4m", min: 0, max: 0.5 },
      { label: "0.5〜0.9m", min: 0.5, max: 1 },
      { label: "1m以上", min: 1, max: Infinity },
    ].map((bucket) => {
      const rows = joinedTrips.filter(
        (trip) =>
          trip.waveHeightM != null &&
          trip.waveHeightM >= bucket.min &&
          trip.waveHeightM < bucket.max,
      );
      const caught = rows.filter((trip) => trip.outcome === "caught").length;
      return {
        ...bucket,
        total: rows.length,
        caught,
        rate: safeRate(caught, rows.length),
      };
    });
    return { wind, wave };
  }, [joinedTrips]);

  const strongestPattern = patterns[0];
  const patternStrength = strongestPattern
    ? clamp(strongestPattern.score * 180, 0, 100)
    : 0;
  const styleAxes = [
    {
      label: "安定度",
      value: clamp(wilsonLower(caughtTrips, totalTrips) * 180, 0, 100),
    },
    {
      label: "数釣り",
      value: clamp((totalFish / Math.max(1, caughtTrips)) * 28, 0, 100),
    },
    {
      label: "サイズ記録",
      value: clamp(
        (measuredFish.length / Math.max(1, joinedFish.length)) * 100,
        0,
        100,
      ),
    },
    { label: "魚種幅", value: clamp((uniqueSpecies / 5) * 100, 0, 100) },
    { label: "再現度", value: patternStrength },
  ];
  const overallScore = Math.round(
    styleAxes.reduce((sum, axis) => sum + axis.value, 0) / styleAxes.length,
  );
  const grade =
    totalTrips < 3
      ? "未解析"
      : overallScore >= 80
        ? "S"
        : overallScore >= 65
          ? "A"
          : overallScore >= 50
            ? "B"
            : overallScore >= 35
              ? "C"
              : "D";

  const mission = useMemo(() => {
    const candidates = patterns
      .filter((row) => row.total < 5 && row.caught > 0)
      .sort((a, b) => b.rate - a.rate || b.total - a.total);
    const target = candidates[0] ?? patterns[0];
    if (!target) {
      return {
        title: "まずは3釣行分の記録を集めよう",
        text: "結果だけでなく時間帯・潮・ルアーまで残すと、攻略カルテが一気に育つよ。",
      };
    }
    const remaining = Math.max(0, 5 - target.total);
    return {
      title: `${target.key} × ${target.bestLure}`,
      text:
        remaining > 0
          ? `現在${target.total}釣行でキャッチ率${fmtPct(target.rate)}。あと${remaining}回試すと、暫定パターンの再現性が読みやすくなるよ。`
          : `現在${target.total}釣行でキャッチ率${fmtPct(target.rate)}。次は別の潮名でも再現するか確かめる段階だよ。`,
    };
  }, [patterns]);

  const characterComments = useMemo<CharacterComment[]>(() => {
    const bestTime = timeStats[0];
    const bestTackle = [...tackleInsights.rods, ...tackleInsights.reels].sort(
      (a, b) =>
        wilsonLower(b.caughtTrips, b.useCount) -
          wilsonLower(a.caughtTrips, a.useCount) || b.useCount - a.useCount,
    )[0];

    if (totalTrips === 0) {
      return [
        {
          id: "tsuduri",
          name: "つづり",
          role: "総合成績",
          mark: "つ",
          accent: "#ff87b6",
          text: "最初の一投は、まだ真っ白な海の向こう。記録が入ったら一緒に勝ち筋を見つけようね、ひろっち。",
        },
        {
          id: "matsuri",
          name: "まつり",
          role: "勝ちパターン",
          mark: "ま",
          accent: "#a995ff",
          text: "時間帯と潮の動きまで残してくれたら、アタシが好機をズバッと暴いてあげる！",
        },
        {
          id: "kokoro",
          name: "こころ",
          role: "魚種・サイズ",
          mark: "こ",
          accent: "#ffb57a",
          text: "魚種やサイズは分かる範囲だけで大丈夫。少しずつ積み重ねれば、ちゃんと大切な記録になるよ。",
        },
        {
          id: "lulu",
          name: "るる",
          role: "タックル・検証",
          mark: "る",
          accent: "#72d7ff",
          text: "使ったロッドとリールも選んでおくと、ひろっちの頼れる相棒が見えてくるよ。るるも一緒に探すね！",
        },
      ];
    }

    const tsuduriText =
      totalTrips < 3
        ? `いまは${totalTrips}釣行分。まだランクよりも、ひろっちの釣りを知るための大事な助走期間だよ。`
        : catchRate >= 0.6
          ? `${totalTrips}釣行でキャッチ率${fmtPct(catchRate)}！ 勝ち筋がちゃんと形になってきたね。さすが、つづりの相棒♡`
          : catchRate >= 0.3
            ? `キャッチ率は${fmtPct(catchRate)}。釣れた${caughtTrips}回の共通点を拾えば、ここからまだ強くなれるよ。`
            : `${totalTrips}回ぶん挑んだ記録そのものが武器だよ。釣れなかった日まで、次の一匹へちゃんと繋がってる。`;

    const matsuriText = strongestPattern
      ? `${strongestPattern.key}が現在の有力候補！ ${strongestPattern.bestLure}を軸に、あと数回ぶつけて本物の必勝パターンか試そっ！`
      : bestTime
        ? `${bestTime.key}は${bestTime.caught}/${bestTime.total}釣行でキャッチ。次は潮の動きも揃えて、勝負どころを絞り込もう！`
        : "条件データはまだ眠ってるね。次の釣行から時間帯と潮を揃えて、好機を炙り出そっ！";

    const kokoroText =
      totalFish === 0
        ? "釣果が無い日も立派な比較材料だよ。条件を残しておけば、避けたい状況や変えるべき一手が見えてくるからね。"
        : maxSize != null
          ? `${uniqueSpecies}魚種・${totalFish}匹、最大は${fmtSize(maxSize)}。サイズだけじゃなく、出会えた魚の幅もひろっちらしい素敵な記録だね。`
          : `${uniqueSpecies}魚種・${totalFish}匹まで育ったね。次からサイズも少し残せると、成長の輪郭がもっときれいに見えるよ。`;

    const luluText = bestTackle
      ? `${bestTackle.label}は使用${bestTackle.useCount}回、キャッチ率${fmtPct(bestTackle.rate)}！ まだ暫定だけど、頼れる武器候補として覚えておこうね。`
      : `${mission.title}が次の検証候補だね。タックルも一緒に記録すれば、“勝てる組み合わせ”までるるが探し出すよ！`;

    return [
      {
        id: "tsuduri",
        name: "つづり",
        role: "総合成績",
        mark: "つ",
        accent: "#ff87b6",
        text: tsuduriText,
      },
      {
        id: "matsuri",
        name: "まつり",
        role: "勝ちパターン",
        mark: "ま",
        accent: "#a995ff",
        text: matsuriText,
      },
      {
        id: "kokoro",
        name: "こころ",
        role: "魚種・サイズ",
        mark: "こ",
        accent: "#ffb57a",
        text: kokoroText,
      },
      {
        id: "lulu",
        name: "るる",
        role: "タックル・検証",
        mark: "る",
        accent: "#72d7ff",
        text: luluText,
      },
    ];
  }, [
    totalTrips,
    caughtTrips,
    catchRate,
    totalFish,
    uniqueSpecies,
    maxSize,
    strongestPattern,
    timeStats,
    tackleInsights,
    mission,
  ]);

  const analysisSummary = useMemo(
    () => ({
      totalTrips,
      caughtTrips,
      catchRatePercent: Math.round(catchRate * 1000) / 10,
      totalFish,
      uniqueSpecies,
      averageSizeCm: avgSize == null ? null : Math.round(avgSize * 10) / 10,
      maxSizeCm: maxSize == null ? null : Math.round(maxSize * 10) / 10,
      grade,
      overallScore,
      styleAxes: styleAxes.map((axis) => ({
        label: axis.label,
        value: Math.round(axis.value),
      })),
      bestTimes: timeStats.slice(0, 3).map((row) => ({
        label: row.key,
        trips: row.total,
        caughtTrips: row.caught,
        catchRatePercent: Math.round(row.rate * 1000) / 10,
      })),
      bestTides: tideStats.slice(0, 3).map((row) => ({
        label: row.key,
        trips: row.total,
        caughtTrips: row.caught,
        catchRatePercent: Math.round(row.rate * 1000) / 10,
      })),
      bestPatterns: patterns.slice(0, 5).map((row) => ({
        condition: row.key,
        lure: row.bestLure,
        trips: row.total,
        caughtTrips: row.caught,
        catchRatePercent: Math.round(row.rate * 1000) / 10,
        confidence: confidence(row.total).label,
      })),
      species: speciesInsights.slice(0, 8).map((row) => ({
        species: row.species,
        fishCount: row.totalCount,
        averageSizeCm:
          row.avgSizeCm == null ? null : Math.round(row.avgSizeCm * 10) / 10,
        maxSizeCm: row.maxSizeCm,
        bestTime: row.bestTime,
        bestTrend: row.bestTrend,
      })),
      tackle: [...tackleInsights.rods, ...tackleInsights.reels]
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 8)
        .map((row) => ({
          label: row.label,
          uses: row.useCount,
          caughtTrips: row.caughtTrips,
          fishCount: row.totalFish,
          catchRatePercent: Math.round(row.rate * 1000) / 10,
          bestSpecies: row.bestSpecies,
        })),
      environment: {
        wind: envStats.wind.filter((row) => row.total > 0),
        wave: envStats.wave.filter((row) => row.total > 0),
      },
      nextMission: mission,
    }),
    [
      totalTrips,
      caughtTrips,
      catchRate,
      totalFish,
      uniqueSpecies,
      avgSize,
      maxSize,
      grade,
      overallScore,
      styleAxes,
      timeStats,
      tideStats,
      patterns,
      speciesInsights,
      tackleInsights,
      envStats,
      mission,
    ],
  );

  const analysisFingerprint = useMemo(
    () => JSON.stringify(analysisSummary),
    [analysisSummary],
  );

  useEffect(() => {
    const cached = safeJsonParse<AiCommentCache | null>(
      localStorage.getItem(ANALYSIS_COMMENT_CACHE_KEY),
      null,
    );
    if (
      cached?.version === 1 &&
      cached.fingerprint === analysisFingerprint &&
      Array.isArray(cached.comments)
    ) {
      const sortedComments = sortAiComments(cached.comments);
      setAiComments(sortedComments);
      setAiGeneratedAt(cached.generatedAt);
      setSelectedAiCharacterId(sortedComments[0]?.characterId ?? "");
    } else {
      setAiComments([]);
      setAiGeneratedAt("");
      setSelectedAiCharacterId("");
    }
  }, [analysisFingerprint]);

  async function requestAiComments() {
    const characters = loadCharacters();
    if (characters.length === 0) {
      setAiError("キャラクター設定が見つからないよ。先にキャラを登録してね。");
      return;
    }

    setAiLoading(true);
    setAiError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analysis_comments",
          analysisSummary,
          characters,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            comments?: Array<{ characterId?: string; text?: string }>;
            error?: string;
          }
        | null;
      if (!response.ok || !json?.ok || !Array.isArray(json.comments)) {
        throw new Error(json?.error || `HTTP ${response.status}`);
      }

      const byId = new Map(characters.map((character) => [character.id, character]));
      const comments = sortAiComments(
        json.comments.flatMap((item) => {
          const character =
            typeof item.characterId === "string"
              ? byId.get(item.characterId)
              : undefined;
          const text = typeof item.text === "string" ? item.text.trim() : "";
          if (!character || !text) return [];
          return [
            {
              characterId: character.id,
              characterName: character.name,
              color: character.color || "#ff7aa2",
              text,
            },
          ];
        }),
      );
      if (comments.length === 0) {
        throw new Error("コメントを受け取れませんでした");
      }

      const generatedAt = new Date().toISOString();
      setAiComments(comments);
      setAiGeneratedAt(generatedAt);
      setSelectedAiCharacterId(comments[0].characterId);
      localStorage.setItem(
        ANALYSIS_COMMENT_CACHE_KEY,
        JSON.stringify({
          version: 1,
          fingerprint: analysisFingerprint,
          generatedAt,
          comments,
        } satisfies AiCommentCache),
      );
    } catch (cause) {
      console.error(cause);
      setAiError(
        cause instanceof Error
          ? cause.message
          : "コメントの生成に失敗しました",
      );
    } finally {
      setAiLoading(false);
    }
  }

  const selectedAiComment =
    aiComments.find(
      (comment) => comment.characterId === selectedAiCharacterId,
    ) ?? aiComments[0];

  return (
    <PageShell
      title={
        <h1 className="analysis-page-title">
          <span>🎣</span> 釣行通信簿
        </h1>
      }
      titleLayout="left"
      maxWidth={1320}
      showBack
      onBack={back}
      scrollY="auto"
    >
      <style>{`
        .analysis-root { display:grid; gap:14px; padding-bottom:32px; color:#fff; }
        .analysis-page-title { margin:0; font-size:clamp(22px,3vw,34px); line-height:1.1; letter-spacing:.04em; }
        .analysis-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .analysis-toolbar button, .analysis-toolbar select {
          border:1px solid rgba(255,255,255,.16); background:rgba(10,18,32,.62);
          color:#fff; border-radius:999px; padding:8px 12px; font:inherit;
        }
        .analysis-toolbar button { cursor:pointer; }
        .analysis-toolbar button:disabled { opacity:.5; cursor:not-allowed; }
        .analysis-stage { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; align-items:start; }
        .analysis-main { display:grid; gap:14px; min-width:0; }
        .analysis-ai-sidebar {
          position:relative; top:auto; align-self:start; display:grid;
          grid-template-columns:auto minmax(0,1fr); gap:14px 18px;
          min-width:0; max-width:100%; padding:20px; border-radius:22px;
          border:1px solid rgba(255,255,255,.14);
          background:linear-gradient(145deg,rgba(17,28,46,.76),rgba(26,15,43,.66));
          box-shadow:0 16px 40px rgba(0,0,0,.18);
        }
        .analysis-ai-sidebar h2 { grid-column:1/-1; margin:0; font-size:20px; }
        .analysis-ai-sidebar-note { grid-column:1/-1; margin:-8px 0 0; color:rgba(255,255,255,.58); font-size:11px; line-height:1.6; }
        .analysis-ai-tabs { display:flex; gap:12px; flex-wrap:wrap; align-content:start; }
        .analysis-ai-tab {
          position:relative; width:82px; height:82px; padding:0; overflow:hidden; border-radius:50%; cursor:pointer;
          border:2px solid color-mix(in srgb,var(--ai-accent) 55%,transparent);
          background:color-mix(in srgb,var(--ai-accent) 18%,rgba(12,20,34,.9));
          color:#fff; font-weight:900;
        }
        .analysis-ai-tab[data-active="true"] {
          border-color:color-mix(in srgb,var(--ai-accent) 80%,white);
          box-shadow:0 0 0 3px color-mix(in srgb,var(--ai-accent) 20%,transparent);
          transform:translateY(-2px);
        }
        .analysis-ai-tab img { position:absolute; inset:0; z-index:2; width:100%; height:100%; object-fit:cover; display:block; }
        .analysis-ai-tab span { position:relative; z-index:1; font-size:20px; }
        .analysis-ai-bubble {
          position:relative; min-height:132px; padding:18px; border-radius:18px;
          border:1px solid color-mix(in srgb,var(--ai-accent) 32%,transparent);
          background:color-mix(in srgb,var(--ai-accent) 9%,rgba(255,255,255,.035));
        }
        .analysis-ai-bubble strong { display:block; margin-bottom:9px; color:var(--ai-accent); font-size:15px; }
        .analysis-ai-bubble p { margin:0; color:rgba(255,255,255,.88); font-size:14px; line-height:1.8; white-space:pre-wrap; }
        .analysis-ai-time { grid-column:1/-1; color:rgba(255,255,255,.42); font-size:10px; }
        .analysis-ai-error { color:#ff9dad; font-size:10px; line-height:1.5; }
        .analysis-dashboard { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:14px; }
        .analysis-grid-2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
        .analysis-grid-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .analysis-panel { overflow:hidden; }
        .analysis-heading { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .analysis-heading-icon { display:grid; place-items:center; width:38px; height:38px; border-radius:13px;
          background:linear-gradient(145deg,rgba(255,111,166,.28),rgba(114,215,255,.22)); font-size:20px; flex:0 0 auto; }
        .analysis-heading h2 { margin:0; font-size:16px; }
        .analysis-heading p { margin:3px 0 0; color:rgba(255,255,255,.58); font-size:11px; }
        .analysis-hero { display:grid; grid-template-columns:180px 1fr; gap:18px; align-items:center; min-height:230px; }
        .analysis-grade { display:grid; place-items:center; width:154px; aspect-ratio:1; border-radius:50%;
          background:radial-gradient(circle at 35% 25%,rgba(255,255,255,.28),rgba(255,111,166,.20) 34%,rgba(114,215,255,.12) 68%,rgba(0,0,0,.18));
          border:2px solid rgba(255,179,208,.66); box-shadow:0 0 34px rgba(255,111,166,.20),inset 0 0 28px rgba(255,255,255,.06); }
        .analysis-grade small { display:block; font-size:11px; color:rgba(255,255,255,.65); text-align:center; }
        .analysis-grade strong { display:block; font-size:52px; line-height:1; color:#ffd4e5; text-shadow:0 0 20px rgba(255,111,166,.55); text-align:center; }
        .analysis-score-copy h3 { margin:0 0 7px; font-size:clamp(20px,2.5vw,28px); }
        .analysis-score-copy p { margin:0; color:rgba(255,255,255,.68); font-size:12px; line-height:1.7; }
        .analysis-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:14px; }
        .analysis-metric { min-width:0; border:1px solid; border-radius:16px; padding:12px; }
        .analysis-metric-label { display:flex; gap:5px; align-items:center; color:rgba(255,255,255,.66); font-size:11px; }
        .analysis-metric strong { display:block; margin:5px 0 2px; font-size:clamp(19px,2.2vw,27px); line-height:1.1; white-space:nowrap; }
        .analysis-metric small { display:block; color:rgba(255,255,255,.5); font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .analysis-radar { width:100%; max-width:310px; display:block; margin:auto; overflow:visible; }
        .analysis-trend { width:100%; display:block; min-height:210px; }
        .analysis-bar-list { display:grid; gap:10px; }
        .analysis-bar-row { display:grid; grid-template-columns:minmax(80px,130px) minmax(70px,1fr) auto; align-items:center; gap:9px; }
        .analysis-bar-label { font-size:12px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .analysis-bar-track { height:10px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.08); }
        .analysis-bar-fill { height:100%; min-width:2px; border-radius:inherit; transition:width .35s ease; }
        .analysis-bar-value { font-size:11px; color:rgba(255,255,255,.68); white-space:nowrap; }
        .analysis-pattern-list { display:grid; gap:10px; }
        .analysis-pattern { display:grid; grid-template-columns:38px 1fr auto; align-items:center; gap:10px; padding:11px;
          border-radius:16px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); }
        .analysis-rank { display:grid; place-items:center; width:34px; height:34px; border-radius:11px;
          background:linear-gradient(145deg,#ff719f55,#ffd16633); font-weight:900; color:#ffd6e5; }
        .analysis-pattern strong { display:block; font-size:13px; }
        .analysis-pattern small { display:block; margin-top:3px; color:rgba(255,255,255,.58); font-size:10px; }
        .analysis-pattern-rate { text-align:right; }
        .analysis-pattern-rate strong { color:#ff9fc5; font-size:17px; }
        .analysis-confidence { font-size:9px; font-weight:800; }
        .analysis-heatmap { display:grid; grid-template-columns:54px repeat(3,minmax(68px,1fr)); gap:6px; align-items:stretch; }
        .analysis-heat-label { display:grid; place-items:center; min-height:34px; color:rgba(255,255,255,.62); font-size:10px; font-weight:700; }
        .analysis-heat-cell { min-height:58px; border:1px solid rgba(255,255,255,.1); border-radius:12px; display:grid; place-items:center; text-align:center; padding:5px; }
        .analysis-heat-cell strong { display:block; font-size:14px; }
        .analysis-heat-cell small { display:block; color:rgba(255,255,255,.6); font-size:9px; }
        .analysis-species-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .analysis-species { border:1px solid rgba(255,255,255,.11); border-radius:17px; background:rgba(255,255,255,.04); overflow:hidden; }
        .analysis-species summary { cursor:pointer; list-style:none; padding:12px; }
        .analysis-species summary::-webkit-details-marker { display:none; }
        .analysis-species-top { display:flex; justify-content:space-between; gap:10px; align-items:center; }
        .analysis-species-name { font-size:14px; font-weight:900; }
        .analysis-species-total { color:#72d7ff; font-size:17px; font-weight:900; white-space:nowrap; }
        .analysis-species-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:9px; }
        .analysis-species-stat { padding:7px; border-radius:10px; background:rgba(0,0,0,.14); }
        .analysis-species-stat small { display:block; color:rgba(255,255,255,.48); font-size:9px; }
        .analysis-species-stat strong { display:block; margin-top:2px; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .analysis-species-detail { padding:0 12px 12px; border-top:1px solid rgba(255,255,255,.08); }
        .analysis-species-detail h4 { margin:10px 0 6px; font-size:10px; color:rgba(255,255,255,.52); }
        .analysis-chips { display:flex; gap:5px; flex-wrap:wrap; }
        .analysis-chip { border-radius:999px; padding:5px 8px; background:rgba(255,255,255,.07); font-size:10px; }
        .analysis-tackle-list { display:grid; gap:9px; }
        .analysis-tackle { display:grid; grid-template-columns:minmax(0,1fr) 72px; gap:12px; align-items:center; padding:10px;
          border-radius:14px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); }
        .analysis-tackle strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
        .analysis-tackle small { display:block; margin-top:4px; color:rgba(255,255,255,.55); font-size:9px; }
        .analysis-tackle-rate { text-align:right; color:#79f2c0; font-weight:900; }
        .analysis-voices { position:relative; background:linear-gradient(135deg,rgba(255,114,172,.16),rgba(108,201,255,.12)); }
        .analysis-voice-list { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
        .analysis-voice {
          --voice-accent:#fff;
          position:relative; display:grid; grid-template-columns:42px minmax(0,1fr); gap:10px;
          align-items:start; min-width:0; padding:12px; border-radius:16px;
          border:1px solid color-mix(in srgb,var(--voice-accent) 34%,transparent);
          background:linear-gradient(145deg,color-mix(in srgb,var(--voice-accent) 12%,rgba(7,15,28,.64)),rgba(9,14,27,.48));
        }
        .analysis-voice::after {
          content:""; position:absolute; left:47px; top:20px; width:8px; height:8px;
          background:color-mix(in srgb,var(--voice-accent) 16%,rgba(7,15,28,.72));
          border-left:1px solid color-mix(in srgb,var(--voice-accent) 34%,transparent);
          border-bottom:1px solid color-mix(in srgb,var(--voice-accent) 34%,transparent);
          transform:rotate(45deg);
        }
        .analysis-voice-mark {
          position:relative; z-index:1; display:grid; place-items:center; width:42px; height:42px;
          border-radius:50%; color:#fff; font-size:16px; font-weight:900;
          border:2px solid color-mix(in srgb,var(--voice-accent) 72%,white);
          background:linear-gradient(145deg,color-mix(in srgb,var(--voice-accent) 78%,white 4%),rgba(18,25,43,.94));
          box-shadow:0 6px 18px color-mix(in srgb,var(--voice-accent) 22%,transparent);
        }
        .analysis-voice-head { display:flex; align-items:baseline; gap:6px; min-width:0; margin-bottom:5px; }
        .analysis-voice-name { color:var(--voice-accent); font-size:12px; font-weight:900; white-space:nowrap; }
        .analysis-voice-role { color:rgba(255,255,255,.44); font-size:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .analysis-voice p { margin:0; color:rgba(255,255,255,.78); font-size:10px; line-height:1.68; }
        .analysis-mission { position:relative; overflow:hidden; background:linear-gradient(135deg,rgba(255,81,142,.28),rgba(83,177,255,.20)); }
        .analysis-mission::after { content:"🎯"; position:absolute; right:12px; bottom:-20px; font-size:88px; opacity:.10; transform:rotate(-8deg); }
        .analysis-mission h3 { margin:0 0 7px; color:#ffd2e3; font-size:19px; }
        .analysis-mission p { position:relative; z-index:1; margin:0; max-width:760px; color:rgba(255,255,255,.72); font-size:12px; line-height:1.75; }
        .analysis-empty { color:rgba(255,255,255,.58); font-size:12px; padding:12px 0; }
        .analysis-error { padding:12px 14px; color:#ff9aab; border:1px solid #ff6b8155; border-radius:14px; background:#5c172544; }
        .analysis-footnote { margin-top:10px; color:rgba(255,255,255,.42); font-size:9px; line-height:1.5; }
        @media (max-width:900px) {
          .analysis-stage { grid-template-columns:1fr; }
          .analysis-ai-sidebar { position:relative; top:auto; }
          .analysis-dashboard,.analysis-grid-2 { grid-template-columns:1fr; }
          .analysis-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .analysis-voice-list { grid-template-columns:repeat(2,minmax(0,1fr)); }
        }
        @media (max-width:620px) {
          .analysis-ai-sidebar { grid-template-columns:1fr; padding:16px; }
          .analysis-ai-tabs { grid-column:1; flex-wrap:nowrap; overflow-x:auto; padding:3px; scrollbar-width:none; }
          .analysis-ai-tabs::-webkit-scrollbar { display:none; }
          .analysis-ai-tab { flex:0 0 66px; width:66px; height:66px; }
          .analysis-ai-bubble { min-height:132px; padding:14px; }
          .analysis-ai-bubble p { font-size:13px; }
          .analysis-hero { grid-template-columns:1fr; text-align:center; }
          .analysis-grade { width:132px; margin:auto; }
          .analysis-score-copy p { text-align:left; }
          .analysis-species-list { grid-template-columns:1fr; }
          .analysis-bar-row { grid-template-columns:76px 1fr; }
          .analysis-bar-value { grid-column:2; margin-top:-5px; }
          .analysis-heatmap { grid-template-columns:40px repeat(3,minmax(58px,1fr)); gap:4px; }
          .analysis-heat-cell { min-height:52px; padding:3px; }
          .analysis-voice-list { grid-template-columns:1fr; }
          .analysis-voice p { font-size:11px; }
        }
      `}</style>

      <div className="analysis-root">
        <div className="analysis-toolbar">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
          >
            {loading ? "読み込み中…" : "↻ 最新データに更新"}
          </button>
          <label>
            表示数{" "}
            <select
              value={limitTop}
              onChange={(event) => setLimitTop(Number(event.target.value))}
            >
              {[3, 5, 8, 10].map((value) => (
                <option key={value} value={value}>
                  上位{value}件
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void requestAiComments()}
            disabled={aiLoading || loading}
          >
            {aiLoading
              ? "✨ みんなが通信簿を読んでる…"
              : aiComments.length > 0
                ? "✨ みんなにもう一度聞く"
                : "✨ みんなにコメントをもらう"}
          </button>
        </div>

        {error && <div className="analysis-error">読み込みエラー：{error}</div>}
        {aiError && <div className="analysis-error">コメント生成エラー：{aiError}</div>}

        <div className="analysis-stage">
        <div className="analysis-main">
        <div className="analysis-dashboard">
          <Panel
            title="ひろっちの釣行通信簿"
            icon="🏆"
            note="自分の記録量と実績から算出。他の釣り人との比較ではありません"
          >
            <div className="analysis-hero">
              <div className="analysis-grade">
                <div>
                  <small>総合ランク</small>
                  <strong>{grade}</strong>
                  <small>
                    {totalTrips < 3
                      ? "あと少しで解析開始"
                      : `${overallScore} / 100`}
                  </small>
                </div>
              </div>
              <div className="analysis-score-copy">
                <h3>
                  {totalTrips < 3
                    ? "冒険の記録は、ここから始まる"
                    : catchRate >= 0.5
                      ? "勝ち筋が輪郭を見せてきた"
                      : "いまは攻略データを鍛える時期"}
                </h3>
                <p>
                  成功率だけでなく、釣果の安定度・数・サイズ記録・魚種幅・
                  再現できそうな条件を合わせて評価。記録が増えるほど、
                  ひろっち専用の通信簿へ育っていくよ。
                </p>
              </div>
            </div>
            <div className="analysis-metrics">
              <Metric
                icon="🧾"
                label="釣行"
                value={`${totalTrips}回`}
                sub={`${caughtTrips}回キャッチ`}
                color="#a8b8ff"
              />
              <Metric
                icon="🎯"
                label="キャッチ率"
                value={fmtPct(catchRate)}
                sub={`Wilson下限 ${fmtPct(wilsonLower(caughtTrips, totalTrips))}`}
                color="#ff91b9"
              />
              <Metric
                icon="🐟"
                label="総釣果"
                value={`${totalFish}匹`}
                sub={`${uniqueSpecies}魚種`}
                color="#72d7ff"
              />
              <Metric
                icon="📏"
                label="最大サイズ"
                value={fmtSize(maxSize)}
                sub={`平均 ${fmtSize(avgSize)}`}
                color="#ffd166"
              />
            </div>
          </Panel>

          <Panel
            title="釣りスタイル"
            icon="🧭"
            note="100点満点ではなく、現在の記録の形を可視化"
          >
            <RadarChart axes={styleAxes} />
          </Panel>
        </div>

        <Panel
          title="みんなから、ひとこと"
          icon="💬"
          note="同じ分析結果を、それぞれの視点で見ています"
          className="analysis-voices"
        >
          <div className="analysis-voice-list">
            {characterComments.map((comment) => (
              <article
                className="analysis-voice"
                key={comment.id}
                style={
                  {
                    "--voice-accent": comment.accent,
                  } as CSSProperties
                }
              >
                <div className="analysis-voice-mark" aria-hidden="true">
                  {comment.mark}
                </div>
                <div>
                  <div className="analysis-voice-head">
                    <span className="analysis-voice-name">{comment.name}</span>
                    <span className="analysis-voice-role">{comment.role}</span>
                  </div>
                  <p>{comment.text}</p>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        {aiComments.length > 0 && selectedAiComment && (
          <aside className="analysis-ai-sidebar" aria-label="みんなのGPTコメント">
            <h2>✨ 釣嫁評議会</h2>
            <p className="analysis-ai-sidebar-note">
              アイコンを選ぶと、それぞれのコメントを読めるよ
            </p>
            <div className="analysis-ai-tabs">
              {aiComments.map((comment) => (
                <button
                  type="button"
                  className="analysis-ai-tab"
                  key={comment.characterId}
                  data-active={comment.characterId === selectedAiComment.characterId}
                  aria-label={`${comment.characterName}のコメント`}
                  onClick={() => setSelectedAiCharacterId(comment.characterId)}
                  style={
                    { "--ai-accent": comment.color } as CSSProperties
                  }
                >
                  <img
                    src={iconPath(
                      comment.characterId,
                      comment.characterName,
                    )}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <span>{comment.characterName.slice(0, 1)}</span>
                </button>
              ))}
            </div>
            <div
              className="analysis-ai-bubble"
              style={
                { "--ai-accent": selectedAiComment.color } as CSSProperties
              }
            >
              <strong>{selectedAiComment.characterName}</strong>
              <p>{selectedAiComment.text}</p>
            </div>
            {aiGeneratedAt && (
              <div className="analysis-ai-time">
                {new Date(aiGeneratedAt).toLocaleString("ja-JP")} に生成
              </div>
            )}
          </aside>
        )}

        <div className="analysis-grid-2">
          <Panel
            title="成長グラフ"
            icon="📈"
            note="直近12か月・棒は匹数、線はキャッチ率"
          >
            <TrendChart rows={monthly} />
          </Panel>

          <Panel
            title="ベストパターン"
            icon="⚡"
            note="少数データを過大評価しない信頼度補正つき"
          >
            {patterns.length === 0 ? (
              <div className="analysis-empty">
                条件を比較できる記録がまだ無いよ
              </div>
            ) : (
              <div className="analysis-pattern-list">
                {patterns.map((pattern, index) => {
                  const level = confidence(pattern.total);
                  return (
                    <div className="analysis-pattern" key={pattern.key}>
                      <div className="analysis-rank">{index + 1}</div>
                      <div>
                        <strong>{pattern.key}</strong>
                        <small>
                          相性候補：{pattern.bestLure} ・ {pattern.caught}/
                          {pattern.total}釣行
                        </small>
                      </div>
                      <div className="analysis-pattern-rate">
                        <strong>{fmtPct(pattern.rate)}</strong>
                        <div
                          className="analysis-confidence"
                          style={{ color: level.tone }}
                        >
                          {level.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="analysis-grid-2">
          <Panel
            title="条件ヒートマップ"
            icon="🌊"
            note="時間帯 × 潮の動き／色が明るいほど好成績"
          >
            <div className="analysis-heatmap">
              <div />
              {TREND_ORDER.map((trend) => (
                <div className="analysis-heat-label" key={trend}>
                  {trend}
                </div>
              ))}
              {TIMEBANDS.map((band) => {
                const time = TIMEBAND_LABEL[band];
                return [
                  <div className="analysis-heat-label" key={`label:${time}`}>
                    {time}
                  </div>,
                  ...TREND_ORDER.map((trend) => {
                    const row = heatmap.get(`${time}|${trend}`);
                    const rate = row ? safeRate(row.caught, row.total) : 0;
                    const alpha = row ? 0.12 + rate * 0.52 : 0.035;
                    return (
                      <div
                        className="analysis-heat-cell"
                        key={`${time}:${trend}`}
                        style={{
                          background: row
                            ? `linear-gradient(145deg, rgba(255,95,155,${alpha}), rgba(255,205,102,${alpha * 0.65}))`
                            : "rgba(255,255,255,.025)",
                        }}
                      >
                        <div>
                          <strong>{row ? fmtPct(rate) : "—"}</strong>
                          <small>
                            {row ? `${row.caught}/${row.total}釣行` : "未解析"}
                          </small>
                        </div>
                      </div>
                    );
                  }),
                ];
              })}
            </div>
          </Panel>

          <Panel
            title="条件別キャッチ率"
            icon="🕒"
            note="回数も見ながら、得意な時間と潮を確認"
          >
            <div className="analysis-grid-2">
              <div>
                <div className="analysis-bar-list">
                  {timeStats.map((row) => (
                    <BarRow
                      key={row.key}
                      label={row.key}
                      value={row.rate}
                      max={1}
                      text={`${fmtPct(row.rate)} (${row.caught}/${row.total})`}
                      color="#ff70aa"
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="analysis-bar-list">
                  {tideStats.map((row) => (
                    <BarRow
                      key={row.key}
                      label={row.key}
                      value={row.rate}
                      max={1}
                      text={`${fmtPct(row.rate)} (${row.caught}/${row.total})`}
                      color="#72d7ff"
                    />
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="ルアー・釣法別戦績"
          icon="🪤"
          note="使用回数にはボウズも含みます"
        >
          {lureInsights.length === 0 ? (
            <div className="analysis-empty">
              使用したルアー・釣法を記録すると戦績が育つよ
            </div>
          ) : (
            <div className="analysis-bar-list">
              {lureInsights.map((row) => (
                <BarRow
                  key={row.lureType}
                  label={row.label}
                  value={row.rate}
                  max={1}
                  text={`${fmtPct(row.rate)} (${row.caught}/${row.total}釣行)`}
                  color="#ff70aa"
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="魚種別 攻略カルテ"
          icon="🐟"
          note="カードを押すと内訳を展開"
        >
          {speciesInsights.length === 0 ? (
            <div className="analysis-empty">
              魚データが入ると魚種別カルテが育つよ
            </div>
          ) : (
            <div className="analysis-species-list">
              {speciesInsights.map((row) => (
                <details className="analysis-species" key={row.species}>
                  <summary>
                    <div className="analysis-species-top">
                      <span className="analysis-species-name">
                        {row.species}
                      </span>
                      <span className="analysis-species-total">
                        {row.totalCount}匹
                      </span>
                    </div>
                    <div className="analysis-species-stats">
                      <div className="analysis-species-stat">
                        <small>ベスト時間</small>
                        <strong>{row.bestTime}</strong>
                      </div>
                      <div className="analysis-species-stat">
                        <small>相性ルアー</small>
                        <strong>{row.bestLure}</strong>
                      </div>
                      <div className="analysis-species-stat">
                        <small>潮の動き</small>
                        <strong>{row.bestTrend}</strong>
                      </div>
                    </div>
                    <div className="analysis-species-stats">
                      <div className="analysis-species-stat">
                        <small>平均</small>
                        <strong>{fmtSize(row.avgSizeCm)}</strong>
                      </div>
                      <div className="analysis-species-stat">
                        <small>最大</small>
                        <strong>{fmtSize(row.maxSizeCm)}</strong>
                      </div>
                      <div className="analysis-species-stat">
                        <small>詳細</small>
                        <strong>タップで展開</strong>
                      </div>
                    </div>
                  </summary>
                  <div className="analysis-species-detail">
                    <h4>時間帯</h4>
                    <div className="analysis-chips">
                      {row.timeRows.map((item) => (
                        <span className="analysis-chip" key={item.key}>
                          {item.key} {item.value}匹
                        </span>
                      ))}
                    </div>
                    <h4>ルアー</h4>
                    <div className="analysis-chips">
                      {row.lureRows.map((item) => (
                        <span className="analysis-chip" key={item.key}>
                          {item.key} {item.value}匹
                        </span>
                      ))}
                    </div>
                    <h4>潮の動き</h4>
                    <div className="analysis-chips">
                      {row.trendRows.map((item) => (
                        <span className="analysis-chip" key={item.key}>
                          {item.key} {item.value}匹
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Panel>

        <div className="analysis-grid-2">
          {(
            [
              { title: "ロッド戦績", icon: "🛠", rows: tackleInsights.rods },
              { title: "リール戦績", icon: "⚙️", rows: tackleInsights.reels },
            ] as const
          ).map((group) => (
            <Panel
              key={group.title}
              title={group.title}
              icon={group.icon}
              note="使用回数にはボウズも含みます"
            >
              {group.rows.length === 0 ? (
                <div className="analysis-empty">
                  使用タックルの記録がまだ無いよ
                </div>
              ) : (
                <div className="analysis-tackle-list">
                  {group.rows.map((row) => (
                    <div className="analysis-tackle" key={row.id}>
                      <div>
                        <strong title={row.label}>{row.label}</strong>
                        <small>
                          使用 {row.useCount}回 ・ {row.totalFish}匹 ・ 相性魚種{" "}
                          {row.bestSpecies}
                        </small>
                      </div>
                      <div className="analysis-tackle-rate">
                        {fmtPct(row.rate)}
                        <small>{confidence(row.useCount).label}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>

        {(envStats.wind.some((row) => row.total > 0) ||
          envStats.wave.some((row) => row.total > 0)) && (
          <Panel
            title="風・波との相性"
            icon="🌦"
            note="保存済みの環境値がある釣行だけで集計"
          >
            <div className="analysis-grid-2">
              <div className="analysis-bar-list">
                {envStats.wind
                  .filter((row) => row.total > 0)
                  .map((row) => (
                    <BarRow
                      key={row.label}
                      label={`風 ${row.label}`}
                      value={row.rate}
                      max={1}
                      text={`${fmtPct(row.rate)} (${row.caught}/${row.total})`}
                      color="#8ea8ff"
                    />
                  ))}
              </div>
              <div className="analysis-bar-list">
                {envStats.wave
                  .filter((row) => row.total > 0)
                  .map((row) => (
                    <BarRow
                      key={row.label}
                      label={`波 ${row.label}`}
                      value={row.rate}
                      max={1}
                      text={`${fmtPct(row.rate)} (${row.caught}/${row.total})`}
                      color="#58d8dc"
                    />
                  ))}
              </div>
            </div>
          </Panel>
        )}

        <section className="analysis-panel analysis-mission" style={panelStyle}>
          <div className="analysis-heading">
            <span className="analysis-heading-icon">🎯</span>
            <div>
              <h2>次の攻略ミッション</h2>
              <p>保存済みデータから、次に検証すると面白い条件をひとつ選出</p>
            </div>
          </div>
          <h3>{mission.title}</h3>
          <p>{mission.text}</p>
        </section>

        <div className="analysis-footnote">
          ※
          ランクとレーダーは、釣果の良し悪しだけでなく記録の充実度も含む「自分用の成長指標」です。
          サンプルが少ない条件はWilson下限で補正し、「未解析」や「暫定」として扱います。
        </div>
        </div>
        </div>
      </div>
    </PageShell>
  );
}
