// src/screens/RecordHistory.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  db,
  type TripRecord,
  type TripPhoto,
  type TripFish,
  type TackleItem,
} from "../db";
import { getTimeBand } from "../lib/timeband";
import { FIXED_PORT } from "../points";
import { getTideAtTime } from "../lib/tide736";
import { getTide736DayCached, type TideCacheSource } from "../lib/tide736Cache";
import { getTidePhaseFromSeries } from "../lib/tidePhase736";
import TideGraph from "../components/TideGraph";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";
import { formatRodLabel, formatReelLabel } from "../lib/tackle";

type Props = { back: () => void };

type TideInfo = { cm: number; trend: string };

type DetailTide = {
  series: Array<{ unix?: number; cm: number; time?: string }>;
  tideName?: string | null;
  source: TideCacheSource;
  isStale: boolean;
};

type CachedUrl = {
  url: string;
  revoke: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKeyFromISO(iso: string): { d: Date; key: string } {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate(),
  )}`;
  return { d, key };
}

function displayPhaseForHeader(phase: string): string {
  const hide = new Set(["上げ", "下げ", "上げ始め", "下げ始め", "止まり"]);
  return hide.has(phase) ? "" : phase;
}

function sourceLabel(
  source: TideCacheSource | null,
  isStale: boolean,
): { text: string; color: string } | null {
  if (!source) return null;
  if (source === "fetch") return { text: "取得", color: "#0a6" };
  if (source === "cache") return { text: "キャッシュ", color: "#6cf" };
  return { text: isStale ? "期限切れキャッシュ" : "キャッシュ", color: "#f6c" };
}

function useIsMobile(): boolean {
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

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function pickUnknown(
  obj: Record<string, unknown>,
  keys: string[],
): unknown | undefined {
  for (const key of keys) {
    if (key in obj) {
      const v = obj[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

function pickText(obj: Record<string, unknown>, keys: string[]): string {
  const v = pickUnknown(obj, keys);
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  const v = pickUnknown(obj, keys);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pushUniqueLine(target: string[], value: unknown): void {
  if (value == null) return;
  const s = String(value).trim();
  if (!s) return;
  if (!target.includes(s)) target.push(s);
}

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSpeciesLabel(raw: string): string {
  const src = raw.trim();
  if (!src) return "魚種不明";

  const key = src.toLowerCase().replace(/[\s-]+/g, "_");

  const map: Record<string, string> = {
    spanish_mackerel: "サワラ",
    japanese_spanish_mackerel: "サワラ",
    yellowtail: "ブリ",
    amberjack: "カンパチ",
    greater_amberjack: "ヒラマサ",
    seabass: "シーバス",
    sea_bass: "シーバス",
    japanese_seabass: "シーバス",
    black_seabream: "チヌ",
    black_bream: "チヌ",
    red_seabream: "マダイ",
    sea_bream: "タイ",
    horse_mackerel: "アジ",
    mackerel: "サバ",
    chub_mackerel: "サバ",
    sardine: "イワシ",
    flounder: "ヒラメ",
    olive_flounder: "ヒラメ",
    halibut: "ヒラメ",
    flathead: "マゴチ",
    goby: "ハゼ",
    mullet: "ボラ",
    catfish: "ナマズ",
    largemouth_bass: "ブラックバス",
    smallmouth_bass: "スモールマウスバス",
    bass: "バス",
    snakehead: "ライギョ",
    trout: "トラウト",
    rainbow_trout: "ニジマス",
    char: "イワナ",
    salmon: "サケ",
    tuna: "マグロ",
    bonito: "カツオ",
    barracuda: "カマス",
    rockfish: "カサゴ",
    scorpionfish: "カサゴ",
    grunt: "メッキ",
    trevally: "メッキ",
    cutlassfish: "タチウオ",
    hairtail: "タチウオ",
  };

  if (map[key]) return map[key];

  if (/^[a-z0-9 _-]+$/i.test(src)) {
    return humanizeToken(src);
  }

  return src;
}

function normalizeLureLabel(raw: string): string {
  const src = raw.trim();
  if (!src) return "";

  const key = src.toLowerCase().replace(/[\s-]+/g, "_");

  const exactMap: Record<string, string> = {
    metaljig: "メタルジグ",
    metal_jig: "メタルジグ",
    top: "トップ",
    topwater: "トップウォーター",
    blade: "ブレード",
    minnow: "ミノー",
    sinking_minnow: "シンキングミノー",
    floating_minnow: "フローティングミノー",
    suspending_minnow: "サスペンドミノー",
    pencil: "ペンシル",
    pencil_bait: "ペンシルベイト",
    popper: "ポッパー",
    vib: "バイブ",
    vibration: "バイブレーション",
    metal_vib: "メタルバイブ",
    jig: "ジグ",
    spin_tail: "スピンテール",
    spinnerbait: "スピナーベイト",
    buzzbait: "バズベイト",
    chatterbait: "チャターベイト",
    crankbait: "クランクベイト",
    jerkbait: "ジャークベイト",
    swimbait: "スイムベイト",
    worm: "ワーム",
    softbait: "ソフトベイト",
    soft_bait: "ソフトベイト",
    frog: "フロッグ",
    spoon: "スプーン",
  };

  if (exactMap[key]) return exactMap[key];

  const parts = src
    .split(/[|/,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    return parts
      .map((p) => normalizeLureLabel(p))
      .filter(Boolean)
      .join(" / ");
  }

  if (/^[a-z0-9 _-]+$/i.test(src)) {
    return humanizeToken(src);
  }

  return src;
}

function collectLureCandidatesFromValue(value: unknown, out: string[]): void {
  if (value == null) return;

  if (typeof value === "string" || typeof value === "number") {
    const normalized = normalizeLureLabel(String(value));
    pushUniqueLine(out, normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectLureCandidatesFromValue(item, out);
    return;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred = ["name", "model", "brand", "maker", "series", "color"];
    const parts = preferred
      .map((k) => obj[k])
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => normalizeLureLabel(String(v).trim()));

    if (parts.length > 0) {
      pushUniqueLine(out, parts.join(" / "));
      return;
    }

    for (const v of Object.values(obj)) {
      if (typeof v === "string" || typeof v === "number") {
        pushUniqueLine(out, normalizeLureLabel(String(v)));
      }
    }
  }
}

function extractLureLines(trip: TripRecord, fish: TripFish[]): string[] {
  const lines: string[] = [];

  const scan = (obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj)) {
      if (/lure|ルアー/i.test(key)) {
        collectLureCandidatesFromValue(value, lines);
      }
    }
  };

  scan(asObj(trip));
  for (const row of fish) scan(asObj(row));

  const explicitKeys = [
    "lure",
    "lureName",
    "lureNames",
    "usedLure",
    "usedLures",
    "lureText",
    "lureMemo",
    "lures",
    "hitLure",
    "hitLureName",
    "selectedLure",
    "selectedLures",
    "used_lure",
    "used_lures",
  ];

  const tripObj = asObj(trip);
  for (const key of explicitKeys) {
    collectLureCandidatesFromValue(tripObj[key], lines);
  }

  for (const row of fish) {
    const obj = asObj(row);
    for (const key of explicitKeys) {
      collectLureCandidatesFromValue(obj[key], lines);
    }
  }

  return lines.filter((v) => !/^(なし|no|none)$/i.test(v.trim()));
}

function extractWeatherLines(
  trip: TripRecord,
  base: Date,
  tide: TideInfo | undefined,
  detailTide: DetailTide | null,
  phase: string,
): Array<{ label: string; value: string }> {
  const tripObj = asObj(trip);
  const rows: Array<{ label: string; value: string }> = [];

  const weather = pickText(tripObj, ["weather", "weatherText", "sky"]);
  const windDir = pickText(tripObj, ["windDir", "windDirection"]);
  const windSpeed = pickText(tripObj, [
    "windSpeed",
    "windSpeedMs",
    "windSpeedMps",
    "wind",
  ]);
  const airTemp = pickNumber(tripObj, ["airTemp", "airTempC", "tempC", "temp"]);
  const waterTemp = pickNumber(tripObj, ["waterTemp", "waterTempC"]);
  const pressure = pickNumber(tripObj, ["pressure", "pressureHpa"]);
  const wave = pickNumber(tripObj, ["waveHeight", "waveHeightCm"]);

  if (weather) rows.push({ label: "天気", value: weather });
  if (Number.isFinite(airTemp ?? NaN))
    rows.push({ label: "気温", value: `${airTemp}℃` });
  if (Number.isFinite(waterTemp ?? NaN))
    rows.push({ label: "水温", value: `${waterTemp}℃` });

  if (windDir || windSpeed) {
    rows.push({
      label: "風",
      value:
        [
          windDir,
          windSpeed
            ? `${windSpeed}${windSpeed.includes("m") ? "" : "m/s"}`
            : "",
        ]
          .filter(Boolean)
          .join(" / ") || "（なし）",
    });
  }

  if (Number.isFinite(pressure ?? NaN))
    rows.push({ label: "気圧", value: `${pressure}hPa` });

  if (Number.isFinite(wave ?? NaN))
    rows.push({ label: "波", value: `${wave}cm` });

  rows.push({
    label: "時間帯",
    value: Number.isFinite(base.getTime()) ? getTimeBand(base) : "（不明）",
  });

  if (detailTide?.tideName) {
    rows.push({ label: "潮", value: detailTide.tideName });
  }

  if (phase) {
    rows.push({ label: "潮の局面", value: phase });
  }

  rows.push({
    label: "潮位",
    value: tide ? `${tide.cm}cm / ${tide.trend}` : "（なし）",
  });

  return rows;
}

function formatOutcomeLine(trip: TripRecord, fish: TripFish[]): string {
  if (trip.outcome === "skunk") return "😇 釣れなかった（ボウズ）";
  if (trip.outcome === "caught") {
    if (fish.length === 0) return "🎣 釣れた：不明";
    const top = fish[0];
    const sp = top.species?.trim()
      ? normalizeSpeciesLabel(top.species.trim())
      : "不明";
    const sz =
      typeof top.sizeCm === "number" && Number.isFinite(top.sizeCm)
        ? `${top.sizeCm}cm`
        : "サイズ不明";
    return `🎣 釣れた：${sp} / ${sz}`;
  }
  return "❔ 結果未入力";
}

function formatFishLine(row: TripFish): string {
  const sp = row.species?.trim()
    ? normalizeSpeciesLabel(row.species.trim())
    : "魚種不明";
  const parts: string[] = [sp];

  if (typeof row.sizeCm === "number" && Number.isFinite(row.sizeCm)) {
    parts.push(`${row.sizeCm}cm`);
  }

  const obj = asObj(row);
  const count = pickNumber(obj, ["count", "qty", "quantity"]);
  if (Number.isFinite(count ?? NaN) && (count ?? 0) > 1) {
    parts.push(`${count}匹`);
  }

  return parts.join(" / ");
}

function hasUsableLocalBlob(photo: TripPhoto | undefined | null): boolean {
  if (!photo?.photoBlob) return false;
  return photo.photoBlob.size > 0;
}

function buildRemotePhotoUrl(remoteKey: string): string {
  return `/api/photo-file?key=${encodeURIComponent(remoteKey)}`;
}

function getRodDisplay(
  trip: TripRecord,
  tackleMap: Map<number, TackleItem>,
): string {
  if (trip.rodId == null) return "—";
  const tackle = tackleMap.get(trip.rodId);
  if (!tackle || tackle.kind !== "rod") return "不明なロッド";
  return formatRodLabel(tackle);
}

function getReelDisplay(
  trip: TripRecord,
  tackleMap: Map<number, TackleItem>,
): string {
  if (trip.reelId == null) return "—";
  const tackle = tackleMap.get(trip.reelId);
  if (!tackle || tackle.kind !== "reel") return "不明なリール";
  return formatReelLabel(tackle);
}

function BottomSheet({
  open,
  onClose,
  title,
  children,
  pillBtnStyle,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  pillBtnStyle: CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [sheetActive, setSheetActive] = useState(false);
  const reduce = prefersReducedMotion();

  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;

    type TouchActionStyle = CSSStyleDeclaration & { touchAction?: string };
    const style = document.body.style as TouchActionStyle;
    const prevOverflow = style.overflow;
    const prevTouch = style.touchAction;

    style.overflow = "hidden";
    style.touchAction = "none";

    return () => {
      style.overflow = prevOverflow;
      style.touchAction = prevTouch ?? "";
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      raf1Ref.current = requestAnimationFrame(() => {
        setMounted(true);
        setOverlayActive(false);
        setSheetActive(false);

        raf2Ref.current = requestAnimationFrame(() => {
          setOverlayActive(true);
          setSheetActive(true);
        });
      });

      return () => {
        if (raf1Ref.current != null) cancelAnimationFrame(raf1Ref.current);
        if (raf2Ref.current != null) cancelAnimationFrame(raf2Ref.current);
        raf1Ref.current = null;
        raf2Ref.current = null;
      };
    }

    if (!mounted) return;

    const t0 = window.setTimeout(() => setSheetActive(false), 0);
    const t1 = window.setTimeout(
      () => setOverlayActive(false),
      reduce ? 0 : 120,
    );
    const t2 = window.setTimeout(() => setMounted(false), reduce ? 0 : 280);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, mounted, reduce]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  const easing = "cubic-bezier(0.2, 0.9, 0.2, 1)";
  const overlayMs = reduce ? 0 : 220;
  const sheetMs = reduce ? 0 : 280;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    background: overlayActive ? "rgba(0,0,0,0.62)" : "rgba(0,0,0,0)",
    backdropFilter: overlayActive
      ? "blur(calc(var(--glass-blur,10px) * 0.6))"
      : "blur(0px)",
    WebkitBackdropFilter: overlayActive
      ? "blur(calc(var(--glass-blur,10px) * 0.6))"
      : "blur(0px)",
    display: "grid",
    alignItems: "end",
    transition: `background ${overlayMs}ms ease, backdrop-filter ${overlayMs}ms ease`,
    WebkitTapHighlightColor: "transparent",
  };

  const sheetStyle: CSSProperties = {
    width: "100%",
    maxHeight: "85svh",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
    boxShadow: "0 -14px 40px rgba(0,0,0,0.35)",
    overflow: "hidden",
    transform: sheetActive ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)",
    opacity: sheetActive ? 1 : 0.001,
    transition: `transform ${sheetMs}ms ${easing}, opacity ${sheetMs}ms ease`,
    willChange: "transform, opacity",
    contain: "layout paint",
  };

  const grabberStyle: CSSProperties = {
    width: 44,
    height: 5,
    borderRadius: 999,
    background: "rgba(255,255,255,0.28)",
    margin: "0 auto 10px",
  };

  const node = (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="glass glass-strong"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={grabberStyle} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 900 }}>{title ?? "📌 記録の詳細"}</div>
          <button type="button" onClick={onClose} style={pillBtnStyle}>
            ✕ 閉じる
          </button>
        </div>

        <div style={{ height: 8 }} />
        <div
          style={{
            overflowY: "auto",
            paddingRight: 2,
            maxHeight: "calc(85svh - 68px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function PhotoLightbox({
  open,
  src,
  onClose,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const reduce = prefersReducedMotion();

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => {
        setMounted(true);
        requestAnimationFrame(() => {
          setActive(true);
        });
      });
      return () => cancelAnimationFrame(raf);
    }

    if (!mounted) return;

    const t0 = window.setTimeout(() => setActive(false), 0);
    const t1 = window.setTimeout(() => setMounted(false), reduce ? 0 : 180);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [open, mounted, reduce]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted || !src || typeof document === "undefined") return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 100000,
    background: active ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0)",
    backdropFilter: active ? "blur(8px)" : "blur(0px)",
    WebkitBackdropFilter: active ? "blur(8px)" : "blur(0px)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    transition: `background ${reduce ? 0 : 180}ms ease, backdrop-filter ${
      reduce ? 0 : 180
    }ms ease`,
  };

  const frameStyle: CSSProperties = {
    position: "relative",
    width: "min(96vw, 1400px)",
    height: "min(92vh, 980px)",
    borderRadius: 18,
    overflow: "hidden",
    background: "rgba(10,10,10,0.88)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    transform: active ? "scale(1)" : "scale(0.985)",
    opacity: active ? 1 : 0.001,
    transition: `transform ${reduce ? 0 : 180}ms ease, opacity ${
      reduce ? 0 : 180
    }ms ease`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    boxSizing: "border-box",
  };

  const closeBtnStyle: CSSProperties = {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.42)",
    color: "#fff",
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 13,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div style={frameStyle} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={closeBtnStyle}>
          ✕ 閉じる
        </button>
        <img
          src={src}
          alt="preview"
          style={{
            display: "block",
            width: "auto",
            height: "auto",
            maxWidth: "calc(96vw - 80px)",
            maxHeight: "calc(92vh - 80px)",
            objectFit: "contain",
            userSelect: "none",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

export default function RecordHistory({ back }: Props) {
  const { settings } = useAppSettings();

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

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

  const pillBtnStyleDisabled: CSSProperties = {
    ...pillBtnStyle,
    opacity: 0.55,
    cursor: "not-allowed",
  };

  const segWrapStyle: CSSProperties = {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    minWidth: 0,
  };

  const segLabelStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
    userSelect: "none",
    minWidth: 0,
  };

  const segInputHidden: CSSProperties = {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
    width: 1,
    height: 1,
  };

  const segPillBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 16,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    minWidth: 0,
    maxWidth: "100%",
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.06)",
    color: "#ddd",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
    WebkitTapHighlightColor: "transparent",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
  };

  function segPill(checked: boolean): CSSProperties {
    return {
      ...segPillBase,
      border: checked ? "2px solid #ff4d6d" : segPillBase.border,
      background: checked ? "rgba(255,77,109,0.18)" : segPillBase.background,
      color: checked ? "#fff" : segPillBase.color,
      boxShadow: checked
        ? "0 6px 18px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,77,109,0.25)"
        : segPillBase.boxShadow,
    };
  }

  function segDot(checked: boolean): CSSProperties {
    return {
      width: 10,
      height: 10,
      borderRadius: 999,
      flex: "0 0 auto",
      border: checked
        ? "1px solid rgba(255,77,109,0.9)"
        : "1px solid rgba(255,255,255,0.35)",
      background: checked ? "#ff4d6d" : "transparent",
      boxShadow: checked ? "0 0 0 4px rgba(255,77,109,0.16)" : "none",
    };
  }

  const ellipsis1: CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  };

  const detailCardStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 10,
  };

  const infoRowGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    gap: 8,
    alignItems: "start",
    fontSize: 12,
  };

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const [all, setAll] = useState<TripRecord[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allLoadedOnce, setAllLoadedOnce] = useState(false);

  const [archivePageSize, setArchivePageSize] = useState<10 | 30 | 50>(30);
  const [archiveYear, setArchiveYear] = useState<string>("");
  const [archiveMonth, setArchiveMonth] = useState<string>("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailTide, setDetailTide] = useState<DetailTide | null>(null);
  const [detailPointMap, setDetailPointMap] = useState<
    Record<number, TideInfo>
  >({});
  const [detailPhotos, setDetailPhotos] = useState<TripPhoto[]>([]);
  const [detailFish, setDetailFish] = useState<TripFish[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [lightboxPhotoId, setLightboxPhotoId] = useState<number | null>(null);
  const [tackleMap, setTackleMap] = useState<Map<number, TackleItem>>(
    new Map(),
  );

  const detailCenterPaneRef = useRef<HTMLDivElement | null>(null);
  const detailRightPaneRef = useRef<HTMLDivElement | null>(null);

  const thumbUrlMapRef = useRef<Map<number, CachedUrl>>(new Map());
  const coverThumbUrlRef = useRef<Map<number, CachedUrl>>(new Map());

  function revokeCachedUrl(item: CachedUrl | undefined): void {
    if (!item) return;
    if (item.revoke) {
      URL.revokeObjectURL(item.url);
    }
  }

  function getPhotoUrlByPhotoId(photoId: number): string | null {
    const cached = thumbUrlMapRef.current.get(photoId);
    if (cached) return cached.url;

    const photo = detailPhotos.find((p) => p.id === photoId);
    if (!photo) return null;

    if (hasUsableLocalBlob(photo)) {
      try {
        const url = URL.createObjectURL(photo.photoBlob);
        thumbUrlMapRef.current.set(photoId, { url, revoke: true });
        return url;
      } catch {
        // noop
      }
    }

    if (photo.remoteKey) {
      const url = buildRemotePhotoUrl(photo.remoteKey);
      thumbUrlMapRef.current.set(photoId, { url, revoke: false });
      return url;
    }

    return null;
  }

  function setCoverThumbUrl(tripId: number, item: CachedUrl): void {
    revokeCachedUrl(coverThumbUrlRef.current.get(tripId));
    coverThumbUrlRef.current.set(tripId, item);
  }

  function clearCoverThumbUrl(tripId: number): void {
    revokeCachedUrl(coverThumbUrlRef.current.get(tripId));
    coverThumbUrlRef.current.delete(tripId);
  }

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

  useEffect(() => {
    void db.tackleItems
      .filter((item) => !item.deletedAt)
      .toArray()
      .then((items) => {
        const next = new Map<number, TackleItem>();
        for (const item of items) {
          if (item.id != null) next.set(item.id, item);
        }
        setTackleMap(next);
      })
      .catch((e) => {
        console.error(e);
        setTackleMap(new Map());
      });
  }, []);

  useEffect(() => {
    return () => {
      for (const item of thumbUrlMapRef.current.values()) {
        revokeCachedUrl(item);
      }
      thumbUrlMapRef.current.clear();

      for (const item of coverThumbUrlRef.current.values()) {
        revokeCachedUrl(item);
      }
      coverThumbUrlRef.current.clear();
    };
  }, []);

  async function loadAll(): Promise<void> {
    setAllLoading(true);
    try {
      const raw = await db.trips.orderBy("createdAt").reverse().toArray();
      const list = raw.filter((r) => !r.deletedAt);
      setAll(list);
      setAllLoadedOnce(true);

      const top = list
        .slice(0, Math.max(50, archivePageSize))
        .filter((t) => t.id != null) as Array<TripRecord & { id: number }>;
      const ids = top.map((t) => t.id);

      if (ids.length > 0) {
        const photos = (
          await db.tripPhotos.where("tripId").anyOf(ids).toArray()
        ).filter((p) => !p.deletedAt);

        const byTrip = new Map<number, TripPhoto[]>();
        for (const p of photos) {
          if (!p.tripId) continue;
          byTrip.set(p.tripId, [...(byTrip.get(p.tripId) ?? []), p]);
        }

        for (const id of ids) {
          const ps = byTrip.get(id) ?? [];
          if (ps.length === 0) {
            clearCoverThumbUrl(id);
            continue;
          }
          const cover =
            ps.find((x) => x.isCover === 1) ??
            [...ps].sort((a, b) => a.order - b.order)[0];

          if (!cover) {
            clearCoverThumbUrl(id);
            continue;
          }

          if (hasUsableLocalBlob(cover)) {
            try {
              const url = URL.createObjectURL(cover.photoBlob);
              setCoverThumbUrl(id, { url, revoke: true });
              continue;
            } catch {
              // noop
            }
          }

          if (cover.remoteKey) {
            setCoverThumbUrl(id, {
              url: buildRemotePhotoUrl(cover.remoteKey),
              revoke: false,
            });
          } else {
            clearCoverThumbUrl(id);
          }
        }
      }
    } finally {
      setAllLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const yearMonthsMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const r of all) {
      const iso = r.startedAt ?? r.createdAt;
      const d = new Date(iso);
      const t = d.getTime();
      if (!Number.isFinite(t)) continue;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (!map.has(y)) map.set(y, new Set<number>());
      map.get(y)!.add(m);
    }

    const out: Record<number, number[]> = {};
    for (const [y, set] of map.entries()) {
      out[y] = Array.from(set).sort((a, b) => a - b);
    }
    return out;
  }, [all]);

  const years = useMemo(() => {
    const ys = Object.keys(yearMonthsMap).map(Number).filter(Number.isFinite);
    return ys.sort((a, b) => b - a);
  }, [yearMonthsMap]);

  const monthsForSelectedYear = useMemo(() => {
    if (!archiveYear) return null;
    const y = Number(archiveYear);
    if (!Number.isFinite(y)) return null;
    return yearMonthsMap[y] ?? [];
  }, [archiveYear, yearMonthsMap]);

  useEffect(() => {
    if (!archiveYear) return;
    const y = Number(archiveYear);
    if (!Number.isFinite(y)) return;

    const months = yearMonthsMap[y] ?? [];
    if (!archiveMonth) return;

    const m = Number(archiveMonth);
    if (!Number.isFinite(m)) {
      setArchiveMonth("");
      return;
    }
    if (!months.includes(m)) setArchiveMonth("");
  }, [archiveYear, archiveMonth, yearMonthsMap]);

  const filteredArchive = useMemo(() => {
    let list = all;

    if (archiveYear) {
      const y = Number(archiveYear);
      if (Number.isFinite(y)) {
        list = list.filter(
          (r) => new Date(r.startedAt ?? r.createdAt).getFullYear() === y,
        );
      }
    }

    if (archiveMonth) {
      const m = Number(archiveMonth);
      if (Number.isFinite(m) && m >= 1 && m <= 12) {
        list = list.filter(
          (r) => new Date(r.startedAt ?? r.createdAt).getMonth() + 1 === m,
        );
      }
    }

    return list;
  }, [all, archiveYear, archiveMonth]);

  const archiveList = useMemo(
    () => filteredArchive.slice(0, archivePageSize),
    [filteredArchive, archivePageSize],
  );

  const selected = useMemo(() => {
    if (selectedId == null) return null;
    return filteredArchive.find((r) => r.id === selectedId) ?? null;
  }, [filteredArchive, selectedId]);

  const lightboxSrc = useMemo(() => {
    if (lightboxPhotoId == null) return null;
    return getPhotoUrlByPhotoId(lightboxPhotoId);
  }, [lightboxPhotoId, detailPhotos]);

  async function onDelete(id?: number): Promise<void> {
    if (!id) return;
    const ok = confirm("この記録を削除する？（同期用に論理削除されるよ）");
    if (!ok) return;

    const nowIso = new Date().toISOString();

    await db.transaction(
      "rw",
      db.trips,
      db.tripPhotos,
      db.tripFish,
      async () => {
        const trip = await db.trips.get(id);
        if (!trip) return;

        await db.trips.update(id, {
          deletedAt: nowIso,
          updatedAt: nowIso,
          syncStatus: "pending",
        });

        const photos = await db.tripPhotos.where("tripId").equals(id).toArray();
        for (const photo of photos) {
          if (!photo.id) continue;
          await db.tripPhotos.update(photo.id, {
            deletedAt: nowIso,
            updatedAt: nowIso,
            syncStatus: "pending",
          });
        }

        const fish = await db.tripFish.where("tripId").equals(id).toArray();
        for (const row of fish) {
          if (!row.id) continue;
          await db.tripFish.update(row.id, {
            deletedAt: nowIso,
            updatedAt: nowIso,
            syncStatus: "pending",
          });
        }
      },
    );

    clearCoverThumbUrl(id);
    await loadAll();
    if (selectedId === id) setSelectedId(null);
    if (isMobile) setSheetOpen(false);
  }

  async function openDetailForTrip(t: TripRecord): Promise<void> {
    if (!t.id) return;
    setSelectedId(t.id);

    if (isMobile) setSheetOpen(true);

    setDetailError("");
    setDetailTide(null);
    setDetailPointMap({});
    setDetailPhotos([]);
    setDetailFish([]);
    setSelectedPhotoId(null);
    setLightboxPhotoId(null);
    setDetailLoading(true);

    try {
      const tripId = t.id;

      const [photosRaw, fishRaw] = await Promise.all([
        db.tripPhotos.where("tripId").equals(tripId).sortBy("order"),
        db.tripFish.where("tripId").equals(tripId).toArray(),
      ]);

      const photos = photosRaw.filter((p) => !p.deletedAt);
      const fish = fishRaw.filter((f) => !f.deletedAt);

      setDetailPhotos(photos);
      setDetailFish(fish);

      const cover = photos.find((p) => p.isCover === 1) ?? photos[0] ?? null;
      if (cover?.id) setSelectedPhotoId(cover.id);

      const shotIso = t.startedAt ?? t.createdAt;
      const shot = new Date(shotIso);
      if (!Number.isFinite(shot.getTime())) {
        setDetailLoading(false);
        return;
      }

      const { series, source, isStale, tideName } = await getTide736DayCached(
        FIXED_PORT.pc,
        FIXED_PORT.hc,
        shot,
        { ttlDays: 30 },
      );

      const whenMs = shot.getTime();
      const info = getTideAtTime(series, whenMs);

      const map: Record<number, TideInfo> = {};
      if (info) map[tripId] = { cm: info.cm, trend: info.trend };

      setDetailTide({ series, source, isStale, tideName: tideName ?? null });
      setDetailPointMap(map);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setDetailError(msg);
    } finally {
      setDetailLoading(false);
    }

    if (!isMobile) {
      requestAnimationFrame(() => {
        detailCenterPaneRef.current?.scrollTo?.({ top: 0 });
        detailRightPaneRef.current?.scrollTo?.({ top: 0 });
      });
    }
  }

  function DetailCenterContent({ trip }: { trip: TripRecord }) {
    const baseIso = trip.startedAt ?? trip.createdAt;
    const base = new Date(baseIso);
    const created = new Date(trip.createdAt);

    const tide = trip.id != null ? detailPointMap[trip.id] : undefined;
    const phaseRaw =
      base && detailTide?.series && detailTide.series.length > 0
        ? getTidePhaseFromSeries(detailTide.series, base, base)
        : "";
    const phase = phaseRaw ? displayPhaseForHeader(phaseRaw) : "";

    const lab = detailTide
      ? sourceLabel(detailTide.source, detailTide.isStale)
      : null;

    const weatherLines = extractWeatherLines(
      trip,
      base,
      tide,
      detailTide,
      phase,
    );

    const rodLabel = getRodDisplay(trip, tackleMap);
    const reelLabel = getReelDisplay(trip, tackleMap);

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="glass glass-strong" style={detailCardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900, ...ellipsis1 }}>🧾 記録の概要</div>
            {lab && (
              <div
                style={{ fontSize: 11, color: lab.color, whiteSpace: "nowrap" }}
                title="tide736取得元"
              >
                🌊 {lab.text}
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              ...ellipsis1,
            }}
          >
            記録：{created.toLocaleString()}
          </div>

          <div
            style={{ fontSize: 12, color: "#6cf", overflowWrap: "anywhere" }}
          >
            🕒 基準：
            {Number.isFinite(base.getTime())
              ? base.toLocaleString()
              : "（不明）"}
            {Number.isFinite(base.getTime())
              ? ` / 🕒 ${getTimeBand(base)}`
              : ""}
            {detailTide?.tideName ? ` / 🌙 ${detailTide.tideName}` : ""}
            {phase ? ` / 🌊 ${phase}` : ""}
          </div>

          <div style={{ fontSize: 12, color: "#ffd166" }}>
            {formatOutcomeLine(trip, detailFish)}
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              fontSize: 12,
              color: "rgba(255,255,255,0.80)",
            }}
          >
            <div style={infoRowGridStyle}>
              <div style={{ color: "rgba(255,255,255,0.62)" }}>ロッド</div>
              <div style={{ overflowWrap: "anywhere", minWidth: 0 }}>
                {rodLabel}
              </div>
            </div>
            <div style={infoRowGridStyle}>
              <div style={{ color: "rgba(255,255,255,0.62)" }}>リール</div>
              <div style={{ overflowWrap: "anywhere", minWidth: 0 }}>
                {reelLabel}
              </div>
            </div>
          </div>

          <div style={{ color: "#eee", overflowWrap: "anywhere" }}>
            {trip.memo || "（メモなし）"}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => void onDelete(trip.id)}
              style={{
                fontSize: 12,
                color: "#ff7a7a",
                border: "1px solid rgba(255, 122, 122, 0.35)",
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.18)",
                cursor: "pointer",
                backdropFilter: "blur(var(--glass-blur,10px))",
                WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
              }}
            >
              🗑 削除
            </button>
          </div>
        </div>

        <div className="glass glass-strong" style={detailCardStyle}>
          <div style={{ fontWeight: 900 }}>🌤 天気・潮の概況</div>

          {detailLoading ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              取得中…
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {weatherLines.length > 0 ? (
                weatherLines.map((row) => (
                  <div key={row.label} style={infoRowGridStyle}>
                    <div style={{ color: "rgba(255,255,255,0.62)" }}>
                      {row.label}
                    </div>
                    <div
                      style={{
                        color: "#eaf6ff",
                        overflowWrap: "anywhere",
                        minWidth: 0,
                      }}
                    >
                      {row.value || "（なし）"}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                  概況データなし
                </div>
              )}

              {detailError && (
                <div style={{ fontSize: 12, color: "#ff7a7a" }}>
                  潮データ取得失敗 → {detailError}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>📈 タイドグラフ</div>

          {!Number.isFinite(base.getTime()) ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              基準時刻が無いから、この記録はタイドを紐づけられないよ
            </div>
          ) : (
            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 10,
                minHeight: isDesktop ? 300 : 320,
                display: "grid",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              {detailTide && detailTide.series.length > 0 ? (
                <div
                  style={{
                    opacity: detailLoading ? 0.65 : 1,
                    transform: detailLoading
                      ? "translateY(4px)"
                      : "translateY(0px)",
                    transition: "opacity 220ms ease, transform 220ms ease",
                    willChange: "opacity, transform",
                  }}
                >
                  <TideGraph
                    series={detailTide.series}
                    baseDate={base}
                    highlightAt={base}
                    yDomain={{ min: -50, max: 200 }}
                  />
                </div>
              ) : detailLoading ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                  準備中…
                </div>
              ) : detailError ? (
                <div style={{ fontSize: 12, color: "#ff7a7a" }}>
                  グラフの準備に失敗… → {detailError}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                  この日のタイドデータがまだ無いよ（取得待ち/なし）
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            paddingInline: 2,
          }}
        >
          key: {FIXED_PORT.pc}:{FIXED_PORT.hc}:
          {Number.isFinite(base.getTime()) ? dayKeyFromISO(baseIso).key : "—"}
        </div>
      </div>
    );
  }

  function DetailRightContent({ trip }: { trip: TripRecord }) {
    const fishLines = detailFish.map(formatFishLine);
    const lureLines = extractLureLines(trip, detailFish);
    const rodLabel = getRodDisplay(trip, tackleMap);
    const reelLabel = getReelDisplay(trip, tackleMap);

    return (
      <div style={{ display: "grid", gap: 12, minHeight: 0, height: "100%" }}>
        <div className="glass glass-strong" style={detailCardStyle}>
          <div style={{ fontWeight: 900 }}>🛠 使用タックル</div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={infoRowGridStyle}>
              <div style={{ color: "rgba(255,255,255,0.62)" }}>ロッド</div>
              <div style={{ overflowWrap: "anywhere", minWidth: 0 }}>
                {rodLabel}
              </div>
            </div>
            <div style={infoRowGridStyle}>
              <div style={{ color: "rgba(255,255,255,0.62)" }}>リール</div>
              <div style={{ overflowWrap: "anywhere", minWidth: 0 }}>
                {reelLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="glass glass-strong" style={detailCardStyle}>
          <div style={{ fontWeight: 900 }}>🎣 釣れた魚</div>

          {trip.outcome === "skunk" ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              今回はボウズ
            </div>
          ) : fishLines.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {fishLines.map((line, i) => (
                <div
                  key={`${line}-${i}`}
                  style={{
                    fontSize: 13,
                    color: "#ffd166",
                    overflowWrap: "anywhere",
                    padding: "8px 10px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              魚データなし
            </div>
          )}
        </div>

        <div className="glass glass-strong" style={detailCardStyle}>
          <div style={{ fontWeight: 900 }}>🪤 使用したルアー</div>

          {lureLines.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {lureLines.map((line, i) => (
                <div
                  key={`${line}-${i}`}
                  style={{
                    fontSize: 13,
                    color: "#9fe7ff",
                    overflowWrap: "anywhere",
                    padding: "8px 10px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              ルアー情報なし
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            minHeight: 0,
            gridTemplateRows: "auto auto minmax(340px, 1fr)",
            height: "100%",
          }}
        >
          <div style={{ fontWeight: 900 }}>🖼 写真</div>

          {detailPhotos.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              写真なし
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0,1fr))",
                  gap: 8,
                }}
              >
                {detailPhotos.map((p) => {
                  const url = p.id ? getPhotoUrlByPhotoId(p.id) : null;
                  const active = p.id != null && p.id === selectedPhotoId;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (!p.id) return;
                        setSelectedPhotoId(p.id);
                        setLightboxPhotoId(p.id);
                      }}
                      className="glass"
                      style={{
                        borderRadius: 12,
                        overflow: "hidden",
                        border: active
                          ? "2px solid #ff4d6d"
                          : "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.18)",
                        aspectRatio: "1 / 1",
                        padding: 0,
                        cursor: "zoom-in",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title={
                        p.capturedAt
                          ? new Date(p.capturedAt).toLocaleString()
                          : "日時なし"
                      }
                    >
                      {url ? (
                        <img
                          src={url}
                          alt="thumb"
                          style={{
                            display: "block",
                            maxWidth: "100%",
                            maxHeight: "100%",
                            width: "auto",
                            height: "auto",
                            objectFit: "contain",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.62)",
                            display: "grid",
                            placeItems: "center",
                            height: "100%",
                          }}
                        >
                          No Photo
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="glass glass-strong"
                onClick={() => {
                  if (selectedPhotoId != null)
                    setLightboxPhotoId(selectedPhotoId);
                }}
                style={{
                  borderRadius: 16,
                  padding: 10,
                  minHeight: 340,
                  height: "100%",
                  display: "grid",
                  alignItems: "stretch",
                  justifyItems: "stretch",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  cursor: selectedPhotoId != null ? "zoom-in" : "default",
                }}
                disabled={selectedPhotoId == null}
                title={selectedPhotoId != null ? "クリックで拡大表示" : ""}
              >
                {selectedPhotoId != null ? (
                  (() => {
                    const url = getPhotoUrlByPhotoId(selectedPhotoId);
                    return url ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={url}
                          alt="selected"
                          style={{
                            display: "block",
                            maxWidth: "100%",
                            maxHeight: "100%",
                            width: "auto",
                            height: "auto",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.68)",
                        }}
                      >
                        画像の表示に失敗
                      </div>
                    );
                  })()
                ) : (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    画像なし
                  </div>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function MobileDetailContent({ trip }: { trip: TripRecord }) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <DetailCenterContent trip={trip} />
        <DetailRightContent trip={trip} />
      </div>
    );
  }

  const headerSubNode = (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
      🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
      {!online && (
        <span style={{ marginLeft: 10, color: "#f6c" }}>📴 オフライン</span>
      )}
    </div>
  );

  const Controls = (
    <div
      className="glass glass-strong"
      style={{ borderRadius: 16, padding: 12, display: "grid", gap: 10 }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={allLoading}
          style={allLoading ? pillBtnStyleDisabled : pillBtnStyle}
        >
          {allLoading ? "読み込み中…" : "↻ 全履歴更新"}
        </button>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
          ※
          エクスポート/インポートは新DB形式で後で作り直す（互換不要のため一旦OFF）
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
          🔎 絞り込み
        </div>

        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
          年：
          <select
            value={archiveYear}
            onChange={(e) => setArchiveYear(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">すべて</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}年
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
          月：
          <select
            value={archiveMonth}
            onChange={(e) => setArchiveMonth(e.target.value)}
            style={{ marginLeft: 8 }}
            disabled={
              !!archiveYear && (monthsForSelectedYear?.length ?? 0) === 0
            }
            title={
              archiveYear
                ? "選択中の年に存在する月だけ出すよ"
                : "年を選ばなくても月で絞れるよ"
            }
          >
            <option value="">すべて</option>
            {archiveYear && monthsForSelectedYear
              ? monthsForSelectedYear.map((m) => (
                  <option key={m} value={String(m)}>
                    {m}月
                  </option>
                ))
              : Array.from({ length: 12 }).map((_, i) => {
                  const m = i + 1;
                  return (
                    <option key={m} value={String(m)}>
                      {m}月
                    </option>
                  );
                })}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setArchiveYear("");
            setArchiveMonth("");
          }}
          style={pillBtnStyle}
          title="絞り込みを解除"
        >
          リセット
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
          📦 表示件数
        </div>

        <div style={segWrapStyle} aria-label="表示件数">
          <label style={segLabelStyle}>
            <input
              type="radio"
              name="archivePageSize"
              checked={archivePageSize === 10}
              onChange={() => setArchivePageSize(10)}
              style={segInputHidden}
            />
            <span style={segPill(archivePageSize === 10)}>
              <span style={segDot(archivePageSize === 10)} aria-hidden="true" />
              10件
            </span>
          </label>

          <label style={segLabelStyle}>
            <input
              type="radio"
              name="archivePageSize"
              checked={archivePageSize === 30}
              onChange={() => setArchivePageSize(30)}
              style={segInputHidden}
            />
            <span style={segPill(archivePageSize === 30)}>
              <span style={segDot(archivePageSize === 30)} aria-hidden="true" />
              30件
            </span>
          </label>

          <label style={segLabelStyle}>
            <input
              type="radio"
              name="archivePageSize"
              checked={archivePageSize === 50}
              onChange={() => setArchivePageSize(50)}
              style={segInputHidden}
            />
            <span style={segPill(archivePageSize === 50)}>
              <span style={segDot(archivePageSize === 50)} aria-hidden="true" />
              50件
            </span>
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
        全 {all.length} 件 → 絞り込み {filteredArchive.length} 件（表示{" "}
        {Math.min(archivePageSize, filteredArchive.length)} 件）
      </div>
    </div>
  );

  const historyCardStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gridTemplateColumns: "72px 1fr",
    gap: 12,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,calc(var(--glass-alpha,0.22) * 0.35))",
    boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
  };

  const ListView = (
    <div style={{ display: "grid", gap: 10 }}>
      {archiveList.map((t) => {
        const created = new Date(t.createdAt);
        const base = new Date(t.startedAt ?? t.createdAt);
        const tripId = t.id ?? 0;

        const finalThumb = tripId
          ? (coverThumbUrlRef.current.get(tripId)?.url ?? null)
          : null;

        const rodLabel = getRodDisplay(t, tackleMap);
        const reelLabel = getReelDisplay(t, tackleMap);

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => void openDetailForTrip(t)}
            className="glass"
            style={historyCardStyle}
            title="この記録を開く"
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(0,0,0,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              {finalThumb ? (
                <img
                  src={finalThumb}
                  alt="thumb"
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  No Photo
                </span>
              )}
            </div>

            <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                  ...ellipsis1,
                }}
              >
                記録：{created.toLocaleString()}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#6cf",
                  overflowWrap: "anywhere",
                }}
              >
                🕒 基準：
                {Number.isFinite(base.getTime())
                  ? base.toLocaleString()
                  : "（不明）"}
                {Number.isFinite(base.getTime())
                  ? ` / 🕒 ${getTimeBand(base)}`
                  : ""}
              </div>

              <div style={{ fontSize: 12, color: "#ffd166" }}>
                {t.outcome === "skunk"
                  ? "😇 釣れなかった（ボウズ）"
                  : "🎣 釣れた"}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.78)",
                  overflowWrap: "anywhere",
                }}
              >
                ロッド：{rodLabel}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.78)",
                  overflowWrap: "anywhere",
                }}
              >
                リール：{reelLabel}
              </div>

              <div style={{ color: "#eee", overflowWrap: "anywhere" }}>
                {t.memo || "（メモなし）"}
              </div>
            </div>
          </button>
        );
      })}

      {filteredArchive.length > archivePageSize && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          ※「表示件数」を増やすと、もっと下まで見れるよ（スクロール長くなるから段階にしてる）
        </div>
      )}
    </div>
  );

  const titleNode = (
    <h1
      style={{
        margin: 0,
        fontSize: "clamp(20px, 3.2vw, 32px)",
        lineHeight: 1.15,
      }}
    >
      🗃 履歴をみる
    </h1>
  );

  const glassVars = {
    "--glass-alpha": String(settings.glassAlpha ?? 0.22),
    "--glass-blur": `${settings.glassBlur ?? 10}px`,
  } as unknown as CSSProperties;

  return (
    <PageShell
      title={titleNode}
      subtitle={headerSubNode}
      titleLayout="left"
      maxWidth={1500}
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
            ? "calc(100dvh - var(--shell-header-h) - 20px)"
            : "auto",
          paddingBottom: isDesktop ? 8 : 0,
        }}
      >
        {isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {Controls}

            {!allLoadedOnce && allLoading ? (
              <p>読み込み中…</p>
            ) : all.length === 0 ? (
              <p>まだ記録がないよ</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  絞り込み {filteredArchive.length} 件（表示{" "}
                  {Math.min(archivePageSize, filteredArchive.length)} 件）
                </div>

                {ListView}

                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  title="📌 記録の詳細"
                  pillBtnStyle={pillBtnStyle}
                >
                  {selected ? (
                    <MobileDetailContent trip={selected} />
                  ) : (
                    <div
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                    >
                      —
                    </div>
                  )}
                </BottomSheet>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(300px, 430px) minmax(380px, 0.95fr) minmax(420px, 1.05fr)",
              gap: 14,
              alignItems: "stretch",
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
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
                display: "grid",
                gridTemplateRows: "auto auto 1fr",
                gap: 10,
              }}
            >
              {Controls}

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                絞り込み {filteredArchive.length} 件（表示{" "}
                {Math.min(archivePageSize, filteredArchive.length)} 件）
              </div>

              <div
                style={{
                  minHeight: 0,
                  height: "100%",
                  overflowY: "auto",
                  paddingRight: 4,
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {ListView}
              </div>
            </div>

            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 12,
                minWidth: 0,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <div
                ref={detailCenterPaneRef}
                style={{
                  minWidth: 0,
                  minHeight: 0,
                  height: "100%",
                  overflowY: "auto",
                  paddingRight: 4,
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {!allLoadedOnce && allLoading ? (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    読み込み中…
                  </div>
                ) : all.length === 0 ? (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    まだ記録がないよ
                  </div>
                ) : selected ? (
                  <DetailCenterContent trip={selected} />
                ) : (
                  <div
                    className="glass"
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "rgba(0,0,0,0.14)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      display: "grid",
                      alignItems: "center",
                      justifyItems: "center",
                      color: "rgba(255,255,255,0.62)",
                      fontSize: 13,
                      padding: 16,
                      textAlign: "center",
                    }}
                  >
                    左の履歴から選択してね
                  </div>
                )}
              </div>
            </div>

            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 12,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <div
                ref={detailRightPaneRef}
                style={{
                  minWidth: 0,
                  minHeight: 0,
                  height: "100%",
                  overflowY: "auto",
                  paddingRight: 4,
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {!allLoadedOnce && allLoading ? (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    読み込み中…
                  </div>
                ) : all.length === 0 ? (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    まだ記録がないよ
                  </div>
                ) : selected ? (
                  <DetailRightContent trip={selected} />
                ) : (
                  <div
                    className="glass"
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "rgba(0,0,0,0.14)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      display: "grid",
                      alignItems: "center",
                      justifyItems: "center",
                      color: "rgba(255,255,255,0.62)",
                      fontSize: 13,
                      padding: 16,
                      textAlign: "center",
                    }}
                  >
                    左の履歴から選択してね
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <PhotoLightbox
        open={lightboxPhotoId != null}
        src={lightboxSrc}
        onClose={() => setLightboxPhotoId(null)}
      />
    </PageShell>
  );
}
