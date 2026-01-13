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
import * as AppSettings from "../lib/appSettings";
import { useCharacterStore } from "../lib/characterStore";

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

const FALLBACK_DEFAULT_SETTINGS = {
  characterEnabled: true,
  characterMode: "fixed" as "fixed" | "random",
  fixedCharacterId: "",
  characterScale: 1,
  characterOpacity: 1,
  bgDim: 0.55,
  bgBlur: 0,
  infoPanelAlpha: 0,
};

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
  const isNarrow = useIsNarrow(720);

  const useAppSettings = (AppSettings as any).useAppSettings as
    | undefined
    | (() => {
        settings: any;
        set: (patch: any) => void;
        reset: () => void;
      });

  const { state: characterState, setPortraitSrc } = useCharacterStore();

  if (!useAppSettings) {
    return (
      <PageShell
        title={
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 5.5vw, 32px)" }}>
            ⚙ 設定
          </h1>
        }
        subtitle={
          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.72)" }}>
            設定モジュールが読めてないみたい
          </div>
        }
        maxWidth={980}
        showBack
        onBack={back}
        showTestCharacter={!isNarrow}
      >
        <div
          className="glass glass-strong"
          style={{ borderRadius: 16, padding: 14, display: "grid", gap: 10 }}
        >
          <div style={{ fontWeight: 900, color: "#ff7a7a" }}>
            ⚠ ../lib/appSettings の export が見つからない
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
            useAppSettings が undefined になってるよ。
            <br />
            appSettings.ts の export 名と一致してるか確認してね。
          </div>
          <button
            type="button"
            onClick={() => {
              alert(
                "appSettings.ts の export 名を確認してね（useAppSettings / DEFAULT_SETTINGS 等）"
              );
            }}
          >
            何を見ればいい？
          </button>
        </div>
      </PageShell>
    );
  }

  let hook: {
    settings: any;
    set: (patch: any) => void;
    reset: () => void;
  } | null = null;
  let hookError: string | null = null;
  try {
    hook = useAppSettings();
  } catch (e) {
    hookError = e instanceof Error ? e.message : String(e);
  }

  if (!hook) {
    return (
      <PageShell
        title={
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 5.5vw, 32px)" }}>
            ⚙ 設定
          </h1>
        }
        subtitle={
          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.72)" }}>
            設定の読み込みで落ちたよ
          </div>
        }
        maxWidth={980}
        showBack
        onBack={back}
        showTestCharacter={!isNarrow}
      >
        <div
          className="glass glass-strong"
          style={{ borderRadius: 16, padding: 14, display: "grid", gap: 10 }}
        >
          <div style={{ fontWeight: 900, color: "#ff7a7a" }}>
            ⚠ useAppSettings が例外
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.75)",
              overflowWrap: "anywhere",
            }}
          >
            {hookError ?? "unknown error"}
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem("tsuduri_app_settings_v1");
              } catch {
                // ignore
              }
              alert("設定(localStorage)を初期化したよ。再読み込みしてね");
              location.reload();
            }}
          >
            🧯 設定を初期化して再読み込み
          </button>
        </div>
      </PageShell>
    );
  }

  const { settings, set, reset } = hook;

  const characterOptions = useMemo(() => {
    const chars = characterState.characters ?? [];
    if (!chars.length) {
      return [{ id: "", label: "（キャラ未作成）" }];
    }
    return chars.map((c) => ({ id: c.id, label: c.label || c.id }));
  }, [characterState.characters]);

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

  const characterEnabled =
    settings?.characterEnabled ?? FALLBACK_DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings?.characterMode ?? FALLBACK_DEFAULT_SETTINGS.characterMode;

  // ✅ fixedCharacterId が空/存在しない場合は先頭に寄せる（壊れないように）
  const fixedCharacterId = useMemo(() => {
    const raw =
      settings?.fixedCharacterId ?? FALLBACK_DEFAULT_SETTINGS.fixedCharacterId;
    const exists = characterOptions.some((c) => c.id === raw);
    return exists ? raw : characterOptions[0]?.id ?? "";
  }, [settings?.fixedCharacterId, characterOptions]);

  const characterScale = Number.isFinite(settings?.characterScale)
    ? settings.characterScale
    : FALLBACK_DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings?.characterOpacity)
    ? settings.characterOpacity
    : FALLBACK_DEFAULT_SETTINGS.characterOpacity;
  const bgDim = Number.isFinite(settings?.bgDim)
    ? settings.bgDim
    : FALLBACK_DEFAULT_SETTINGS.bgDim;
  const bgBlur = Number.isFinite(settings?.bgBlur)
    ? settings.bgBlur
    : FALLBACK_DEFAULT_SETTINGS.bgBlur;
  const infoPanelAlpha = Number.isFinite(settings?.infoPanelAlpha)
    ? settings.infoPanelAlpha
    : FALLBACK_DEFAULT_SETTINGS.infoPanelAlpha;

  const isCharControlsDisabled = !characterEnabled;
  const isFixedDisabled = !characterEnabled || characterMode !== "fixed";

  const fixedChar = useMemo(() => {
    if (!fixedCharacterId) return null;
    return (
      characterState.characters.find((c) => c.id === fixedCharacterId) ?? null
    );
  }, [characterState.characters, fixedCharacterId]);

  const [portraitDraft, setPortraitDraft] = useState("");

  useEffect(() => {
    setPortraitDraft(fixedChar?.portraitSrc ?? "");
  }, [fixedChar?.portraitSrc]);

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

            {/* ✅ 統合：固定キャラの立ち絵URL（最低限の指定UI） */}
            <div style={row}>
              <div style={label}>立ち絵（URL/パス）</div>
              <div style={rowStack}>
                <input
                  type="text"
                  value={portraitDraft}
                  disabled={isFixedDisabled || !fixedChar}
                  onChange={(e) => setPortraitDraft(e.target.value)}
                  placeholder="/assets/tsuduri.png みたいに入れてね"
                  style={fullWidthControl}
                />
                <div style={controlLine}>
                  <span style={help}>
                    public配下のパス（/assets/...）か URL を指定
                  </span>
                  <button
                    type="button"
                    style={
                      isFixedDisabled || !fixedChar ? pillDisabled : pillBase
                    }
                    disabled={isFixedDisabled || !fixedChar}
                    onClick={() => {
                      if (!fixedChar) return;
                      setPortraitSrc(fixedChar.id, portraitDraft.trim());
                      alert("立ち絵を保存したよ");
                    }}
                  >
                    💾 保存
                  </button>
                </div>

                {fixedChar?.portraitSrc && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={help}>プレビュー：</div>
                    <img
                      src={fixedChar.portraitSrc}
                      alt=""
                      style={{
                        height: 48,
                        width: "auto",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.06)",
                      }}
                    />
                    <div style={{ ...help, overflowWrap: "anywhere" }}>
                      {fixedChar.portraitSrc}
                    </div>
                  </div>
                )}
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
              <div style={label}>情報レイヤーの板</div>
              <div style={rowStack}>
                <div style={controlLine}>
                  <span style={help}>板だけ透過（文字は薄くしない）</span>
                  <span style={help}>{Math.round(infoPanelAlpha * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.05}
                  value={infoPanelAlpha}
                  onChange={(e) =>
                    set({ infoPanelAlpha: clamp(Number(e.target.value), 0, 1) })
                  }
                  style={fullWidthControl}
                />
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
                  key={e.key}
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
                      style={busy === e.key ? pillDisabled : pillBase}
                      disabled={busy === e.key}
                      onClick={async () => {
                        const ok = confirm(
                          `このキャッシュを削除する？\n${e.key}`
                        );
                        if (!ok) return;
                        setBusy(e.key);
                        try {
                          await deleteTideCacheByKey(e.key);
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
                        busy === `force:${e.key}` ? pillDisabled : pillBase
                      }
                      disabled={busy === `force:${e.key}`}
                      onClick={async () => {
                        const ok = confirm(
                          `この日を強制再取得する？（オンライン必須）\n${
                            (e as any).day
                          }`
                        );
                        if (!ok) return;
                        setBusy(`force:${e.key}`);
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
              const defaults =
                (AppSettings as any).DEFAULT_SETTINGS ??
                FALLBACK_DEFAULT_SETTINGS;
              set(defaults);
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
