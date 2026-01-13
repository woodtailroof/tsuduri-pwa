// src/components/PageShell.tsx
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "../lib/appSettings";
import { useCharacterStore } from "../lib/characterStore";

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

function pickRandomId(ids: string[], excludeId?: string) {
  if (ids.length <= 1) return ids[0] ?? null;
  const filtered = excludeId ? ids.filter((x) => x !== excludeId) : ids;
  const idx = Math.floor(Math.random() * filtered.length);
  return filtered[idx] ?? ids[0] ?? null;
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
  const { state: characterState } = useCharacterStore();

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

  // ===========
  // ✅ 設定反映（暗幕/ぼかし/情報板）
  // ===========
  const effectiveBgDim = settings?.bgDim ?? bgDim;
  const effectiveBgBlur = settings?.bgBlur ?? bgBlur;
  const infoPanelAlpha = clamp(settings?.infoPanelAlpha ?? 0, 0, 1);

  // ===========
  // ✅ キャラ（固定/ランダム）
  // ===========
  const characterIds = useMemo(
    () => characterState.characters.map((c) => c.id),
    [characterState.characters]
  );

  const lastPickedIdRef = useRef<string | null>(null);

  const requestedCharacterId = useMemo(() => {
    if (!settings?.characterEnabled) return null;
    if (!characterIds.length) return null;

    // fixed のとき：設定にIDがなければ activeId に寄せる
    if (settings.characterMode !== "random") {
      const fixed =
        settings.fixedCharacterId &&
        characterIds.includes(settings.fixedCharacterId)
          ? settings.fixedCharacterId
          : null;
      return (
        fixed ??
        (characterIds.includes(characterState.activeId)
          ? characterState.activeId
          : characterIds[0])
      );
    }

    // random のとき：前回と被りにくく
    const picked = pickRandomId(
      characterIds,
      lastPickedIdRef.current ?? undefined
    );
    lastPickedIdRef.current = picked;
    return picked;
  }, [
    settings?.characterEnabled,
    settings?.characterMode,
    settings?.fixedCharacterId,
    characterIds,
    characterState.activeId,
  ]);

  const requestedCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null;
    const hit = characterState.characters.find(
      (c) => c.id === requestedCharacterId
    );
    return hit?.portraitSrc ?? testCharacterSrc;
  }, [requestedCharacterId, characterState.characters, testCharacterSrc]);

  // チラつき対策：先読みしてから差し替え
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
      // エラー時は無理に変えない
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
  const characterOpacity = clamp(
    settings?.characterOpacity ?? testCharacterOpacity,
    0,
    1
  );

  // ✅ bgImage 未指定時に :root の --bg-image を潰さない
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
    showTestCharacter && settings?.characterEnabled && !!displaySrc;

  return (
    <div className="page-shell" style={shellStyle}>
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
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
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
