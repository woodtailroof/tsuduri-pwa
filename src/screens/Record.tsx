// src/screens/Record.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import exifr from "exifr";
import {
  db,
  type TripOutcome,
  type TripRecord,
  type TripPhoto,
  type TripFish,
} from "../db";
import PageShell from "../components/PageShell";
import { FIXED_PORT } from "../points";
import { getTideAtTime } from "../lib/tide736";
import { getTide736DayCached, type TideCacheSource } from "../lib/tide736Cache";
import { getTidePhaseFromSeries } from "../lib/tidePhase736";
import { getTimeBand } from "../lib/timeband";
import { useAppSettings } from "../lib/appSettings";

type Props = {
  back: () => void;
};

type TidePoint = { unix?: number; cm: number; time?: string };
type TideInfo = { cm: number; trend: string };

type PhotoItem = {
  id: string; // local id
  file: File;
  previewUrl: string;
  capturedAt: Date | null;
  exifNote?: string;
  isCover: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toDateTimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseDateTimeLocalValue(v: string): Date | null {
  if (!v || !v.includes("T")) return null;
  const [ds, ts] = v.split("T");
  if (!ds || !ts) return null;
  const [y, m, d] = ds.split("-").map(Number);
  const [hh, mm] = ts.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function displayPhaseForHeader(phase: string) {
  const hide = new Set(["上げ", "下げ", "上げ始め", "下げ始め", "止まり"]);
  return hide.has(phase) ? "" : phase;
}

function uuidLike() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export default function Record({ back }: Props) {
  const { settings } = useAppSettings();

  const glassVars = {
    "--glass-alpha": String(clamp(settings.glassAlpha ?? 0.22, 0, 0.6)),
    "--glass-blur": `${clamp(settings.glassBlur ?? 10, 0, 40)}px`,
  } as unknown as CSSProperties;

  const glassBoxStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 10,
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
    background: "rgba(0,0,0,calc(0.10 + var(--glass-alpha,0.22) * 0.55))",
    color: "#ddd",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitTapHighlightColor: "transparent",
  };

  function segPill(checked: boolean): CSSProperties {
    return {
      ...segPillBase,
      border: checked ? "2px solid #ff4d6d" : segPillBase.border,
      background: checked
        ? "rgba(255,77,109,calc(0.10 + var(--glass-alpha,0.22) * 0.35))"
        : segPillBase.background,
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

  const fieldStyle: CSSProperties = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,calc(0.16 + var(--glass-alpha,0.22) * 0.65))",
    color: "#fff",
    padding: "10px 12px",
    outline: "none",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
    boxSizing: "border-box",
  };

  const primaryBtn: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,calc(0.12 + var(--glass-alpha,0.22) * 0.55))",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
  };

  const dangerBtn: CSSProperties = {
    ...primaryBtn,
    background: "rgba(0,0,0,calc(0.10 + var(--glass-alpha,0.22) * 0.45))",
  };

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

  // -------------------------
  // 状態
  // -------------------------
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const [baseCapturedAt, setBaseCapturedAt] = useState<Date | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [allowUnknown, setAllowUnknown] = useState(false);

  const [outcome, setOutcome] = useState<TripOutcome>("skunk");
  const [memo, setMemo] = useState("");

  // いまは入力UI1つ（後で複数魚に拡張しやすいようにDBは別テーブル）
  const [species, setSpecies] = useState("");
  const [sizeCm, setSizeCm] = useState("");

  const [saving, setSaving] = useState(false);

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // タイドプレビュー
  const [tideLoading, setTideLoading] = useState(false);
  const [tideError, setTideError] = useState("");
  const [tideName, setTideName] = useState<string | null>(null);
  const [tideSource, setTideSource] = useState<TideCacheSource | null>(null);
  const [tideIsStale, setTideIsStale] = useState(false);
  const [tideAtShot, setTideAtShot] = useState<TideInfo | null>(null);
  const [phase, setPhase] = useState<string>("");

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

  // 画像URLの解放
  useEffect(() => {
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sizeCmNumber = useMemo(() => {
    const v = Number(sizeCm);
    if (!Number.isFinite(v)) return null;
    if (v <= 0) return null;
    return Math.round(v * 10) / 10;
  }, [sizeCm]);

  const resultOk =
    outcome === "skunk" ||
    (outcome === "caught" && (sizeCm.trim() === "" || sizeCmNumber != null));

  // 基準時刻：EXIF最古（あれば） or 手動
  const autoBaseCapturedAt = useMemo(() => {
    const ds = photos
      .map((p) => p.capturedAt)
      .filter((d): d is Date => d instanceof Date);
    if (ds.length === 0) return null;
    ds.sort((a, b) => a.getTime() - b.getTime());
    return ds[0] ?? null;
  }, [photos]);

  useEffect(() => {
    // 手動OFFのときは、自動基準に追従
    if (manualMode) return;
    setBaseCapturedAt(autoBaseCapturedAt);
    if (autoBaseCapturedAt) {
      setManualValue(toDateTimeLocalValue(autoBaseCapturedAt));
      setAllowUnknown(false);
    } else {
      setManualValue("");
    }
  }, [autoBaseCapturedAt, manualMode]);

  function resetAll() {
    for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    setPhotos([]);

    setBaseCapturedAt(null);
    setManualMode(false);
    setManualValue("");
    setAllowUnknown(false);

    setOutcome("skunk");
    setSpecies("");
    setSizeCm("");
    setMemo("");

    setTideLoading(false);
    setTideError("");
    setTideName(null);
    setTideSource(null);
    setTideIsStale(false);
    setTideAtShot(null);
    setPhase("");
  }

  // タイドプレビュー更新
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setTideError("");
      setTideName(null);
      setTideSource(null);
      setTideIsStale(false);
      setTideAtShot(null);
      setPhase("");

      if (!baseCapturedAt) return;
      if (!online) return;

      setTideLoading(true);
      try {
        const { series, source, isStale, tideName } = await getTide736DayCached(
          FIXED_PORT.pc,
          FIXED_PORT.hc,
          baseCapturedAt,
          { ttlDays: 30 },
        );
        if (cancelled) return;

        const info = getTideAtTime(
          series as TidePoint[],
          baseCapturedAt.getTime(),
        );
        const ph = getTidePhaseFromSeries(
          series as TidePoint[],
          baseCapturedAt,
          baseCapturedAt,
        );
        const shownPhase = ph ? displayPhaseForHeader(ph) || ph : "";

        setTideName(tideName ?? null);
        setTideSource(source);
        setTideIsStale(isStale);
        setTideAtShot(info ? { cm: info.cm, trend: info.trend } : null);
        setPhase(shownPhase);
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setTideError(msg);
      } finally {
        if (!cancelled) setTideLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [baseCapturedAt, online]);

  function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
    if (!source) return null;
    if (source === "fetch") return { text: "取得", color: "#0a6" };
    if (source === "cache") return { text: "キャッシュ", color: "#6cf" };
    return {
      text: isStale ? "期限切れキャッシュ" : "キャッシュ",
      color: "#f6c",
    };
  }

  const canSave =
    !saving &&
    resultOk &&
    (baseCapturedAt != null || allowUnknown || photos.length === 0);

  async function addFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0) return;

    const next: PhotoItem[] = [];
    for (const file of list) {
      const previewUrl = URL.createObjectURL(file);
      let captured: Date | null = null;
      let note = "";

      try {
        const dt = await exifr.parse(file, {
          pick: ["DateTimeOriginal", "CreateDate"],
        });
        const meta = dt as {
          DateTimeOriginal?: Date;
          CreateDate?: Date;
        } | null;
        const date = meta?.DateTimeOriginal ?? meta?.CreateDate ?? null;
        if (date instanceof Date) captured = date;
        else note = "撮影日時が見つからなかったよ";
      } catch {
        note = "EXIFの読み取りに失敗したよ";
      }

      next.push({
        id: uuidLike(),
        file,
        previewUrl,
        capturedAt: captured,
        exifNote: note || undefined,
        isCover: false,
      });
    }

    setPhotos((prev) => {
      const merged = [...prev, ...next];
      // cover が無ければ先頭に付ける
      if (!merged.some((p) => p.isCover) && merged.length > 0)
        merged[0].isCover = true;
      return merged;
    });
  }

  function setCover(id: string) {
    setPhotos((prev) => prev.map((p) => ({ ...p, isCover: p.id === id })));
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const tgt = prev.find((p) => p.id === id);
      if (tgt) URL.revokeObjectURL(tgt.previewUrl);

      const next = prev.filter((p) => p.id !== id);
      if (!next.some((p) => p.isCover) && next.length > 0)
        next[0].isCover = true;
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();

      // 基準時刻（釣行時刻）
      const startedAt =
        baseCapturedAt?.toISOString() ?? (allowUnknown ? nowIso : nowIso);

      // timeBand は基準時刻で確定
      const band = baseCapturedAt
        ? (getTimeBand(baseCapturedAt) as TripRecord["timeBand"])
        : "unknown";

      const trip: TripRecord = {
        createdAt: nowIso,
        startedAt,
        pointId: FIXED_PORT.id,
        memo,
        outcome,
        timeBand: band,

        // 潮（今はRecord画面で見えている内容をスナップショット）
        tideDayKey: baseCapturedAt
          ? `${baseCapturedAt.getFullYear()}-${pad2(baseCapturedAt.getMonth() + 1)}-${pad2(baseCapturedAt.getDate())}`
          : null,
        tideName: tideName ?? null,
        tidePhase: phase ? phase : null,
        tideTrend:
          tideAtShot?.trend === "上げ"
            ? "up"
            : tideAtShot?.trend === "下げ"
              ? "down"
              : tideAtShot?.trend
                ? "flat"
                : "unknown",
        tideCm: typeof tideAtShot?.cm === "number" ? tideAtShot.cm : null,

        // 天気/風/波は後で実装（ここに保存する）
        envFetchedAt: null,
      };

      await db.transaction(
        "rw",
        db.trips,
        db.tripPhotos,
        db.tripFish,
        async () => {
          const tripId = await db.trips.add(trip);

          // photos
          const ordered = [...photos].map((p, idx) => ({ p, idx }));
          for (const { p, idx } of ordered) {
            const row: TripPhoto = {
              tripId,
              createdAt: nowIso,
              capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
              photoName: p.file.name,
              photoType: p.file.type || "image/*",
              photoBlob: p.file,
              order: idx,
              isCover: p.isCover ? 1 : 0,
            };
            await db.tripPhotos.add(row);
          }

          // fish
          if (outcome === "caught") {
            const sp = species.trim() ? species.trim() : "不明";
            const fish: TripFish = {
              tripId,
              createdAt: nowIso,
              species: sp,
              sizeCm: sizeCmNumber ?? null,
              count: null,
            };
            await db.tripFish.add(fish);
          }
        },
      );

      resetAll();
      alert("記録したよ！");
    } catch (e) {
      console.error(e);
      alert("保存に失敗したよ…");
    } finally {
      setSaving(false);
    }
  }

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  };

  const thumbStyle: CSSProperties = {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
    position: "relative",
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
          📸 釣果を記録
        </h1>
      }
      titleLayout="left"
      maxWidth={1100}
      showBack
      onBack={back}
      scrollY="auto"
    >
      <style>{`
        .record-layout{ display:grid; gap:14px; min-width:0; }
        @media (min-width: 980px){
          .record-layout{ grid-template-columns: 420px minmax(0, 1fr); align-items:start; }
          .record-left{ position: sticky; top: 12px; align-self:start; }
        }
      `}</style>

      <div style={{ ...glassVars }}>
        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
            marginBottom: 8,
          }}
        >
          🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:
          {FIXED_PORT.hc}）
          {!online && (
            <span style={{ marginLeft: 10, color: "#f6c" }}>📴 オフライン</span>
          )}
        </div>

        <hr style={{ margin: "6px 0 12px", opacity: 0.22 }} />

        <div className="record-layout">
          {/* 左：写真 */}
          <div className="record-left" style={{ minWidth: 0 }}>
            <div
              className="glass glass-strong"
              style={{ borderRadius: 16, padding: 12 }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>
                🖼 写真（複数OK）
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                >
                  写真を選ぶ（複数）
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={async (e) => {
                        if (!e.target.files || e.target.files.length === 0)
                          return;
                        await addFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </label>

                {photos.length === 0 ? (
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}
                  >
                    写真は任意（あとからでもOK）。でも、天気/潮を正確に保存したいなら写真（EXIF）か手動時刻があると強いよ📌
                  </div>
                ) : (
                  <>
                    <div style={gridStyle}>
                      {photos.map((p) => (
                        <div key={p.id} style={thumbStyle}>
                          <img
                            src={p.previewUrl}
                            alt="thumb"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />

                          <div
                            style={{
                              position: "absolute",
                              inset: 6,
                              display: "flex",
                              gap: 6,
                              justifyContent: "flex-end",
                              alignItems: "flex-start",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setCover(p.id)}
                              style={pillBtnStyle}
                              title="サムネ（表紙）にする"
                            >
                              {p.isCover ? "★ 表紙" : "表紙"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removePhoto(p.id)}
                              style={pillBtnStyle}
                              title="削除"
                            >
                              🗑
                            </button>
                          </div>

                          <div
                            style={{
                              position: "absolute",
                              left: 8,
                              right: 8,
                              bottom: 6,
                              fontSize: 10,
                              color: "rgba(255,255,255,0.85)",
                              textShadow: "0 2px 10px rgba(0,0,0,0.55)",
                            }}
                          >
                            {p.capturedAt
                              ? p.capturedAt.toLocaleString()
                              : "EXIFなし"}
                            {p.exifNote ? ` / ${p.exifNote}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                    >
                      基準時刻（最古EXIF）：{" "}
                      {autoBaseCapturedAt
                        ? autoBaseCapturedAt.toLocaleString()
                        : "（なし）"}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 右：入力 */}
          <div
            style={{
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* 手動日時入力（写真がある or なくてもOK） */}
            <div className="glass glass-strong" style={glassBoxStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={manualMode}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setManualMode(on);
                      if (on) {
                        const d = baseCapturedAt ?? autoBaseCapturedAt;
                        if (d) setManualValue(toDateTimeLocalValue(d));
                      } else {
                        setAllowUnknown(false);
                      }
                    }}
                  />
                  <span
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                  >
                    基準時刻を手動で補正する（帰宅投稿向け）
                  </span>
                </label>

                {!manualMode && !autoBaseCapturedAt && (
                  <div style={{ fontSize: 12, color: "#f6c" }}>
                    ※EXIFが無いので、ONにして入力すると潮/天気に紐づくよ
                  </div>
                )}
              </div>

              {manualMode && (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <label
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                    >
                      基準時刻（ローカル）：
                      <input
                        type="datetime-local"
                        value={manualValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualValue(v);
                          const d = parseDateTimeLocalValue(v);
                          setBaseCapturedAt(d);
                          if (d) setAllowUnknown(false);
                        }}
                        style={{ marginLeft: 8 }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const v = toDateTimeLocalValue(now);
                        setManualValue(v);
                        setBaseCapturedAt(now);
                        setAllowUnknown(false);
                      }}
                      className="glass"
                      style={primaryBtn}
                    >
                      今にする
                    </button>
                  </div>

                  {!manualValue && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allowUnknown}
                        onChange={(e) => setAllowUnknown(e.target.checked)}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.72)",
                        }}
                      >
                        不明のまま保存する（潮/天気の保存なし）
                      </span>
                    </label>
                  )}

                  {!manualValue && !allowUnknown && (
                    <div style={{ fontSize: 12, color: "#f6c" }}>
                      ※時刻を入れるか、「不明のまま保存」をONにしてね
                    </div>
                  )}
                </>
              )}

              {!manualMode && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
                  基準時刻：{" "}
                  {baseCapturedAt
                    ? baseCapturedAt.toLocaleString()
                    : "（未確定）"}
                </div>
              )}
            </div>

            {/* 潮プレビュー */}
            <div
              className="glass glass-strong"
              style={{ borderRadius: 16, padding: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 800 }}>🌙 タイド（プレビュー）</div>
                {!online && (
                  <div style={{ fontSize: 12, color: "#f6c" }}>
                    📴 オフライン
                  </div>
                )}
                {tideSource &&
                  (() => {
                    const lab = sourceLabel(tideSource, tideIsStale);
                    if (!lab) return null;
                    return (
                      <div
                        style={{
                          fontSize: 12,
                          color: lab.color,
                          whiteSpace: "nowrap",
                        }}
                        title="tide736取得元"
                      >
                        🌊 {lab.text}
                      </div>
                    );
                  })()}
              </div>

              {!baseCapturedAt ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.68)",
                  }}
                >
                  基準時刻が無いので、タイドに紐づけできないよ
                </div>
              ) : tideLoading ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#0a6" }}>
                  取得中…
                </div>
              ) : tideError ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#ff7a7a" }}>
                  取得失敗 → {tideError}
                </div>
              ) : (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}
                  >
                    🕒 {getTimeBand(baseCapturedAt)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6cf" }}>
                    {tideName ? `🌙 ${tideName}` : "🌙 潮名：—"}
                    {phase ? ` / 🌊 ${phase}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#7ef" }}>
                    🌊 焼津潮位：
                    {tideAtShot
                      ? `${tideAtShot.cm}cm / ${tideAtShot.trend}`
                      : "—"}
                  </div>
                </div>
              )}
            </div>

            {/* 釣果 */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🎣 釣果</div>

              <div className="glass glass-strong" style={glassBoxStyle}>
                <div style={segWrapStyle} aria-label="釣果の結果">
                  <label style={segLabelStyle}>
                    <input
                      type="radio"
                      name="outcome"
                      checked={outcome === "caught"}
                      onChange={() => setOutcome("caught")}
                      style={segInputHidden}
                    />
                    <span style={segPill(outcome === "caught")}>
                      <span
                        style={segDot(outcome === "caught")}
                        aria-hidden="true"
                      />
                      釣れた
                    </span>
                  </label>

                  <label style={segLabelStyle}>
                    <input
                      type="radio"
                      name="outcome"
                      checked={outcome === "skunk"}
                      onChange={() => setOutcome("skunk")}
                      style={segInputHidden}
                    />
                    <span style={segPill(outcome === "skunk")}>
                      <span
                        style={segDot(outcome === "skunk")}
                        aria-hidden="true"
                      />
                      釣れなかった（ボウズ）
                    </span>
                  </label>
                </div>

                {outcome === "caught" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.72)",
                        }}
                      >
                        魚種：
                        <input
                          value={species}
                          onChange={(e) => setSpecies(e.target.value)}
                          placeholder="例：シーバス"
                          style={{ marginLeft: 8, width: 220 }}
                        />
                      </label>

                      <label
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.72)",
                        }}
                      >
                        大きさ（cm）：
                        <input
                          value={sizeCm}
                          onChange={(e) => setSizeCm(e.target.value)}
                          placeholder="例：52"
                          inputMode="decimal"
                          style={{ marginLeft: 8, width: 120 }}
                        />
                      </label>
                    </div>

                    {sizeCm.trim() !== "" && sizeCmNumber == null && (
                      <div style={{ fontSize: 12, color: "#f6c" }}>
                        ※サイズは数字で入れてね（例：52 / 12.5）
                      </div>
                    )}

                    <div
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}
                    >
                      ※魚種が空なら「不明」で保存するよ（分析に効く）
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* メモ */}
            <div
              className="glass glass-strong"
              style={{ borderRadius: 16, padding: 12 }}
            >
              <label style={{ display: "block" }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  📝 ひとことメモ
                </div>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  style={{
                    ...fieldStyle,
                    resize: "vertical",
                    overflowWrap: "anywhere",
                    lineHeight: 1.7,
                  }}
                  placeholder="渋かった…でも一匹！とか"
                />
              </label>
            </div>

            {/* 保存 */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={onSave}
                disabled={!canSave}
                className="glass"
                style={{
                  ...primaryBtn,
                  opacity: canSave ? 1 : 0.55,
                  cursor: canSave ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "保存中..." : "💾 記録する"}
              </button>

              <button
                type="button"
                onClick={() => {
                  const ok = confirm(
                    "入力内容をリセットして、最初からやり直す？",
                  );
                  if (!ok) return;
                  resetAll();
                }}
                className="glass"
                style={dangerBtn}
              >
                ↺ リセット
              </button>
            </div>

            {!resultOk && (
              <div style={{ fontSize: 12, color: "#f6c" }}>
                ※サイズが入力されている場合は、数字として正しく入れてね
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
