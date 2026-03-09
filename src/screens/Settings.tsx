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
  AUTO_BG_SETS,
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  type BgMode,
  type BgTimeBand,
  useAppSettings,
} from "../lib/appSettings";
import { CHARACTERS_STORAGE_KEY } from "./CharacterSettings";
import { setSessionUnlocked } from "../lib/appLock";

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

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
};

function loadCreatedCharacters(): CharacterOption[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  const normalized = list
    .map((c) => {
      const id = typeof c?.id === "string" ? c.id : "";
      const label =
        typeof c?.name === "string"
          ? c.name
          : typeof c?.label === "string"
            ? c.label
            : "";
      return { id, label };
    })
    .filter((x) => !!x.id && !!x.label);

  const seen = new Set<string>();
  const uniq: CharacterOption[] = [];
  for (const c of normalized) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    uniq.push(c);
  }
  return uniq;
}

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

function loadCharacterImageMap(): CharacterImageMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
  const map = safeJsonParse<CharacterImageMap>(raw, {});
  if (!map || typeof map !== "object") return {};
  return map;
}

function saveCharacterImageMap(map: CharacterImageMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHARACTER_IMAGE_MAP_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("tsuduri-settings"));
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

    if ("addEventListener" in mql) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    const legacy = mql as unknown as {
      addListener: (fn: () => void) => void;
      removeListener: (fn: () => void) => void;
    };
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }, [breakpointPx]);

  return isNarrow;
}

function useMinuteTick() {
  const [tick, setTick] = useState(1);

  useEffect(() => {
    let timer: number | null = null;

    const arm = () => {
      const now = Date.now();
      const msToNextMinute = 60_000 - (now % 60_000) + 5;
      timer = window.setTimeout(() => {
        setTick((v) => v + 1);
        arm();
      }, msToNextMinute);
    };

    arm();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  return tick;
}

function looksLikeImageFilePath(raw: string) {
  return /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(raw.trim());
}

function ensureTrailingSlash(p: string) {
  return p.endsWith("/") ? p : `${p}/`;
}

function resolveCharacterPreviewSrc(raw: string, key: string) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const normalized = normalizePublicPath(trimmed);
  if (!normalized) return "";
  if (looksLikeImageFilePath(normalized)) return normalized;

  const dir = ensureTrailingSlash(normalized);
  return normalizePublicPath(`${dir}${key}.png`) || "";
}

function appendAssetVersion(url: string, assetVersion: string) {
  const u = (url ?? "").trim();
  const av = (assetVersion ?? "").trim();
  if (!u || !av) return u;
  const encoded = encodeURIComponent(av);
  return u.includes("?") ? `${u}&av=${encoded}` : `${u}?av=${encoded}`;
}

const EXPRESSION_KEYS = [
  { key: "neutral", label: "neutral" },
  { key: "happy", label: "happy" },
  { key: "sad", label: "sad" },
  { key: "think", label: "think" },
  { key: "surprise", label: "surprise" },
  { key: "love", label: "love" },
] as const;

export default function Settings({ back }: Props) {
  const { settings, set, reset } = useAppSettings();

  const isNarrow = useIsNarrow(720);
  const minuteTick = useMinuteTick();

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

  const [createdCharacters, setCreatedCharacters] = useState<CharacterOption[]>(
    [],
  );
  const [charImageMap, setCharImageMapState] = useState<CharacterImageMap>({});
  const [lockMsg, setLockMsg] = useState("");

  const glassBlurCss = "blur(calc(var(--glass-blur, 0) * 1px))";

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
    background: "rgba(17, 17, 17, var(--glass-alpha-strong, 0.35))",
    color: "rgba(255,255,255,0.82)",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    backdropFilter: glassBlurCss,
    WebkitBackdropFilter: glassBlurCss,
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

  function refreshCreatedCharactersAndMap() {
    const chars = loadCreatedCharacters();
    setCreatedCharacters(chars);

    const map = loadCharacterImageMap();
    setCharImageMapState(map);

    if (chars.length > 0) {
      const ids = new Set(chars.map((c) => c.id));
      const current = settings.fixedCharacterId ?? "";
      if (!ids.has(current)) {
        set({ fixedCharacterId: chars[0].id });
      }
    }
  }

  function setCharImageMap(next: CharacterImageMap) {
    setCharImageMapState(next);
    saveCharacterImageMap(next);
  }

  useEffect(() => {
    refresh();
    refreshCreatedCharactersAndMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approxMB = useMemo(() => {
    const kb = stats?.approxKB ?? 0;
    return Math.round((kb / 1024) * 100) / 100;
  }, [stats]);

  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const createdIds = useMemo(
    () => new Set(createdCharacters.map((c) => c.id)),
    [createdCharacters],
  );

  const fixedCharacterId = useMemo(() => {
    const candidate = settings.fixedCharacterId ?? "";
    if (candidate && createdIds.has(candidate)) return candidate;
    return createdCharacters[0]?.id ?? "";
  }, [settings.fixedCharacterId, createdIds, createdCharacters]);

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;

  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const bgBlur = Number.isFinite(settings.bgBlur)
    ? settings.bgBlur
    : DEFAULT_SETTINGS.bgBlur;

  const glassAlpha = Number.isFinite(settings.glassAlpha)
    ? settings.glassAlpha
    : DEFAULT_SETTINGS.glassAlpha;
  const glassBlur = Number.isFinite(settings.glassBlur)
    ? settings.glassBlur
    : DEFAULT_SETTINGS.glassBlur;

  const assetVersion = (settings.assetVersion ?? "").trim();

  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;
  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw) || "/assets/bg/ui-check.png";

  const nowBand: BgTimeBand = useMemo(() => {
    return getTimeBand(new Date());
  }, [minuteTick]);

  const autoPreviewSrc = useMemo(
    () => resolveAutoBackgroundSrc(autoBgSet, nowBand),
    [autoBgSet, nowBand],
  );

  const effectivePreviewSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return autoPreviewSrc;
  }, [bgMode, fixedBgSrc, autoPreviewSrc]);

  const effectivePreviewSrcWithAv = useMemo(() => {
    return appendAssetVersion(effectivePreviewSrc, assetVersion);
  }, [effectivePreviewSrc, assetVersion]);

  const autoPreviewSrcWithAv = useMemo(() => {
    return appendAssetVersion(autoPreviewSrc, assetVersion);
  }, [autoPreviewSrc, assetVersion]);

  const isCharControlsDisabled = !characterEnabled;
  const isFixedDisabled =
    !characterEnabled ||
    characterMode !== "fixed" ||
    createdCharacters.length === 0;

  const cardClass = "glass-panel strong";

  function handleResetSessionOnly() {
    const ok = confirm(
      "今の解除状態だけ消して、次回表示時にもう一度ロックを出す？",
    );
    if (!ok) return;

    setSessionUnlocked(false);
    setLockMsg("このタブの解除状態を消したよ。次回読み込みでロックが出るよ");
  }

  return (
    <PageShell
      title={
        <h1 style={{ margin: 0, fontSize: "clamp(20px, 5.5vw, 32px)" }}>
          ⚙ 設定
        </h1>
      }
      subtitle={
        <div style={{ marginTop: 8, color: "rgba(255,255,255,0.72)" }}>
          ここで「キャラ」「背景」「見た目」「キャッシュ」をまとめて調整できるよ。
        </div>
      }
      maxWidth={1100}
      showBack
      onBack={back}
      scrollY="auto"
      showTestCharacter={!isNarrow}
    >
      <div
        style={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "grid", gap: 16, paddingRight: 2 }}>
            <div className={cardClass} style={card}>
              <h2 style={sectionTitle}>🔐 入口ロック</h2>

              <div style={formGrid}>
                <div style={row}>
                  <div style={label}>方式</div>
                  <div style={rowStack}>
                    <div style={help}>
                      入口パスワードは端末ごとに設定する方式ではなく、
                      アプリ共通の固定パスワード方式になっているよ。
                    </div>
                    <div style={help}>
                      設定画面からは変更しないで、コード側で管理する想定。
                    </div>
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>解除状態</div>
                  <div style={rowStack}>
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
                        onClick={handleResetSessionOnly}
                      >
                        🔒 今の解除状態を消す
                      </button>
                    </div>

                    <div style={help}>
                      パスワード自体は変えず、このタブの通行証だけ消すよ。
                    </div>

                    {lockMsg ? (
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.4,
                          color: "rgba(210,255,230,0.92)",
                          background: "rgba(80,180,120,0.12)",
                          border: "1px solid rgba(110,220,150,0.18)",
                          borderRadius: 12,
                          padding: "10px 12px",
                        }}
                      >
                        {lockMsg}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className={cardClass} style={card}>
              <h2 style={sectionTitle}>👧 キャラクター</h2>

              <div style={formGrid}>
                <div style={row}>
                  <div style={label}>assetVersion</div>
                  <div style={rowStack}>
                    <div style={help}>
                      Cloudflare の <code>immutable</code> キャッシュ対策。
                      ここを変えると画像URLに <code>?av=...</code>{" "}
                      が付いて強制更新されるよ。
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        value={assetVersion}
                        onChange={(e) => set({ assetVersion: e.target.value })}
                        placeholder='例: "2" / "20260219a"'
                        style={{ ...fullWidthControl, maxWidth: 420 }}
                      />

                      <button
                        type="button"
                        style={pillBase}
                        onClick={() => {
                          const next = String(Date.now());
                          set({ assetVersion: next });
                          alert(`assetVersion を更新したよ\n${next}`);
                        }}
                      >
                        ⏱ 今の時刻に更新
                      </button>

                      <button
                        type="button"
                        style={pillBase}
                        onClick={() => {
                          set({ assetVersion: "" });
                          alert("assetVersion を空にしたよ（無効）");
                        }}
                      >
                        🚫 無効化
                      </button>
                    </div>

                    <div style={help}>
                      画像を差し替えたら{" "}
                      <b style={{ color: "rgba(255,255,255,0.88)" }}>
                        ⏱ 今の時刻に更新
                      </b>{" "}
                      を押すのが一番ラク。
                    </div>
                  </div>
                </div>

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
                      onChange={(e) =>
                        set({ characterEnabled: e.target.checked })
                      }
                    />
                    <span style={{ color: "rgba(255,255,255,0.85)" }}>
                      キャラを表示する
                    </span>
                  </label>
                </div>

                <div style={row}>
                  <div style={label}>切替</div>
                  <div
                    style={{
                      ...radioLine,
                      opacity: characterEnabled ? 1 : 0.5,
                    }}
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
                        onClick={() => refreshCreatedCharactersAndMap()}
                      >
                        ↻ キャラ管理と同期
                      </button>
                      <span style={help}>
                        キャラ管理で作成したキャラがここに出るよ（固定は作成キャラのみ）。
                      </span>
                    </div>

                    <select
                      value={fixedCharacterId}
                      disabled={isFixedDisabled}
                      onChange={(e) =>
                        set({ fixedCharacterId: e.target.value })
                      }
                      style={fullWidthControl}
                    >
                      {createdCharacters.length === 0 ? (
                        <option value="">（作成キャラがありません）</option>
                      ) : (
                        createdCharacters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))
                      )}
                    </select>

                    <div style={help}>
                      「固定」を選んだときだけ有効。作成キャラが無い場合はキャラ管理で追加してね。
                    </div>
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>作成キャラ画像</div>
                  <div style={rowStack}>
                    {createdCharacters.length === 0 ? (
                      <div style={help}>
                        まだ作成キャラが見つからないよ（キャラ管理で追加してから同期してね）。
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {createdCharacters.map((c) => {
                          const raw = charImageMap[c.id] ?? "";
                          const normalized = normalizePublicPath(raw) || "";
                          const isFile = normalized
                            ? looksLikeImageFilePath(normalized)
                            : false;

                          const previewSingle = isFile
                            ? appendAssetVersion(
                                normalizePublicPath(raw),
                                assetVersion,
                              )
                            : "";
                          const previewList = !isFile
                            ? EXPRESSION_KEYS.map((x) => {
                                const base = resolveCharacterPreviewSrc(
                                  raw,
                                  x.key,
                                );
                                return {
                                  key: x.key,
                                  label: x.label,
                                  src: appendAssetVersion(base, assetVersion),
                                };
                              })
                            : [];

                          return (
                            <div
                              key={c.id}
                              style={{
                                borderRadius: 14,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background:
                                  "rgba(17, 17, 17, var(--glass-alpha, 0.22))",
                                padding: 10,
                                display: "grid",
                                gap: 8,
                                backdropFilter: glassBlurCss,
                                WebkitBackdropFilter: glassBlurCss,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "rgba(255,255,255,0.85)",
                                    overflowWrap: "anywhere",
                                  }}
                                >
                                  {c.label}{" "}
                                  <span
                                    style={{
                                      color: "rgba(255,255,255,0.55)",
                                    }}
                                  >
                                    （id: {c.id}）
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  style={pillBase}
                                  onClick={() => {
                                    const next = { ...charImageMap };
                                    delete next[c.id];
                                    setCharImageMap(next);
                                  }}
                                >
                                  ↩ 未設定に戻す
                                </button>
                              </div>

                              <input
                                value={raw}
                                onChange={(e) => {
                                  const next = {
                                    ...charImageMap,
                                    [c.id]: e.target.value,
                                  };
                                  setCharImageMap(next);
                                }}
                                placeholder="例: /assets/characters/tsuduri/  または /assets/characters/tsuduri/neutral.png"
                                style={fullWidthControl}
                              />

                              <div style={help}>
                                public 配下のパスを指定。
                                <br />✅ <b>おすすめ:</b>{" "}
                                <code>/assets/characters/tsuduri/</code>{" "}
                                のようにフォルダ指定（中に{" "}
                                <code>neutral.png</code>, <code>happy.png</code>
                                … を置く）。
                                <br />
                                🛟 旧互換: 単一画像（例{" "}
                                <code>/assets/characters/tsuduri.png</code>
                                ）もOK。
                              </div>

                              {!raw.trim() ? (
                                <div style={help}>（未設定）</div>
                              ) : isFile ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span style={help}>プレビュー（単一）:</span>
                                  {previewSingle ? (
                                    <img
                                      src={previewSingle}
                                      alt=""
                                      style={{
                                        height: 72,
                                        width: "auto",
                                        borderRadius: 12,
                                        border:
                                          "1px solid rgba(255,255,255,0.18)",
                                        background: "rgba(0,0,0,0.2)",
                                      }}
                                    />
                                  ) : (
                                    <span style={help}>（読めないパス）</span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  <div style={help}>プレビュー（表情）:</div>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "repeat(auto-fit, minmax(120px, 1fr))",
                                      gap: 10,
                                      alignItems: "start",
                                    }}
                                  >
                                    {previewList.map((p) => (
                                      <div
                                        key={p.key}
                                        style={{
                                          display: "grid",
                                          gap: 6,
                                          padding: 8,
                                          borderRadius: 12,
                                          border:
                                            "1px solid rgba(255,255,255,0.12)",
                                          background: "rgba(0,0,0,0.14)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: "rgba(255,255,255,0.65)",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                          title={p.label}
                                        >
                                          {p.label}
                                        </div>
                                        {p.src ? (
                                          <img
                                            src={p.src}
                                            alt=""
                                            style={{
                                              width: "100%",
                                              height: "auto",
                                              borderRadius: 10,
                                              border:
                                                "1px solid rgba(255,255,255,0.18)",
                                              background: "rgba(0,0,0,0.18)",
                                              objectFit: "contain",
                                            }}
                                          />
                                        ) : (
                                          <div style={help}>（パス不明）</div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <div style={help}>
                                    ※ 画像が無い表情はブラウザで 404
                                    になるけど、 PageShell
                                    側は自動で次候補へフォールバックするよ。
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>大きさ</div>
                  <div style={rowStack}>
                    <div style={controlLine}>
                      <span style={help}>表示サイズ（50〜200%）</span>
                      <span style={help}>
                        {Math.round(characterScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      disabled={isCharControlsDisabled}
                      value={characterScale}
                      onChange={(e) =>
                        set({
                          characterScale: clamp(
                            Number(e.target.value),
                            0.5,
                            2.0,
                          ),
                        })
                      }
                      style={fullWidthControl}
                    />
                    <div style={help}>
                      ※
                      大きすぎるとUIが隠れやすいから、ここで上限を抑えてあるよ。
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

            <div className={cardClass} style={card}>
              <h2 style={sectionTitle}>🖼 背景</h2>

              <div style={formGrid}>
                <div style={row}>
                  <div style={label}>モード</div>
                  <div style={radioLine}>
                    <label
                      style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="bgMode"
                        checked={bgMode === "auto"}
                        onChange={() => set({ bgMode: "auto" })}
                      />
                      <span>自動（時刻連動）</span>
                    </label>

                    <label
                      style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="bgMode"
                        checked={bgMode === "fixed"}
                        onChange={() => set({ bgMode: "fixed" })}
                      />
                      <span>固定</span>
                    </label>

                    <label
                      style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="bgMode"
                        checked={bgMode === "off"}
                        onChange={() => set({ bgMode: "off" })}
                      />
                      <span>背景画像なし</span>
                    </label>
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>自動セット</div>
                  <div style={rowStack}>
                    <select
                      value={autoBgSet}
                      disabled={bgMode !== "auto"}
                      onChange={(e) => set({ autoBgSet: e.target.value })}
                      style={fullWidthControl}
                    >
                      {AUTO_BG_SETS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>

                    <div style={help}>
                      いまの時間帯:{" "}
                      <b style={{ color: "rgba(255,255,255,0.88)" }}>
                        {nowBand === "morning"
                          ? "朝"
                          : nowBand === "day"
                            ? "昼"
                            : nowBand === "evening"
                              ? "夕"
                              : "夜"}
                      </b>{" "}
                      / 自動の参照: <code>{autoPreviewSrcWithAv}</code>
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
                        onClick={() => set({ bgMode: "auto" })}
                      >
                        🌈 自動にする
                      </button>

                      <button
                        type="button"
                        style={pillBase}
                        onClick={() => {
                          const snap = resolveAutoBackgroundSrc(
                            autoBgSet,
                            nowBand,
                          );
                          set({ bgMode: "fixed", fixedBgSrc: snap });
                          alert(`いまの背景を固定にしたよ\n${snap}`);
                        }}
                      >
                        📌 いまの背景を固定に
                      </button>
                    </div>
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>固定画像</div>
                  <div style={rowStack}>
                    <input
                      value={fixedBgSrcRaw}
                      disabled={bgMode !== "fixed"}
                      onChange={(e) => set({ fixedBgSrc: e.target.value })}
                      placeholder="例: /assets/bg/surf_evening.png"
                      style={fullWidthControl}
                    />
                    <div style={help}>
                      public 配下パス（例:{" "}
                      <code>/assets/bg/surf_evening.png</code>）
                    </div>
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>プレビュー</div>
                  <div style={rowStack}>
                    {bgMode === "off" ? (
                      <div style={help}>（背景画像なし）</div>
                    ) : (
                      <>
                        <div style={help}>
                          表示予定: <code>{effectivePreviewSrcWithAv}</code>
                        </div>
                        {!!effectivePreviewSrcWithAv && (
                          <img
                            src={effectivePreviewSrcWithAv}
                            alt=""
                            style={{
                              width: "100%",
                              maxWidth: 520,
                              height: "auto",
                              borderRadius: 14,
                              border: "1px solid rgba(255,255,255,0.18)",
                              background: "rgba(0,0,0,0.18)",
                            }}
                          />
                        )}
                      </>
                    )}

                    <div style={help}>
                      ルール：
                      <code>{`/assets/bg/${autoBgSet}_morning.png`}</code>{" "}
                      みたいに、
                      <code>_morning / _day / _evening / _night</code>{" "}
                      の4枚を用意すると自動で切り替わるよ。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={cardClass} style={card}>
              <h2 style={sectionTitle}>🪟 表示</h2>

              <div style={formGrid}>
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
                        set({
                          glassAlpha: clamp(Number(e.target.value), 0, 0.6),
                        })
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
                      0pxで完全に無し（※端末によっては微差が出るので、気になるなら
                      0〜1 で調整）
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={cardClass} style={card}>
              <h2 style={sectionTitle}>🌊 tide736 キャッシュ</h2>

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}
                ）
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
                      "tide736 キャッシュをすべて削除する？（戻せない）",
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
                  <span
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
                  >
                    古いの削除：
                  </span>
                  <select
                    value={String(days)}
                    onChange={(e) =>
                      setDays(Number(e.target.value) as 30 | 60 | 90 | 180)
                    }
                  >
                    <option value="30">30日</option>
                    <option value="60">60日</option>
                    <option value="90">90日</option>
                    <option value="180">180日</option>
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
                  {entries.slice(0, 80).map((e) => {
                    const v = e as unknown as {
                      key: string;
                      day: string;
                      pc: string;
                      hc: string;
                      fetchedAt?: string | null;
                    };

                    return (
                      <div
                        key={v.key}
                        style={{
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background:
                            "rgba(17, 17, 17, var(--glass-alpha, 0.22))",
                          padding: 10,
                          display: "grid",
                          gap: 8,
                          backdropFilter: glassBlurCss,
                          WebkitBackdropFilter: glassBlurCss,
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
                            {v.day}（{v.pc}:{v.hc}）
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.6)",
                            }}
                          >
                            fetched: {fmtIso(v.fetchedAt ?? null)}
                          </div>
                        </div>

                        <div
                          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            style={busy === v.key ? pillDisabled : pillBase}
                            disabled={busy === v.key}
                            onClick={async () => {
                              const ok = confirm(
                                `このキャッシュを削除する？\n${v.key}`,
                              );
                              if (!ok) return;
                              setBusy(v.key);
                              try {
                                await deleteTideCacheByKey(v.key);
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
                              busy === `force:${v.key}`
                                ? pillDisabled
                                : pillBase
                            }
                            disabled={busy === `force:${v.key}`}
                            onClick={async () => {
                              const ok = confirm(
                                `この日を強制再取得する？（オンライン必須）\n${v.day}`,
                              );
                              if (!ok) return;
                              setBusy(`force:${v.key}`);
                              try {
                                await forceRefreshTide736Day(
                                  v.pc,
                                  v.hc,
                                  new Date(v.day),
                                );
                                await refresh();
                                alert("再取得したよ");
                              } catch (err) {
                                console.error(err);
                                alert(
                                  "再取得に失敗…（オフライン or 制限の可能性）",
                                );
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            ↻ 強制再取得
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
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
                "表示/キャラ設定を初期値に戻す？（キャッシュは触らない）",
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
              set({ ...settings });
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
