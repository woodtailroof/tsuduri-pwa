// src/screens/RecordHistory.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { db, type TripRecord, type TripPhoto, type TripFish } from "../db";
import { getTimeBand } from "../lib/timeband";
import { FIXED_PORT } from "../points";
import { getTideAtTime } from "../lib/tide736";
import { getTide736DayCached, type TideCacheSource } from "../lib/tide736Cache";
import { getTidePhaseFromSeries } from "../lib/tidePhase736";
import TideGraph from "../components/TideGraph";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";

type Props = { back: () => void };

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

function formatOutcomeLine(trip: TripRecord, fish: TripFish[]) {
  if (trip.outcome === "skunk") return "😇 釣れなかった（ボウズ）";
  if (trip.outcome === "caught") {
    if (fish.length === 0) return "🎣 釣れた：不明";
    const top = fish[0];
    const sp = top.species?.trim() ? top.species.trim() : "不明";
    const sz =
      typeof top.sizeCm === "number" && Number.isFinite(top.sizeCm)
        ? `${top.sizeCm}cm`
        : "サイズ不明";
    return `🎣 釣れた：${sp} / ${sz}`;
  }
  return "❔ 結果未入力";
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

  const detailPaneRef = useRef<HTMLDivElement | null>(null);

  const thumbUrlMapRef = useRef<Map<number, string>>(new Map()); // photoId -> url
  const coverThumbUrlRef = useRef<Map<number, string>>(new Map()); // tripId -> url

  function getPhotoUrlByPhotoId(photoId: number): string | null {
    const cached = thumbUrlMapRef.current.get(photoId);
    if (cached) return cached;

    const photo = detailPhotos.find((p) => p.id === photoId);
    if (!photo?.photoBlob) return null;

    try {
      const url = URL.createObjectURL(photo.photoBlob);
      thumbUrlMapRef.current.set(photoId, url);
      return url;
    } catch {
      return null;
    }
  }

  function setCoverThumbUrl(tripId: number, blob: Blob) {
    const prev = coverThumbUrlRef.current.get(tripId);
    if (prev) URL.revokeObjectURL(prev);

    const url = URL.createObjectURL(blob);
    coverThumbUrlRef.current.set(tripId, url);
  }

  function clearCoverThumbUrl(tripId: number) {
    const prev = coverThumbUrlRef.current.get(tripId);
    if (prev) URL.revokeObjectURL(prev);
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
    return () => {
      for (const url of thumbUrlMapRef.current.values())
        URL.revokeObjectURL(url);
      thumbUrlMapRef.current.clear();

      for (const url of coverThumbUrlRef.current.values())
        URL.revokeObjectURL(url);
      coverThumbUrlRef.current.clear();
    };
  }, []);

  async function loadAll() {
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
          if (cover?.photoBlob) {
            setCoverThumbUrl(id, cover.photoBlob);
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
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    for (const [y, set] of map.entries())
      out[y] = Array.from(set).sort((a, b) => a - b);
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

  async function onDelete(id?: number) {
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

  async function openDetailForTrip(t: TripRecord) {
    if (!t.id) return;
    setSelectedId(t.id);

    if (isMobile) setSheetOpen(true);

    setDetailError("");
    setDetailTide(null);
    setDetailPointMap({});
    setDetailPhotos([]);
    setDetailFish([]);
    setSelectedPhotoId(null);
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
        detailPaneRef.current?.scrollTo?.({ top: 0 });
      });
    }
  }

  function DetailView({ trip }: { trip: TripRecord }) {
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
            {trip.memo || "（メモなし）"}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => onDelete(trip.id)}
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

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>🖼 写真</div>

          {detailPhotos.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
              写真なし
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
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
                      onClick={() => p.id && setSelectedPhotoId(p.id)}
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
                        cursor: "pointer",
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
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
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

              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 16,
                  padding: 10,
                  minHeight: 260,
                  display: "grid",
                  alignItems: "center",
                  overflow: "hidden",
                }}
              >
                {selectedPhotoId != null ? (
                  (() => {
                    const url = getPhotoUrlByPhotoId(selectedPhotoId);
                    return url ? (
                      <img
                        src={url}
                        alt="selected"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
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
                    —
                  </div>
                )}
              </div>
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
                minHeight: 320,
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

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
          key: {FIXED_PORT.pc}:{FIXED_PORT.hc}:
          {Number.isFinite(base.getTime()) ? dayKeyFromISO(baseIso).key : "—"}
        </div>
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
          onClick={() => loadAll()}
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
          ? (coverThumbUrlRef.current.get(tripId) ?? null)
          : null;

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => openDetailForTrip(t)}
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
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
          height: isDesktop ? "calc(100dvh - var(--shell-header-h))" : "auto",
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
                    <DetailView trip={selected} />
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
                "minmax(260px, 420px) minmax(360px, 1fr) minmax(320px, 520px)",
              gap: 14,
              alignItems: "start",
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
                gridTemplateRows: "auto 1fr",
                gap: 10,
              }}
            >
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
              style={{
                display: "grid",
                gridTemplateRows: "auto 1fr",
                gap: 12,
                minWidth: 0,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              {Controls}

              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 16,
                  padding: 12,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "grid",
                  alignItems: "center",
                  justifyItems: "center",
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
                    justifyItems: "center",
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 13,
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  🧭
                  ここは将来「分析への入口」や「環境再取得ボタン」を置くスペースにすると気持ちいい
                </div>
              </div>
            </div>

            <div
              ref={detailPaneRef}
              className="glass glass-strong"
              style={{
                borderRadius: 16,
                padding: 12,
                minHeight: 0,
                height: "100%",
                overflowY: "auto",
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {!allLoadedOnce && allLoading ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                  読み込み中…
                </div>
              ) : all.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                  まだ記録がないよ
                </div>
              ) : selected ? (
                <DetailView trip={selected} />
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                  左の履歴から選択してね
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
