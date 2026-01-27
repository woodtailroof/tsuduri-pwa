// src/components/PageShell.tsx
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveCharacterSrc,
  useAppSettings,
  normalizePublicPath,
  getTimeBand,
  resolveAutoBackgroundSrc,
  DEFAULT_SETTINGS,
  type BgMode,
} from "../lib/appSettings";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  maxWidth?: number;

  showBack?: boolean;
  onBack?: () => void;
  backLabel?: ReactNode;
  fallbackHref?: string;
  disableStackPush?: boolean;

  /** ✅ 画面個別で背景を上書きしたい時（通常は未指定でOK） */
  bgImage?: string;
  bgDim?: number;
  bgBlur?: number;

  /** キャラ表示（デフォルト true） */
  showTestCharacter?: boolean;
  testCharacterSrc?: string;
  testCharacterHeight?: string;
  testCharacterOffset?: { right?: number; bottom?: number };
  testCharacterOpacity?: number;

  hideScrollbar?: boolean;

  /** ✅ 追加：縦スクロール制御（Homeで1画面固定したいとき用） */
  scrollY?: "auto" | "hidden";
  /** ✅ 追加：内側paddingを画面ごとに調整したいとき用 */
  contentPadding?: string;

  /**
   * ✅ 追加：PCのときだけタイトルを左に逃がしたい
   * - "top": 従来（中央カラムの上）
   * - "left": PCのみ左カラムに出す（スマホでは自動で "top" に戻す）
   */
  titleLayout?: "top" | "left";
};

const STACK_KEY = "tsuduri_nav_stack_v1";

// ✅ CharacterSettings 側の作成キャラを読むキー（直接文字列で参照）
const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";

// ✅ Settings.tsx で保存してる「キャラID → 画像パス」割り当てキー
const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

type CSSVars = Record<`--${string}`, string>;

/**
 * ✅ PageShellが画面遷移で再マウントしても“直前のキャラ”を維持するためのメモリ
 * - SPA遷移中は保持される（リロードしたら当然消える）
 */
let lastDisplayedCharacterSrc: string | null = null;

function getPath() {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-50)));
  } catch {
    // ignore
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
  name?: unknown; // v2
  label?: unknown; // v1
};

function loadCreatedCharacterIds(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  const ids = list
    .map((c) => (typeof c?.id === "string" ? c.id : ""))
    .filter((x) => !!x);

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(id);
  }
  return uniq;
}

function loadCharacterImageMap(): CharacterImageMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
  const map = safeJsonParse<CharacterImageMap>(raw, {});
  if (!map || typeof map !== "object") return {};
  return map;
}

function pickRandomFrom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i] ?? null;
}

/**
 * ✅ 毎分だけ tick を進める（時間帯の切替検知用）
 * 1) マウント直後に1回
 * 2) 次の「分」に揃えてから 60秒ごと
 */
function useMinuteTick() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    const bump = () => setTick((v) => v + 1);

    // 初回
    bump();

    const schedule = () => {
      const now = new Date();
      const msToNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

      timeoutId = window.setTimeout(
        () => {
          bump();
          intervalId = window.setInterval(bump, 60_000);
        },
        Math.max(200, msToNextMinute),
      );
    };

    schedule();

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  return tick;
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

/**
 * ✅ 背景の CSS 文字列を作る
 * - 404 等でも真っ黒にならないように「多重urlフォールバック」を入れる
 * - 1枚目がダメでも、2枚目以降の背景レイヤが描画される
 */
function makeBgCssValue(
  mode: BgMode,
  setId: string,
  fixedSrc: string,
  band: ReturnType<typeof getTimeBand>,
) {
  const sid = (setId ?? "").trim() || DEFAULT_SETTINGS.autoBgSet;

  if (mode === "off") {
    return "none";
  }

  if (mode === "fixed") {
    const pFixed = normalizePublicPath(fixedSrc) || "/assets/bg/ui-check.png";
    // fixed が死んでも ui-check に落ちる
    return `url(${pFixed}), url(/assets/bg/ui-check.png)`;
  }

  // auto
  const pAuto = resolveAutoBackgroundSrc(sid, band); // /assets/bg/{sid}_{band}.png
  const pSetFallback = normalizePublicPath(`/assets/bg/${sid}.png`); // /assets/bg/surf.png（旧1枚運用の救済）
  return `url(${pAuto}), url(${pSetFallback}), url(/assets/bg/ui-check.png)`;
}

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 980,

  showBack = true,
  onBack,
  backLabel = "← 戻る",
  fallbackHref = "/",
  disableStackPush = false,

  bgImage,
  bgDim = 0.55,
  bgBlur = 0,

  showTestCharacter = true,
  testCharacterSrc = "/assets/character-test.png",
  testCharacterHeight = "clamp(140px, 18vw, 220px)",
  testCharacterOffset = { right: 0, bottom: 0 },
  testCharacterOpacity = 1,

  hideScrollbar = true,

  scrollY = "auto",
  contentPadding,

  titleLayout = "top",
}: Props) {
  const { settings } = useAppSettings();
  const isMobile = useIsMobile();

  const current = useMemo(() => getPath(), []);

  useEffect(() => {
    if (disableStackPush) return;

    const stack = readStack();
    const last = stack[stack.length - 1];
    if (last !== current) {
      stack.push(current);
      writeStack(stack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableStackPush]);

  const handleBack = useCallback(() => {
    if (onBack) return onBack();

    const stack = readStack();
    if (stack.length && stack[stack.length - 1] === getPath()) stack.pop();

    const prev = stack.pop();
    writeStack(stack);
    window.location.assign(prev ?? fallbackHref);
  }, [onBack, fallbackHref]);

  // ========== 背景（Settings → CSS var）
  const effectiveBgDim = settings.bgDim ?? bgDim;
  const effectiveBgBlur = settings.bgBlur ?? bgBlur;

  // ========== ガラス（Settings → CSS var）
  const glassAlpha = clamp(settings.glassAlpha ?? 0.22, 0, 0.6);
  const glassBlur = clamp(settings.glassBlur ?? 10, 0, 24);
  const glassAlphaStrong = clamp(glassAlpha + 0.08, 0, 0.6);

  // ========== 背景画像（auto/fixed/off + 毎分更新）
  const minuteTick = useMinuteTick();

  const bgMode = (settings.bgMode ?? DEFAULT_SETTINGS.bgMode) as BgMode;
  const autoBgSet = (settings.autoBgSet ??
    DEFAULT_SETTINGS.autoBgSet) as string;
  const fixedBgSrc = (settings.fixedBgSrc ??
    DEFAULT_SETTINGS.fixedBgSrc) as string;

  const timeBand = useMemo(() => getTimeBand(new Date()), [minuteTick]);

  const resolvedBgCss = useMemo(() => {
    if (bgImage && bgImage.trim()) {
      const p = normalizePublicPath(bgImage);
      return `url(${p}), url(/assets/bg/ui-check.png)`;
    }
    return makeBgCssValue(bgMode, autoBgSet, fixedBgSrc, timeBand);
  }, [bgImage, bgMode, autoBgSet, fixedBgSrc, timeBand]);

  // ========== ストレージ変更検知（tick）
  const [storageTick, setStorageTick] = useState(0);

  useEffect(() => {
    const bump = () => setStorageTick((v) => v + 1);

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === CHARACTERS_STORAGE_KEY || e.key === CHARACTER_IMAGE_MAP_KEY)
        bump();
    };

    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const [createdIds, setCreatedIds] = useState<string[]>(() =>
    loadCreatedCharacterIds(),
  );
  const [characterImageMap, setCharacterImageMap] = useState<CharacterImageMap>(
    () => loadCharacterImageMap(),
  );

  useEffect(() => {
    setCreatedIds(loadCreatedCharacterIds());
    setCharacterImageMap(loadCharacterImageMap());
  }, [storageTick]);

  // ========== キャラ（固定/ランダム）※作成キャラから選ぶ
  const requestedCharacterId = useMemo(() => {
    if (!settings.characterEnabled) return null;
    if (createdIds.length === 0) return null;

    if (settings.characterMode === "random") {
      return pickRandomFrom(createdIds);
    }

    const fixed = settings.fixedCharacterId ?? "";
    if (fixed && createdIds.includes(fixed)) return fixed;
    return createdIds[0] ?? null;
  }, [
    settings.characterEnabled,
    settings.characterMode,
    settings.fixedCharacterId,
    createdIds,
  ]);

  const mappedCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null;

    const raw = characterImageMap[requestedCharacterId];
    if (typeof raw !== "string") return null;

    const p = normalizePublicPath(raw);
    return p || null;
  }, [requestedCharacterId, characterImageMap]);

  const requestedCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null;
    if (mappedCharacterSrc) return mappedCharacterSrc;
    return resolveCharacterSrc(requestedCharacterId);
  }, [requestedCharacterId, mappedCharacterSrc]);

  // ========== チラつき対策
  const initialSrc = useMemo(() => {
    if (lastDisplayedCharacterSrc) return lastDisplayedCharacterSrc;
    if (requestedCharacterSrc) return requestedCharacterSrc;
    return testCharacterSrc;
  }, [requestedCharacterSrc, testCharacterSrc]);

  const [displaySrc, setDisplaySrc] = useState<string | null>(() => initialSrc);
  const [fadeIn, setFadeIn] = useState(true);
  const lastSrcRef = useRef<string | null>(initialSrc);

  useEffect(() => {
    const next = requestedCharacterSrc ?? testCharacterSrc;
    if (!next) return;

    if (displaySrc === next) {
      lastDisplayedCharacterSrc = next;
      lastSrcRef.current = next;
      return;
    }

    if (lastSrcRef.current === next) {
      setDisplaySrc(next);
      setFadeIn(true);
      lastDisplayedCharacterSrc = next;
      return;
    }

    const img = new Image();
    img.decoding = "async";
    img.src = next;

    let cancelled = false;

    if (img.complete) {
      lastSrcRef.current = next;
      lastDisplayedCharacterSrc = next;
      setDisplaySrc(next);
      setFadeIn(true);
      return;
    }

    const onLoad = () => {
      if (cancelled) return;

      setFadeIn(false);
      requestAnimationFrame(() => {
        lastSrcRef.current = next;
        lastDisplayedCharacterSrc = next;
        setDisplaySrc(next);
        requestAnimationFrame(() => setFadeIn(true));
      });
    };

    img.addEventListener("load", onLoad);

    return () => {
      cancelled = true;
      img.removeEventListener("load", onLoad);
    };
  }, [requestedCharacterSrc, testCharacterSrc, displaySrc]);

  const characterScale = clamp(settings.characterScale ?? 1, 0.7, 5.0);
  const characterOpacity = clamp(
    settings.characterOpacity ?? testCharacterOpacity,
    0,
    1,
  );

  const shellStyle: CSSProperties & CSSVars = {
    width: "100vw",
    height: "100svh",
    overflow: "hidden",
    position: "relative",

    "--bg-dim": String(effectiveBgDim),
    "--bg-blur": `${effectiveBgBlur}px`,

    "--glass-alpha": String(glassAlpha),
    "--glass-alpha-strong": String(glassAlphaStrong),
    "--glass-blur": `${glassBlur}px`,

    "--bg-image": resolvedBgCss,

    "--sky-bottom": "46%",
    "--sea-top": "46%",
    "--sea-bottom": "73%",
  };

  const shouldShowCharacter =
    showTestCharacter && settings.characterEnabled && !!displaySrc;

  const scrollStyle: CSSProperties = {
    position: "relative",
    zIndex: 10,
    width: "100vw",
    height: "100svh",
    overflowY: scrollY,
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
  };

  const innerPadding = contentPadding ?? "clamp(16px, 3vw, 24px)";
  const scaledHeightCss = `calc(${testCharacterHeight} * ${characterScale})`;

  const effectiveTitleLayout =
    titleLayout === "left" && !isMobile ? "left" : "top";

  return (
    <div className="page-shell" style={shellStyle} data-timeband={timeBand}>
      {/* ✅ すりガラス保険CSS（var連動） */}
      <style>
        {`
          .glass{
            background: rgb(0 0 0 / var(--glass-alpha,0.22));
            border: 1px solid rgba(255,255,255,0.14);
            backdrop-filter: blur(var(--glass-blur,10px));
            -webkit-backdrop-filter: blur(var(--glass-blur,10px));
          }
          .glass.glass-strong{
            background: rgb(0 0 0 / var(--glass-alpha-strong,0.30));
          }
          .page-shell .scrollbar-hidden{
            scrollbar-width: none;
          }
          .page-shell .scrollbar-hidden::-webkit-scrollbar{
            display: none;
          }
        `}
      </style>

      {/* キャラレイヤ */}
      {shouldShowCharacter && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            right: testCharacterOffset.right ?? 0,
            bottom: testCharacterOffset.bottom ?? 0,
            zIndex: 5,
            pointerEvents: "none",
            userSelect: "none",
            opacity: characterOpacity,

            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            willChange: "opacity",

            filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.28))",
            transition: "opacity 220ms ease",
          }}
        >
          <img
            src={displaySrc ?? ""}
            alt=""
            draggable={false}
            loading="eager"
            decoding="async"
            style={{
              height: scaledHeightCss,
              width: "auto",
              display: "block",

              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              willChange: "opacity",

              opacity: fadeIn ? 1 : 0,
              transition: "opacity 260ms ease",
            }}
          />
        </div>
      )}

      {/* 戻る */}
      {showBack && (
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          aria-label="戻る"
          style={{ zIndex: 30 }}
        >
          {backLabel}
        </button>
      )}

      {/* スクロール領域 */}
      <div
        className={[
          "page-shell-scroll",
          hideScrollbar ? "scrollbar-hidden" : "",
          showBack ? "with-back-button" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={scrollStyle}
      >
        <div
          className="page-shell-inner"
          style={{
            maxWidth,
            margin: "0 auto",
            padding: innerPadding,
            boxSizing: "border-box",
            position: "relative",
            minHeight: "100%",
          }}
        >
          {effectiveTitleLayout === "top" ? (
            <div style={{ position: "relative" }}>
              {(title || subtitle) && (
                <div style={{ marginBottom: 16 }}>
                  {title}
                  {subtitle}
                </div>
              )}
              {children}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 320px) 1fr",
                gap: 16,
                alignItems: "start",
                minWidth: 0,
                minHeight: "100%",
              }}
            >
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  alignSelf: "start",
                  paddingTop: 2,
                  minWidth: 0,
                }}
              >
                <div
                  className="glass glass-strong"
                  style={{ borderRadius: 16, padding: 12 }}
                >
                  {title}
                  {subtitle ? (
                    <div style={{ marginTop: 8 }}>{subtitle}</div>
                  ) : null}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>{children}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
