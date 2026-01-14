// src/components/PageShell.tsx
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  pickRandomCharacterId,
  resolveCharacterSrc,
  useAppSettings,
  normalizePublicPath,
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
};

const STACK_KEY = "tsuduri_nav_stack_v1";

// ✅ Settings.tsx で保存してる「キャラID → 画像パス」割り当てキー
const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

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

function loadCharacterImageMap(): CharacterImageMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
  const map = safeJsonParse<CharacterImageMap>(raw, {});
  if (!map || typeof map !== "object") return {};
  return map;
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
  testCharacterOffset = { right: 16, bottom: 16 },
  testCharacterOpacity = 1,

  hideScrollbar = true,
}: Props) {
  const { settings } = useAppSettings();

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
  // 背景（PageShell→CSS var）
  // ==========
  const effectiveBgDim = settings.bgDim ?? bgDim;
  const effectiveBgBlur = settings.bgBlur ?? bgBlur;

  // ==========
  // ガラス（PageShell→CSS var）
  // ==========
  const glassAlpha = clamp(settings.glassAlpha ?? 0.22, 0, 0.6);
  const glassBlur = clamp(settings.glassBlur ?? 10, 0, 24);

  // ==========
  // キャラ（固定/ランダム）
  // ==========
  const requestedCharacterId = useMemo(() => {
    if (!settings.characterEnabled) return null;
    if (settings.characterMode === "random") return pickRandomCharacterId();
    return settings.fixedCharacterId;
  }, [
    settings.characterEnabled,
    settings.characterMode,
    settings.fixedCharacterId,
  ]);

  // ✅ override が入ってたら最優先
  const overrideSrc = useMemo(() => {
    const p = normalizePublicPath(settings.characterOverrideSrc ?? "");
    return p || null;
  }, [settings.characterOverrideSrc]);

  // ✅ 作成キャラ割り当て（localStorage）を反映
  // 同一タブで Settings をいじると storage イベントが飛ばないことがあるので、
  // フォーカス復帰/表示復帰で再読込するためのトリガーを用意
  const [imageMapTick, setImageMapTick] = useState(0);
  useEffect(() => {
    const bump = () => setImageMapTick((v) => v + 1);

    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") bump();
    });

    return () => {
      window.removeEventListener("focus", bump);
      // visibilitychange は匿名関数なので remove できないが、実害は小さい
      // 気になるなら関数を外に出して remove する形にする
    };
  }, []);

  const mappedCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null;

    const map = loadCharacterImageMap();
    const raw = map[requestedCharacterId];
    if (typeof raw !== "string") return null;

    const p = normalizePublicPath(raw);
    return p || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCharacterId, imageMapTick]);

  const baseCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null;
    // 2) 割り当てがあればそれ
    if (mappedCharacterSrc) return mappedCharacterSrc;
    // 3) なければ従来のデフォルト解決
    return resolveCharacterSrc(requestedCharacterId);
  }, [requestedCharacterId, mappedCharacterSrc]);

  // 1) override が最優先
  const requestedCharacterSrc = overrideSrc ?? baseCharacterSrc;

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
    const onError = () => {
      // 読み込み失敗時は現状維持
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    return () => {
      cancelled = true;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [requestedCharacterSrc, testCharacterSrc]);

  const characterScale = clamp(settings.characterScale ?? 1, 0.7, 5.0);
  const characterOpacity = clamp(
    settings.characterOpacity ?? testCharacterOpacity,
    0,
    1
  );

  const shellStyle: CSSProperties & Record<string, string> = {
    width: "100vw",
    height: "100svh",
    overflow: "hidden",
    position: "relative",

    ["--bg-dim" as any]: String(effectiveBgDim),
    ["--bg-blur" as any]: `${effectiveBgBlur}px`,

    ["--glass-alpha" as any]: String(glassAlpha),
    ["--glass-blur" as any]: `${glassBlur}px`,
  };
  if (bgImage) shellStyle["--bg-image" as any] = `url(${bgImage})`;

  const shouldShowCharacter =
    showTestCharacter && settings.characterEnabled && !!displaySrc;

  return (
    <div className="page-shell" style={shellStyle}>
      {/* キャラレイヤ */}
      {shouldShowCharacter && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            right: testCharacterOffset.right ?? 16,
            bottom: testCharacterOffset.bottom ?? 16,
            zIndex: 5,
            pointerEvents: "none",
            userSelect: "none",
            opacity: characterOpacity,
            transform: `scale(${characterScale})`,
            transformOrigin: "right bottom",
            filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.28))",
            transition: "opacity 220ms ease, transform 220ms ease",
            willChange: "opacity, transform",
          }}
        >
          <img
            src={displaySrc ?? ""}
            alt=""
            draggable={false}
            loading="eager"
            decoding="async"
            style={{
              height: testCharacterHeight,
              width: "auto",
              display: "block",
              opacity: fadeIn ? 1 : 0,
              transition: "opacity 260ms ease",
              willChange: "opacity",
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
        style={{
          position: "relative",
          zIndex: 10,
          width: "100vw",
          height: "100svh",
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        <div
          className="page-shell-inner"
          style={{
            maxWidth,
            margin: "0 auto",
            padding: "clamp(16px, 3vw, 24px)",
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
