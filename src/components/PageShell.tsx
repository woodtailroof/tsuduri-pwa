// src/components/PageShell.tsx
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  pickRandomCharacterId,
  resolveCharacterSrc,
  useAppSettings,
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

  showTestCharacter?: boolean;
  testCharacterSrc?: string;
  testCharacterHeight?: string;
  testCharacterOffset?: { right?: number; bottom?: number };
  testCharacterOpacity?: number;

  hideScrollbar?: boolean;
};

const STACK_KEY = "tsuduri_nav_stack_v1";

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
  const isNarrow = useIsNarrow(720);
  const hook = useAppSettings();
  const settings = hook?.settings;

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

    if (stack.length && stack[stack.length - 1] === getPath()) {
      stack.pop();
    }

    const prev = stack.pop();
    writeStack(stack);

    window.location.assign(prev ?? fallbackHref);
  }, [onBack, fallbackHref]);

  const effectiveBgDim = settings?.bgDim ?? bgDim;
  const effectiveBgBlur = settings?.bgBlur ?? bgBlur;

  const infoPanelAlphaRaw = clamp(settings?.infoPanelAlpha ?? 0, 0, 1);
  const infoPanelBlurRaw = clamp(settings?.infoPanelBlur ?? 8, 0, 24);

  // =============
  // ✅ キャラ（固定/ランダム）
  // =============
  const requestedCharacterId = useMemo(() => {
    if (!settings?.characterEnabled) return null;
    if (settings?.characterMode === "random")
      return pickRandomCharacterId(settings?.fixedCharacterId);
    return settings?.fixedCharacterId ?? null;
  }, [
    settings?.characterEnabled,
    settings?.characterMode,
    settings?.fixedCharacterId,
  ]);

  const requestedCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null;
    return resolveCharacterSrc(requestedCharacterId);
  }, [requestedCharacterId]);

  const [displaySrc, setDisplaySrc] = useState<string | null>(() => {
    if (!requestedCharacterSrc) return testCharacterSrc;
    return requestedCharacterSrc;
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
      if (cancelled) return;
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    return () => {
      cancelled = true;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [requestedCharacterSrc, testCharacterSrc]);

  const characterScale = clamp(settings?.characterScale ?? 1, 0.7, 5.0);
  const baseOpacity = clamp(
    settings?.characterOpacity ?? testCharacterOpacity,
    0,
    1
  );

  // ✅ スマホで巨大なときはUI保護（必要なら）
  const extraFade = isNarrow && characterScale >= 2.5 ? 0.78 : 1;
  const characterOpacity = clamp(baseOpacity * extraFade, 0, 1);

  // ✅ 情報板が0でも、スマホで巨大化してたら最低限だけ入れて文字を守る
  const infoPanelAlpha =
    isNarrow && characterScale >= 2.2
      ? Math.max(infoPanelAlphaRaw, 0.12)
      : infoPanelAlphaRaw;

  // ✅ 磨りガラスは設定値で（スマホで巨大化してる時は強すぎるとキャラが死ぬので少し抑える）
  const infoPanelBlur =
    isNarrow && characterScale >= 2.2
      ? Math.min(infoPanelBlurRaw, 10)
      : infoPanelBlurRaw;

  const shellStyle: CSSProperties & Record<string, string> = {
    width: "100vw",
    height: "100svh",
    overflow: "hidden",
    position: "relative",

    ["--bg-dim" as any]: String(effectiveBgDim),
    ["--bg-blur" as any]: `${effectiveBgBlur}px`,
  };
  if (bgImage) shellStyle["--bg-image" as any] = `url(${bgImage})`;

  const shouldShowCharacter =
    showTestCharacter && !!settings?.characterEnabled && !!displaySrc;

  return (
    <div className="page-shell" style={shellStyle}>
      {shouldShowCharacter && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
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
          {infoPanelAlpha > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 18,
                background: `rgba(0,0,0,${infoPanelAlpha})`,

                // ✅ ここが調整対象
                backdropFilter:
                  infoPanelBlur > 0 ? `blur(${infoPanelBlur}px)` : "none",
                WebkitBackdropFilter:
                  infoPanelBlur > 0 ? `blur(${infoPanelBlur}px)` : "none",

                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                pointerEvents: "none",
              }}
            />
          )}

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
