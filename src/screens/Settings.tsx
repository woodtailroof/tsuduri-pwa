// src/screens/Settings.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { FIXED_PORT } from "../points";
import {
  deleteTideCacheAll,
  deleteTideCacheByKey,
  deleteTideCacheOlderThan,
  forceRefreshTide736Day,
  getTideCacheStats,
  listTideCacheEntries,
} from "../lib/tide736Cache";
import type { TideCacheEntry } from "../db";
import PageShell from "../components/PageShell";
import {
  CHARACTER_OPTIONS,
  DEFAULT_SETTINGS,
  useAppSettings,
  normalizePublicPath,
} from "../lib/appSettings";

type Props = {
  back: () => void;
};

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type CharacterOption = { id: string; label: string };

function safeCharacterOptions(): CharacterOption[] {
  const raw = CHARACTER_OPTIONS;
  const ok = raw
    .filter((x) => x && typeof x.id === "string" && typeof x.label === "string")
    .map((x) => ({ id: x.id, label: x.label }));
  if (ok.length > 0) return ok;

  return [
    { id: "tsuduri", label: "つづり" },
    { id: "kokoro", label: "こころ" },
    { id: "matsuri", label: "まつり" },
  ];
}

function useIsNarrow(breakpointPx = 720) {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsNarrow(mql.matches);
    onChange();
    if ("addEventListener" in mql) mql.addEventListener("change", onChange);
    else (mql as any).addListener(onChange);
    return () => {
      if ("removeEventListener" in mql)
        mql.removeEventListener("change", onChange);
      else (mql as any).removeListener(onChange);
    };
  }, [breakpointPx]);

  return isNarrow;
}

export default function Settings({ back }: Props) {
  const { settings, set, reset } = useAppSettings();

  const isNarrow = useIsNarrow(720);
  const characterOptions = useMemo(() => safeCharacterOptions(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [stats, setStats] = useState<{
    count: number;
    approxKB: number;
    newestFetchedAt: string | null;
    oldestFetchedAt: string | null;
  } | null>(null);

  const [entries, setEntries] = useState<TideCacheEntry[]>([]);
  const [days, setDays] = useState<30 | 60 | 90 | 180>(30);

  const sectionTitle: CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const card: CSSProperties = {
    borderRadius: 16,
    padding: 14,
    display: "grid",
    gap: 12,
  };

  const formGrid: CSSProperties = {
    display: "grid",
    gap: 12,
  };

  const row: CSSProperties = isNarrow
    ? { display: "grid", gap: 8, alignItems: "start" }
    : {
        display: "grid",
        gridTemplateColumns: "minmax(160px, 220px) 1fr",
        gap: 12,
        alignItems: "center",
      };

  const label: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.2,
  };

  const help: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.3,
  };

  const rowStack: CSSProperties = {
    display: "grid",
    gap: 8,
    minWidth: 0,
  };

  const controlLine: CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
  };

  const radioLine: CSSProperties = {
    display: "flex",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap",
  };

  const fullWidthControl: CSSProperties = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };

  const pillBase: CSSProperties = {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.24)",
    color: "rgba(255,255,255,0.82)",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const pillDisabled: CSSProperties = {
    ...pillBase,
    opacity: 0.55,
    cursor: "not-allowed",
  };

  async function refresh() {
    setLoading(true);
    try {
      const s = await getTideCacheStats();
      setStats(s);
      const list = await listTideCacheEntries();
      setEntries(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const approxMB = useMemo(() => {
    const kb = stats?.approxKB ?? 0;
    return Math.round((kb / 1024) * 100) / 100;
  }, [stats]);

  // settings（安全なデフォルト）
  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;
  const fixedCharacterId =
    settings.fixedCharacterId ??
    characterOptions[0]?.id ??
    DEFAULT_SETTINGS.fixedCharacterId;

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;

  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const characterOverrideSrc =
    settings.characterOverrideSrc ?? DEFAULT_SETTINGS.characterOverrideSrc;

  const bgDim = Number.isFinite(settings.bgDim)
    ? settings.bgDim
    : DEFAULT_SETTINGS.bgDim;
  const bgBlur = Number.isFinite(settings.bgBlur)
    ? settings.bgBlur
    : DEFAULT_SETTINGS.bgBlur;

  const glassAlpha = Number.isFinite(settings.glassAlpha)
    ? settings.glassAlpha
    : DEFAULT_SETTINGS.glassAlpha;
  const glassBlur = Number.isFinite(settings.glassBlur)
    ? settings.glassBlur
    : DEFAULT_SETTINGS.glassBlur;

  const isCharControlsDisabled = !characterEnabled;
  const isFixedDisabled = !characterEnabled || characterMode !== "fixed";

  const previewSrc = useMemo(() => {
    const p = normalizePublicPath(characterOverrideSrc);
    return p || "";
  }, [characterOverrideSrc]);

  return (
    <PageShell
      title={
        <h1 style={{ margin: 0, fontSize: "clamp(20px, 5.5vw, 32px)" }}>
          ⚙ 設定
        </h1>
      }
      subtitle={
        <div style={{ marginTop: 8, color: "rgba(255,255,255,0.72)" }}>
          ここで「キャラ」「見た目」「キャッシュ」をまとめて調整できるよ。
        </div>
      }
      maxWidth={980}
      showBack
      onBack={back}
      showTestCharacter={!isNarrow}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {/* 👧 キャラ */}
        <div className="glass glass-strong" style={card}>
          <h2 style={sectionTitle}>👧 キャラクター</h2>

          <div style={formGrid}>
            <div style={row}>
              <div style={label}>表示</div>
              <label
                style={{
                  display: "inline-flex",
                  gap: 10,
                  alignItems: "center",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={characterEnabled}
                  onChange={(e) => set({ characterEnabled: e.target.checked })}
                />
                <span style={{ color: "rgba(255,255,255,0.85)" }}>
                  キャラを表示する
                </span>
              </label>
            </div>

            <div style={row}>
              <div style={label}>切替</div>
              <div
                style={{ ...radioLine, opacity: characterEnabled ? 1 : 0.5 }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    alignItems: "center",
                    cursor: characterEnabled ? "pointer" : "not-allowed",
                  }}
                >
                  <input
                    type="radio"
                    name="characterMode"
                    checked={characterMode === "fixed"}
                    disabled={isCharControlsDisabled}
                    onChange={() => set({ characterMode: "fixed" })}
                  />
                  <span>固定</span>
                </label>

                <label
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    alignItems: "center",
                    cursor: characterEnabled ? "pointer" : "not-allowed",
                  }}
                >
                  <input
                    type="radio"
                    name="characterMode"
                    checked={characterMode === "random"}
                    disabled={isCharControlsDisabled}
                    onChange={() => set({ characterMode: "random" })}
                  />
                  <span>ランダム（画面遷移ごと）</span>
                </label>
              </div>
            </div>

            <div style={row}>
              <div style={label}>固定キャラ</div>
              <div style={rowStack}>
                <select
                  value={fixedCharacterId}
                  disabled={isFixedDisabled}
                  onChange={(e) => set({ fixedCharacterId: e.target.value })}
                  style={fullWidthControl}
                >
                  {characterOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <div style={help}>「固定」を選んだときだけ有効だよ。</div>
              </div>
            </div>

            <div style={row}>
              <div style={label}>キャラ画像（上書き）</div>
              <div style={rowStack}>
                <input
                  value={characterOverrideSrc}
                  disabled={isCharControlsDisabled}
                  onChange={(e) =>
                    set({ characterOverrideSrc: e.target.value })
                  }
                  placeholder="例: /assets/k1.png  または assets/k1.png"
                />
                <div style={help}>
                  ここに <b>public</b>{" "}
                  配下の画像パスを入れると、固定/ランダムよりも優先して表示するよ。空にすると戻る。
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    style={pillBase}
                    disabled={isCharControlsDisabled}
                    onClick={() => set({ characterOverrideSrc: "" })}
                  >
                    ↩ デフォルトに戻す
                  </button>

                  {previewSrc && (
                    <div
                      style={{ display: "flex", gap: 10, alignItems: "center" }}
                    >
                      <span style={help}>プレビュー:</span>
                      <img
                        src={previewSrc}
                        alt=""
                        style={{
                          height: 64,
                          width: "auto",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                          background: "rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={row}>
              <div style={label}>大きさ</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>表示サイズ</span>
                  <span style={help}>{Math.round(characterScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={5.0}
                  step={0.05}
                  disabled={isCharControlsDisabled}
                  value={characterScale}
                  onChange={(e) =>
                    set({
                      characterScale: clamp(Number(e.target.value), 0.7, 5.0),
                    })
                  }
                  style={fullWidthControl}
                />
                <div style={help}>
                  ※ 上げすぎるとボタンが隠れやすいので注意だよ。
                </div>
              </div>
            </div>

            <div style={row}>
              <div style={label}>不透明度</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>透け具合</span>
                  <span style={help}>
                    {Math.round(characterOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={isCharControlsDisabled}
                  value={characterOpacity}
                  onChange={(e) =>
                    set({
                      characterOpacity: clamp(Number(e.target.value), 0, 1),
                    })
                  }
                  style={fullWidthControl}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 🪟 表示 */}
        <div className="glass glass-strong" style={card}>
          <h2 style={sectionTitle}>🪟 表示</h2>

          <div style={formGrid}>
            <div style={row}>
              <div style={label}>背景の暗幕</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>背景を暗くして文字を読みやすく</span>
                  <span style={help}>{Math.round(bgDim * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={bgDim}
                  onChange={(e) =>
                    set({ bgDim: clamp(Number(e.target.value), 0, 1) })
                  }
                  style={fullWidthControl}
                />
              </div>
            </div>

            <div style={row}>
              <div style={label}>背景ぼかし</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>雰囲気だけ残して情報を強調</span>
                  <span style={help}>{bgBlur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={bgBlur}
                  onChange={(e) =>
                    set({ bgBlur: clamp(Number(e.target.value), 0, 24) })
                  }
                  style={fullWidthControl}
                />
              </div>
            </div>

            <div style={row}>
              <div style={label}>すりガラス濃さ</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>UIの黒さ（薄いほど透明）</span>
                  <span style={help}>{Math.round(glassAlpha * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.01}
                  value={glassAlpha}
                  onChange={(e) =>
                    set({ glassAlpha: clamp(Number(e.target.value), 0, 0.6) })
                  }
                  style={fullWidthControl}
                />
              </div>
            </div>

            <div style={row}>
              <div style={label}>すりガラスぼかし</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>ガラス越しのぼかし</span>
                  <span style={help}>{glassBlur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={glassBlur}
                  onChange={(e) =>
                    set({ glassBlur: clamp(Number(e.target.value), 0, 24) })
                  }
                  style={fullWidthControl}
                />
                <div style={help}>
                  0px で完全に無し（※端末によっては微差が出るので、気になるなら
                  0〜1 で調整）
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 🌊 キャッシュ */}
        <div className="glass glass-strong" style={card}>
          <h2 style={sectionTitle}>🌊 tide736 キャッシュ</h2>

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
            基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
          </div>

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
              style={loading || !!busy ? pillDisabled : pillBase}
              disabled={loading || !!busy}
              onClick={() => refresh()}
            >
              ↻ 更新
            </button>

            <button
              type="button"
              style={busy ? pillDisabled : pillBase}
              disabled={!!busy}
              onClick={async () => {
                const ok = confirm(
                  "tide736 キャッシュをすべて削除する？（戻せない）"
                );
                if (!ok) return;
                setBusy("deleteAll");
                try {
                  await deleteTideCacheAll();
                  await refresh();
                  alert("全部消したよ");
                } finally {
                  setBusy(null);
                }
              }}
            >
              🗑 全削除
            </button>

            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                古いの削除：
              </span>
              <select
                value={days}
                onChange={(e) =>
                  setDays(Number(e.target.value) as 30 | 60 | 90 | 180)
                }
              >
                <option value={30}>30日</option>
                <option value={60}>60日</option>
                <option value={90}>90日</option>
                <option value={180}>180日</option>
              </select>

              <button
                type="button"
                style={busy ? pillDisabled : pillBase}
                disabled={!!busy}
                onClick={async () => {
                  setBusy("deleteOld");
                  try {
                    await deleteTideCacheOlderThan(days);
                    await refresh();
                    alert(`古いキャッシュ（${days}日より前）を削除したよ`);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                実行
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
              {stats
                ? `件数: ${stats.count} / 容量(概算): ${stats.approxKB}KB（約 ${approxMB}MB）`
                : loading
                ? "読み込み中…"
                : "—"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              newest: {fmtIso(stats?.newestFetchedAt ?? null)} / oldest:{" "}
              {fmtIso(stats?.oldestFetchedAt ?? null)}
            </div>
          </div>

          <hr style={{ opacity: 0.2 }} />

          {entries.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              {loading ? "読み込み中…" : "キャッシュがまだ無いよ"}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {entries.slice(0, 80).map((e) => (
                <div
                  key={(e as any).key}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    padding: 10,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.85)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {(e as any).day}（{(e as any).pc}:{(e as any).hc}）
                    </div>
                    <div
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                    >
                      fetched: {fmtIso((e as any).fetchedAt ?? null)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={busy === (e as any).key ? pillDisabled : pillBase}
                      disabled={busy === (e as any).key}
                      onClick={async () => {
                        const ok = confirm(
                          `このキャッシュを削除する？\n${(e as any).key}`
                        );
                        if (!ok) return;
                        setBusy((e as any).key);
                        try {
                          await deleteTideCacheByKey((e as any).key);
                          await refresh();
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      🗑 削除
                    </button>

                    <button
                      type="button"
                      style={
                        busy === `force:${(e as any).key}`
                          ? pillDisabled
                          : pillBase
                      }
                      disabled={busy === `force:${(e as any).key}`}
                      onClick={async () => {
                        const ok = confirm(
                          `この日を強制再取得する？（オンライン必須）\n${
                            (e as any).day
                          }`
                        );
                        if (!ok) return;
                        setBusy(`force:${(e as any).key}`);
                        try {
                          await forceRefreshTide736Day(
                            (e as any).pc,
                            (e as any).hc,
                            new Date((e as any).day)
                          );
                          await refresh();
                          alert("再取得したよ");
                        } catch (err) {
                          console.error(err);
                          alert("再取得に失敗…（オフライン or 制限の可能性）");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      ↻ 強制再取得
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
            style={pillBase}
            onClick={() => {
              const ok = confirm(
                "表示/キャラ設定を初期値に戻す？（キャッシュは触らない）"
              );
              if (!ok) return;
              reset();
              alert("初期値に戻したよ");
            }}
          >
            🔁 表示/キャラを初期化
          </button>

          <button
            type="button"
            style={pillBase}
            onClick={() => {
              // 保存し直し（正規化が走る）
              set({ ...DEFAULT_SETTINGS, ...settings });
              alert("設定を保存し直したよ");
            }}
          >
            ✅ 設定を保存し直す
          </button>
        </div>
      </div>
    </PageShell>
  );
}
