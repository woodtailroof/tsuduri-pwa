// src/screens/RecordHistory.tsx

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { db, type CatchRecord } from "../db";
import { exportCatches, importCatches } from "../lib/catchTransfer";
import { getTimeBand } from "../lib/timeband";
import { FIXED_PORT } from "../points";
import { getTideAtTime } from "../lib/tide736";
import { getTide736DayCached, type TideCacheSource } from "../lib/tide736Cache";
import { getTidePhaseFromSeries } from "../lib/tidePhase736";
import TideGraph from "../components/TideGraph";
import PageShell from "../components/PageShell";

type Props = {
  back: () => void;
};

type TideInfo = { cm: number; trend: string };

type DetailTide = {
  series: Array<{ unix?: number; cm: number; time?: string }>;
  tideName?: string | null;
  source: TideCacheSource;
  isStale: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKeyFromISO(iso: string) {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return { d, key };
}

function displayPhaseForHeader(phase: string) {
  const hide = new Set(["上げ", "下げ", "上げ始め", "下げ始め", "止まり"]);
  return hide.has(phase) ? "" : phase;
}

function formatResultLine(r: CatchRecord) {
  if (r.result === "caught") {
    const sp = r.species?.trim() ? r.species.trim() : "不明";
    const sz =
      typeof r.sizeCm === "number" && Number.isFinite(r.sizeCm)
        ? `${r.sizeCm}cm`
        : "サイズ不明";
    return `🎣 釣れた：${sp} / ${sz}`;
  }
  if (r.result === "skunk") return "😇 釣れなかった（ボウズ）";
  return "❔ 結果未入力";
}

function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
  if (!source) return null;
  if (source === "fetch") return { text: "取得", color: "#0a6" };
  if (source === "cache") return { text: "キャッシュ", color: "#6cf" };
  return { text: isStale ? "期限切れキャッシュ" : "キャッシュ", color: "#f6c" };
}

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

function prefersReducedMotion() {
  try {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/**
 * ✅ BottomSheet（Portal版）
 * 目的：PageShell/背景/ガラス等が作る transform / overflow / stacking context の影響を受けずに確実に表示する
 */
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
  children: React.ReactNode;
  pillBtnStyle: CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [sheetActive, setSheetActive] = useState(false);
  const reduce = prefersReducedMotion();

  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  // ✅ bodyスクロールロック（開いてる間だけ）
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;

    const bodyStyle = document.body.style as CSSStyleDeclaration & {
      touchAction?: string;
    };

    const prevOverflow = bodyStyle.overflow;
    const prevTouch = bodyStyle.touchAction;

    bodyStyle.overflow = "hidden";
    bodyStyle.touchAction = "none";

    return () => {
      bodyStyle.overflow = prevOverflow;
      bodyStyle.touchAction = prevTouch ?? "";
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setOverlayActive(false);
      setSheetActive(false);

      raf1Ref.current = requestAnimationFrame(() => {
        setOverlayActive(true);
        raf2Ref.current = requestAnimationFrame(() => {
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

    setSheetActive(false);
    const t1 = window.setTimeout(
      () => setOverlayActive(false),
      reduce ? 0 : 120,
    );

    const ms = reduce ? 0 : 280;
    const t2 = window.setTimeout(() => setMounted(false), ms);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    // ✅ 固定blur撤去：glass設定に追従
    backdropFilter: overlayActive
      ? "blur(calc(var(--glass-blur, 0px) * 0.6))"
      : "blur(0px)",
    WebkitBackdropFilter: overlayActive
      ? "blur(calc(var(--glass-blur, 0px) * 0.6))"
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

export default function Archive({ back }: Props) {
  const isMobile = useIsMobile();

  // ✅ 透過/ぼかしをCSS変数追従に統一（固定blur撤去）
  const pillBtnStyle: CSSProperties = {
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,var(--glass-alpha,0.22))",
    color: "rgba(255,255,255,0.78)",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    backdropFilter: "blur(var(--glass-blur, 0px))",
    WebkitBackdropFilter: "blur(var(--glass-blur, 0px))",
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
    background: "rgba(0,0,0,var(--glass-alpha,0.22))",
    color: "#ddd",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
    WebkitTapHighlightColor: "transparent",
    backdropFilter: "blur(var(--glass-blur, 0px))",
    WebkitBackdropFilter: "blur(var(--glass-blur, 0px))",
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

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const [all, setAll] = useState<CatchRecord[]>([]);
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

  const detailPaneRef = useRef<HTMLDivElement | null>(null);

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

  async function loadAll() {
    setAllLoading(true);
    try {
      const list = await db.catches.orderBy("createdAt").reverse().toArray();
      setAll(list);
      setAllLoadedOnce(true);
    } finally {
      setAllLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const yearMonthsMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const r of all) {
      const iso = r.capturedAt ?? r.createdAt;
      const d = new Date(iso);
      const t = d.getTime();
      if (!Number.isFinite(t)) continue;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (!map.has(y)) map.set(y, new Set<number>());
      map.get(y)!.add(m);
    }

    const out: Record<number, number[]> = {};
    for (const [y, set] of map.entries())
      out[y] = Array.from(set).sort((a, b) => a - b);
    return out;
  }, [all]);

  const years = useMemo(() => {
    const ys = Object.keys(yearMonthsMap)
      .map((x) => Number(x))
      .filter(Number.isFinite);
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
        list = list.filter((r) => {
          const iso = r.capturedAt ?? r.createdAt;
          const d = new Date(iso);
          return d.getFullYear() === y;
        });
      }
    }

    if (archiveMonth) {
      const m = Number(archiveMonth);
      if (Number.isFinite(m) && m >= 1 && m <= 12) {
        list = list.filter((r) => {
          const iso = r.capturedAt ?? r.createdAt;
          const d = new Date(iso);
          return d.getMonth() + 1 === m;
        });
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

  async function onDelete(id?: number) {
    if (!id) return;
    const ok = confirm("この記録を削除する？（戻せないよ）");
    if (!ok) return;
    await db.catches.delete(id);
    await loadAll();
    if (selectedId === id) setSelectedId(null);
    if (isMobile) setSheetOpen(false);
  }

  async function openDetailForRecord(r: CatchRecord) {
    if (!r.id) return;
    setSelectedId(r.id);

    if (isMobile) setSheetOpen(true);

    setDetailError("");
    setDetailTide(null);
    setDetailPointMap({});
    setDetailLoading(true);

    try {
      if (!r.capturedAt) {
        setDetailLoading(false);
        return;
      }

      const shot = new Date(r.capturedAt);
      const { series, source, isStale, tideName } = await getTide736DayCached(
        FIXED_PORT.pc,
        FIXED_PORT.hc,
        shot,
        { ttlDays: 30 },
      );

      const whenMs = shot.getTime();
      const info = getTideAtTime(series, whenMs);

      const map: Record<number, TideInfo> = {};
      if (info && r.id) map[r.id] = { cm: info.cm, trend: info.trend };

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
        detailPaneRef.current?.scrollTo({ top: 0 });
      });
    }
  }

  const headerSub = (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
      🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
      {!online && (
        <span style={{ marginLeft: 10, color: "#f6c" }}>📴 オフライン</span>
      )}
    </div>
  );

  function DetailView({ record }: { record: CatchRecord }) {
    const shotIso = record.capturedAt ?? record.createdAt;
    const shot = record.capturedAt ? new Date(record.capturedAt) : null;
    const created = new Date(record.createdAt);

    const tide = record.id != null ? detailPointMap[record.id] : undefined;
    const phaseRaw =
      shot && detailTide?.series && detailTide.series.length > 0
        ? getTidePhaseFromSeries(detailTide.series, shot, shot)
        : "";
    const phase = phaseRaw ? displayPhaseForHeader(phaseRaw) : "";

    const lab = detailTide
      ? sourceLabel(detailTide.source, detailTide.isStale)
      : null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div
          className="glass glass-strong"
          style={{ borderRadius: 16, padding: 12, display: "grid", gap: 8 }}
        >
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
            📸{" "}
            {record.capturedAt
              ? new Date(record.capturedAt).toLocaleString()
              : "（撮影日時なし）"}
            {shot ? ` / 🕒 ${getTimeBand(shot)}` : ""}
            {detailTide?.tideName ? ` / 🌙 ${detailTide.tideName}` : ""}
            {phase ? ` / 🌊 ${phase}` : ""}
          </div>

          <div style={{ fontSize: 12, color: "#ffd166" }}>
            {formatResultLine(record)}
          </div>

          <div
            style={{ fontSize: 12, color: "#7ef", overflowWrap: "anywhere" }}
          >
            🌊 焼津潮位：
            {detailLoading
              ? "取得中…"
              : detailError
                ? "失敗（下に理由）"
                : tide
                  ? `${tide.cm}cm / ${tide.trend}`
                  : "（なし）"}
          </div>

          <div style={{ color: "#eee", overflowWrap: "anywhere" }}>
            {record.memo || "（メモなし）"}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => onDelete(record.id)}
              style={{
                fontSize: 12,
                color: "#ff7a7a",
                border: "1px solid rgba(255, 122, 122, 0.35)",
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,var(--glass-alpha,0.22))",
                cursor: "pointer",
                backdropFilter: "blur(var(--glass-blur, 0px))",
                WebkitBackdropFilter: "blur(var(--glass-blur, 0px))",
              }}
            >
              🗑 削除
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>📈 タイドグラフ</div>

          {!record.capturedAt ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              撮影日時が無いから、この記録はタイドを紐づけられないよ
            </div>
          ) : (
            <div
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 10,
                // ✅ ほんの少し余裕を見て見切れ回避
                minHeight: 340,
                display: "grid",
                alignItems: "center",
                overflow: "visible",
              }}
            >
              {detailTide && detailTide.series.length > 0 && shot ? (
                <div
                  style={{
                    opacity: detailLoading ? 0.65 : 1,
                    transform: detailLoading
                      ? "translateY(4px)"
                      : "translateY(0px)",
                    transition: "opacity 220ms ease, transform 220ms ease",
                    willChange: "opacity, transform",
                    paddingBottom: 6,
                  }}
                >
                  <TideGraph
                    series={detailTide.series}
                    baseDate={shot}
                    highlightAt={shot}
                    yDomain={{ min: -50, max: 200 }}
                  />
                </div>
              ) : detailLoading ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div
                    style={{
                      height: 14,
                      width: "60%",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />
                  <div
                    style={{
                      height: 220,
                      width: "100%",
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                  <div
                    style={{
                      height: 12,
                      width: "40%",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}
                  >
                    準備中…
                  </div>
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

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          key: {FIXED_PORT.pc}:{FIXED_PORT.hc}:
          {shot ? dayKeyFromISO(shotIso).key : "—"}
        </div>
      </div>
    );
  }

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
          onClick={() => loadAll()}
          disabled={allLoading}
          style={allLoading ? pillBtnStyleDisabled : pillBtnStyle}
        >
          {allLoading ? "読み込み中…" : "↻ 全履歴更新"}
        </button>

        <button
          type="button"
          onClick={exportCatches}
          style={pillBtnStyle}
          title="釣果（写真含む）をZIPで保存"
        >
          📤 釣果をエクスポート
        </button>

        <label
          style={pillBtnStyle}
          title="ZIPから釣果（写真含む）を復元（端末内データは置き換え）"
        >
          📥 釣果をインポート
          <input
            type="file"
            accept=".zip"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              const ok = confirm(
                "既存の釣果はすべて削除され、ZIPの内容で置き換えられるよ。続ける？",
              );
              if (!ok) {
                e.currentTarget.value = "";
                return;
              }

              try {
                await importCatches(file);
                alert("インポート完了！");
                location.reload();
              } catch (err) {
                console.error(err);
                alert("インポート失敗…（ZIPが壊れてる or 形式違いかも）");
              } finally {
                e.currentTarget.value = "";
              }
            }}
          />
        </label>
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
          style={{ marginLeft: "auto" }}
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

  const ListView = (
    <div style={{ display: "grid", gap: 10 }}>
      {archiveList.map((r) => {
        const created = new Date(r.createdAt);
        const shotDate = r.capturedAt ? new Date(r.capturedAt) : null;
        const thumbUrl = r.photoBlob ? URL.createObjectURL(r.photoBlob) : null;

        return (
          <button
            key={r.id}
            type="button"
            onClick={() => openDetailForRecord(r)}
            className="glass glass-strong"
            style={{
              borderRadius: 16,
              padding: 12,
              display: "grid",
              gridTemplateColumns: "72px 1fr",
              gap: 12,
              alignItems: "center",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
              // ✅ 背景/ぼかし固定を撤去（glassクラスに任せる）
            }}
            title="この記録を開く"
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(0,0,0,var(--glass-alpha,0.22))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                backdropFilter: "blur(var(--glass-blur, 0px))",
                WebkitBackdropFilter: "blur(var(--glass-blur, 0px))",
              }}
            >
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt="thumb"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onLoad={() => URL.revokeObjectURL(thumbUrl)}
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
                📸 {shotDate ? shotDate.toLocaleString() : "（撮影日時なし）"}
                {shotDate ? ` / 🕒 ${getTimeBand(shotDate)}` : ""}
              </div>

              <div style={{ fontSize: 12, color: "#ffd166" }}>
                {formatResultLine(r)}
              </div>

              <div style={{ color: "#eee", overflowWrap: "anywhere" }}>
                {r.memo || "（メモなし）"}
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

  // ✅ PCは「画面内完結」レイアウトにする
  // - PageShellの全体スクロールを止める（scrollY="hidden"）
  // - Controlsは上に固定（自分はスクロールしない）
  // - リスト/詳細がそれぞれ独立スクロール
  const desktopRootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
    height: "100%",
  };

  const desktopSplitStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 520px) 1fr",
    gap: 14,
    alignItems: "stretch",
    minWidth: 0,
    minHeight: 0,
    flex: "1 1 auto",
  };

  const desktopListPane: CSSProperties = {
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 2,
  };

  const desktopDetailPane: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
  };

  return (
    <PageShell
      title={
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(20px, 6vw, 32px)",
            lineHeight: 1.15,
          }}
        >
          🗃 全履歴
        </h1>
      }
      subtitle={headerSub}
      maxWidth={1200}
      showBack
      onBack={back}
      scrollY={isMobile ? "auto" : "hidden"}
    >
      <div
        style={{
          overflowX: "clip",
          maxWidth: "100vw",
          minHeight: 0,
          height: "100%",
        }}
      >
        {!allLoadedOnce && allLoading ? (
          <p>読み込み中…</p>
        ) : all.length === 0 ? (
          <p>まだ記録がないよ</p>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {Controls}

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
                  <DetailView record={selected} />
                ) : (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    —
                  </div>
                )}
              </BottomSheet>
            </div>
          </div>
        ) : (
          <div style={desktopRootStyle}>
            {Controls}

            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              絞り込み {filteredArchive.length} 件（表示{" "}
              {Math.min(archivePageSize, filteredArchive.length)} 件）
            </div>

            <div style={desktopSplitStyle}>
              <div style={desktopListPane}>{ListView}</div>

              <div
                ref={detailPaneRef}
                className="glass glass-strong"
                style={desktopDetailPane}
              >
                {selected ? (
                  <DetailView record={selected} />
                ) : (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}
                  >
                    左の履歴から選択してね
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
