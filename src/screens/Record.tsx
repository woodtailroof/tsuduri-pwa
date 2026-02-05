// src/screens/Record.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import exifr from "exifr";
import { db, type CatchRecord, type CatchResult } from "../db";
import PageShell from "../components/PageShell";
import { FIXED_PORT } from "../points";
import { getTideAtTime } from "../lib/tide736";
import { getTide736DayCached, type TideCacheSource } from "../lib/tide736Cache";
import { getTidePhaseFromSeries } from "../lib/tidePhase736";
import { getTimeBand } from "../lib/timeband";

type Props = {
  back: () => void;
};

type TidePoint = { unix?: number; cm: number; time?: string };
type TideInfo = { cm: number; trend: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateTimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate(),
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

export default function Record({ back }: Props) {
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  /**
   * ✅ 重要：RecordHistory と同じ “上の安全余白”
   * 戻るボタン帯がコンテンツに被らないようにする
   */
  const SHELL_TOP_SAFE_PX = 72;

  // =========================
  // ✅ 見た目（ガラスは PageShell のCSS変数に追従）
  // =========================
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

  // =========================
  // ✅ 状態
  // =========================
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [exifNote, setExifNote] = useState<string>("");

  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [allowUnknown, setAllowUnknown] = useState(false);

  const [result, setResult] = useState<CatchResult>("skunk");
  const [species, setSpecies] = useState("");
  const [sizeCm, setSizeCm] = useState("");

  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // 記録プレビュー用（潮）
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const sizeCmNumber = useMemo(() => {
    const v = Number(sizeCm);
    if (!Number.isFinite(v)) return null;
    if (v <= 0) return null;
    return Math.round(v * 10) / 10;
  }, [sizeCm]);

  function resetPhotoStates() {
    setPhoto(null);
    setPreviewUrl(null);
    setCapturedAt(null);
    setExifNote("");
    setManualMode(false);
    setManualValue("");
    setAllowUnknown(false);

    setTideLoading(false);
    setTideError("");
    setTideName(null);
    setTideSource(null);
    setTideIsStale(false);
    setTideAtShot(null);
    setPhase("");
  }

  function resetResultStates() {
    setResult("skunk");
    setSpecies("");
    setSizeCm("");
  }

  // =========================
  // ✅ 撮影日時が決まったら潮プレビュー（キャッシュ前提）
  // =========================
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setTideError("");
      setTideName(null);
      setTideSource(null);
      setTideIsStale(false);
      setTideAtShot(null);
      setPhase("");

      if (!capturedAt) return;
      if (!online && !photo) return;

      setTideLoading(true);
      try {
        const { series, source, isStale, tideName } = await getTide736DayCached(
          FIXED_PORT.pc,
          FIXED_PORT.hc,
          capturedAt,
          { ttlDays: 30 },
        );
        if (cancelled) return;

        const info = getTideAtTime(series as TidePoint[], capturedAt.getTime());
        const ph = getTidePhaseFromSeries(
          series as TidePoint[],
          capturedAt,
          capturedAt,
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
  }, [capturedAt, online, photo]);

  function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
    if (!source) return null;
    if (source === "fetch") return { text: "取得", color: "#0a6" };
    if (source === "cache") return { text: "キャッシュ", color: "#6cf" };
    return {
      text: isStale ? "期限切れキャッシュ" : "キャッシュ",
      color: "#f6c",
    };
  }

  const resultOk =
    result === "skunk" ||
    (result === "caught" && (sizeCm.trim() === "" || sizeCmNumber != null));

  const canSave =
    !saving &&
    !(photo && manualMode && !manualValue && !allowUnknown) &&
    resultOk;

  async function onSave() {
    setSaving(true);
    try {
      const record: CatchRecord = {
        createdAt: new Date().toISOString(),
        capturedAt: capturedAt ? capturedAt.toISOString() : undefined,
        pointId: FIXED_PORT.id,
        memo,

        photoName: photo?.name,
        photoType: photo?.type,
        photoBlob: photo ?? undefined,

        result,
        species: result === "caught" ? species.trim() || "不明" : undefined,
        sizeCm: result === "caught" ? (sizeCmNumber ?? undefined) : undefined,
      };

      await db.catches.add(record);

      resetPhotoStates();
      resetResultStates();
      setMemo("");

      alert("記録したよ！");
    } catch (e) {
      console.error(e);
      alert("保存に失敗したよ…");
    } finally {
      setSaving(false);
    }
  }

  // ✅ 写真プレースホルダー
  const photoFrameStyle: CSSProperties = {
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: 14,
    overflow: "hidden",
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const titleNode = (
    <h1
      style={{
        margin: 0,
        fontSize: "clamp(20px, 6vw, 32px)",
        lineHeight: 1.15,
      }}
    >
      📸 釣果を記録
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

  return (
    <PageShell
      title={titleNode}
      subtitle={subtitleNode}
      titleLayout="left"
      maxWidth={1200}
      showBack
      onBack={back}
      scrollY="auto"
    >
      <style>{`
        .record-layout{
          display:grid;
          gap:14px;
          min-width:0;
        }
        /* PC: 左に写真、右に入力 */
        @media (min-width: 980px){
          .record-layout{
            grid-template-columns: 420px minmax(0, 1fr);
            align-items:start;
          }
          .record-left{
            position: sticky;
            top: 12px;
            align-self:start;
          }
        }
      `}</style>

      {/* ✅ 戻るボタン帯に被らないための安全余白（PCのみ） */}
      <div style={{ paddingTop: isDesktop ? SHELL_TOP_SAFE_PX : 0 }}>
        <div className="record-layout">
          {/* 左：写真 */}
          <div className="record-left" style={{ minWidth: 0 }}>
            <div
              className="glass glass-strong"
              style={{ borderRadius: 16, padding: 12 }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>🖼 写真</div>

              <div style={{ display: "grid", gap: 10 }}>
                <label
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                >
                  写真を選ぶ
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (!e.target.files || !e.target.files[0]) return;
                        const file = e.target.files[0];
                        setPhoto(file);
                        setPreviewUrl(URL.createObjectURL(file));

                        setCapturedAt(null);
                        setExifNote("");
                        setManualMode(false);
                        setManualValue("");
                        setAllowUnknown(false);

                        try {
                          const dt = await exifr.parse(file, {
                            pick: ["DateTimeOriginal", "CreateDate"],
                          });

                          const meta = dt as {
                            DateTimeOriginal?: Date;
                            CreateDate?: Date;
                          } | null;
                          const date =
                            meta?.DateTimeOriginal ?? meta?.CreateDate ?? null;

                          if (date instanceof Date) {
                            setCapturedAt(date);
                            setExifNote("");
                            setManualMode(false);
                            setManualValue(toDateTimeLocalValue(date));
                          } else {
                            setCapturedAt(null);
                            setExifNote(
                              "撮影日時が見つからなかったよ（手動入力できます）",
                            );
                            setManualMode(true);
                            setManualValue("");
                          }
                        } catch {
                          setCapturedAt(null);
                          setExifNote(
                            "EXIFの読み取りに失敗したよ（手動入力できます）",
                          );
                          setManualMode(true);
                          setManualValue("");
                        }
                      }}
                    />
                  </div>
                </label>

                <div style={photoFrameStyle}>
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: 12 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.70)",
                          fontWeight: 700,
                        }}
                      >
                        プレビュー
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: "rgba(255,255,255,0.52)",
                        }}
                      >
                        ここに写真が表示されるよ
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                  {photo ? (
                    <>選択中：{photo.name}</>
                  ) : (
                    <>写真は任意（あとからでもOK）</>
                  )}
                </div>

                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                  {capturedAt ? (
                    <>📅 撮影日時：{capturedAt.toLocaleString()}</>
                  ) : (
                    <>📅 撮影日時：（不明）</>
                  )}
                  {exifNote && (
                    <div style={{ marginTop: 4, color: "#ff7a7a" }}>
                      {exifNote}
                    </div>
                  )}
                </div>
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
            {/* 手動日時入力 */}
            {photo && (
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
                          if (capturedAt)
                            setManualValue(toDateTimeLocalValue(capturedAt));
                        } else {
                          if (!capturedAt) setManualValue("");
                          setAllowUnknown(false);
                        }
                      }}
                    />
                    <span
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                    >
                      撮影日時を手動で補正する
                    </span>
                  </label>

                  {!manualMode && !capturedAt && (
                    <div style={{ fontSize: 12, color: "#f6c" }}>
                      ※EXIFが無いので、ONにして入力するとタイドに紐づくよ
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
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.72)",
                        }}
                      >
                        手動撮影日時（ローカル）：
                        <input
                          type="datetime-local"
                          value={manualValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            setManualValue(v);
                            const d = parseDateTimeLocalValue(v);
                            setCapturedAt(d);
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
                          setCapturedAt(now);
                          setAllowUnknown(false);
                        }}
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
                          不明のまま保存する（タイド紐づけ無し）
                        </span>
                      </label>
                    )}

                    {!manualValue && !allowUnknown && (
                      <div style={{ fontSize: 12, color: "#f6c" }}>
                        ※日時を入れるか、「不明のまま保存」をONにしてね
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 潮プレビュー */}
            {photo && (
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

                {!capturedAt ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "rgba(255,255,255,0.68)",
                    }}
                  >
                    撮影日時が無いので、タイドに紐づけできないよ
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
                      🕒 {getTimeBand(capturedAt)}
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
                    {!online && tideSource === "stale-cache" && (
                      <div
                        style={{ marginTop: 4, fontSize: 12, color: "#f6c" }}
                      >
                        ⚠ オフラインのため、期限切れキャッシュの可能性あり
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 釣果 */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🎣 釣果</div>

              <div className="glass glass-strong" style={glassBoxStyle}>
                <div style={segWrapStyle} aria-label="釣果の結果">
                  <label style={segLabelStyle}>
                    <input
                      type="radio"
                      name="result"
                      checked={result === "caught"}
                      onChange={() => setResult("caught")}
                      style={segInputHidden}
                    />
                    <span style={segPill(result === "caught")}>
                      <span
                        style={segDot(result === "caught")}
                        aria-hidden="true"
                      />
                      釣れた
                    </span>
                  </label>

                  <label style={segLabelStyle}>
                    <input
                      type="radio"
                      name="result"
                      checked={result === "skunk"}
                      onChange={() => setResult("skunk")}
                      style={segInputHidden}
                    />
                    <span style={segPill(result === "skunk")}>
                      <span
                        style={segDot(result === "skunk")}
                        aria-hidden="true"
                      />
                      釣れなかった（ボウズ）
                    </span>
                  </label>
                </div>

                {result === "caught" && (
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
                      ※魚種が空なら「不明」として保存するよ（後で分析に使えるからね）
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* メモ */}
            <div>
              <label>
                ひとことメモ
                <br />
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  style={{ width: "100%", overflowWrap: "anywhere" }}
                  placeholder="渋かった…でも一匹！とか"
                />
              </label>
            </div>

            {/* 保存 */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={onSave} disabled={!canSave}>
                {saving ? "保存中..." : "💾 記録する"}
              </button>

              {photo && (
                <button
                  type="button"
                  onClick={() => {
                    const ok = confirm(
                      "入力内容をリセットして、最初からやり直す？",
                    );
                    if (!ok) return;
                    resetPhotoStates();
                    resetResultStates();
                    setMemo("");
                  }}
                >
                  ↺ リセット
                </button>
              )}
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
