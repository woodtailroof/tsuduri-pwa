// src/components/PageShell.tsx
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveCharacterSrc,
  useAppSettings,
  normalizePublicPath,
  getTimeBand,
  resolveAutoBackgroundSrc,
  type BackgroundMode,
  type TimeBand,
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

  /** 互換用：設計的には使わない（背景は設定からのみ） */
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
};

const STACK_KEY = "tsuduri_nav_stack_v1";

// ✅ CharacterSettings 側の作成キャラを読むキー（直接文字列で参照）
const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";

// ✅ Settings.tsx で保存してる「キャラID → 画像パス」割り当てキー
const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

type CSSVars = Record<`--${string}`, string>;

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

  // ✅ 互換用：受けるだけ（設定画面だけが背景を決める設計）
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
}: Props) {
  const { settings } = useAppSettings();

  // ✅ eslint(no-unused-vars)対策：互換引数を「使用した」扱いにする
  void bgImage;

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

  // ==========
  // 背景（設定で全画面共通）
  // ==========
  const effectiveBgDim = settings.bgDim ?? bgDim;
  const effectiveBgBlur = settings.bgBlur ?? bgBlur;

  const bgMode: BackgroundMode =
    settings.bgMode === "fixed" || settings.bgMode === "off"
      ? settings.bgMode
      : "auto";

  // ==========
  // ガラス（PageShell→CSS var）
  // ==========
  const glassAlpha = clamp(settings.glassAlpha ?? 0.22, 0, 0.6);
  const glassBlur = clamp(settings.glassBlur ?? 10, 0, 24);
  const glassAlphaStrong = clamp(glassAlpha + 0.08, 0, 0.6);

  // ==========
  // ✅ auto背景：時刻で切替するための tick（1分）
  // ==========
  const [timeTick, setTimeTick] = useState(0);
  useEffect(() => {
    if (bgMode !== "auto") return;
    const id = window.setInterval(() => setTimeTick((v) => v + 1), 60_000);
    return () => window.clearInterval(id);
  }, [bgMode]);

  // ==========
  // ✅ 背景ソース解決：設定のみ
  // ==========
  const resolvedBgImage = useMemo(() => {
    if (bgMode === "off") return "";

    if (bgMode === "fixed") {
      return normalizePublicPath(settings.fixedBgSrc ?? "");
    }

    // auto：timeTick を参照して再計算させる（deps警告回避）
    const now = new Date(Date.now() + timeTick * 0);
    const setId =
      typeof settings.autoBgSet === "string" && settings.autoBgSet.trim()
        ? settings.autoBgSet
        : "surf";

    const band: TimeBand = getTimeBand(now);
    return resolveAutoBackgroundSrc(setId, band);
  }, [bgMode, settings.fixedBgSrc, settings.autoBgSet, timeTick]);

  // ==========
  // ✅ ストレージ変更検知（tick）
  // ==========
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

  // ==========
  // キャラ（固定/ランダム）※作成キャラから選ぶ
  // ==========
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

  // チラつき対策：先読み→差し替え
  const [displaySrc, setDisplaySrc] = useState<string | null>(() => {
    return requestedCharacterSrc ?? testCharacterSrc;
  });
  const [fadeIn, setFadeIn] = useState(true);
  const lastSrcRef = useRef<string | null>(null);

  useEffect(() => {
    const next = requestedCharacterSrc ?? testCharacterSrc;
    if (!next) return;

    if (lastSrcRef.current === next) return;
    lastSrcRef.current = next;

    const img = new Image();
    img.decoding = "async";
    img.src = next;

    let cancelled = false;
    const onLoad = () => {
      if (cancelled) return;
      setFadeIn(false);
      requestAnimationFrame(() => {
        setDisplaySrc(next);
        requestAnimationFrame(() => setFadeIn(true));
      });
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", () => {});

    return () => {
      cancelled = true;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", () => {});
    };
  }, [requestedCharacterSrc, testCharacterSrc]);

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
  };

  if (resolvedBgImage) shellStyle["--bg-image"] = `url(${resolvedBgImage})`;

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

  return (
    <div className="page-shell" style={shellStyle}>
      <style>
        {`
          .glass{
            background: rgba(0,0,0,var(--glass-alpha,0.22));
            border: 1px solid rgba(255,255,255,0.14);
            backdrop-filter: blur(var(--glass-blur,10px));
            -webkit-backdrop-filter: blur(var(--glass-blur,10px));
          }
          .glass.glass-strong{
            background: rgba(0,0,0,var(--glass-alpha-strong,0.30));
          }
        `}
      </style>

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
          }}
        >
          <div style={{ position: "relative" }}>
            {(title || subtitle) && (
              <div style={{ marginBottom: 16 }}>
                {title}
                {subtitle}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
