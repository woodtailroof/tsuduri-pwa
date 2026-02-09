// src/components/PageShell.tsx
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  type BgMode,
  useAppSettings,
} from "../lib/appSettings";
import { CHARACTERS_STORAGE_KEY } from "../screens/CharacterSettings";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  showBack?: boolean;
  onBack?: () => void;
  titleLayout?: "center" | "left";
  scrollY?: "auto" | "hidden";
  contentPadding?: string | number;
};

type CSSVars = Record<`--${string}`, string>;
type StyleWithVars = CSSProperties & CSSVars;

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true;
    return (
      window.matchMedia("(max-width: 820px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    );
  });
  return isMobile;
}

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 1100,
  showBack = true,
  onBack,
  scrollY = "auto",
  contentPadding,
}: Props) {
  const isMobile = useIsMobile();
  const HEADER_H = 72;
  const { settings } = useAppSettings();

  /* =========================
   * 背景
   * ========================= */
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet = settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet;
  const fixedBgSrc =
    normalizePublicPath(settings.fixedBgSrc) ?? "/assets/bg/ui-check.png";

  const autoPreviewSrc = useMemo(() => {
    const band = getTimeBand(new Date());
    return resolveAutoBackgroundSrc(autoBgSet, band);
  }, [autoBgSet]);

  const effectiveBgSrc =
    bgMode === "off" ? "" : bgMode === "fixed" ? fixedBgSrc : autoPreviewSrc;

  /* =========================
   * キャラ
   * ========================= */
  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;

  const rawMap = safeJsonParse<CharacterImageMap>(
    localStorage.getItem(CHARACTER_IMAGE_MAP_KEY),
    {},
  );

  const charSrc = normalizePublicPath(
    rawMap[settings.fixedCharacterId ?? "tsuduri"] ??
      `/assets/characters/${settings.fixedCharacterId ?? "tsuduri"}.png`,
  );

  /* =========================
   * ルート
   * ========================= */
  const rootStyle = useMemo<StyleWithVars>(() => {
    return {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",

      "--shell-header-h": `${HEADER_H}px`,
      "--bg-image": effectiveBgSrc ? `url("${effectiveBgSrc}")` : "none",
      "--bg-dim": `${settings.bgDim ?? DEFAULT_SETTINGS.bgDim}`,
      "--bg-blur": `${settings.bgBlur ?? DEFAULT_SETTINGS.bgBlur}px`,
      "--glass-alpha": `${settings.glassAlpha ?? DEFAULT_SETTINGS.glassAlpha}`,
      "--glass-blur": `${settings.glassBlur ?? DEFAULT_SETTINGS.glassBlur}px`,
    };
  }, [effectiveBgSrc, settings]);

  /* =========================
   * レイヤ構造（ここが核心）
   * ========================= */

  return (
    <div className="page-shell" style={rootStyle}>
      {/* ===== 背景＋キャラレイヤ（最背面） ===== */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {characterEnabled && charSrc && (
          <img
            src={charSrc}
            alt=""
            style={{
              position: "absolute",
              right: "env(safe-area-inset-right)",
              bottom: "env(safe-area-inset-bottom)",
              opacity: clamp(
                settings.characterOpacity ?? DEFAULT_SETTINGS.characterOpacity,
                0,
                1,
              ),
              transform: `scale(${clamp(
                settings.characterScale ?? DEFAULT_SETTINGS.characterScale,
                0.5,
                2,
              )})`,
              transformOrigin: "bottom right",
              maxWidth: "min(46vw, 520px)",
              filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
            }}
          />
        )}
      </div>

      {/* ===== ヘッダー ===== */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_H,
          zIndex: 1000,
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            height: "100%",
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            {title}
            {subtitle}
          </div>
          {showBack && (
            <button onClick={onBack ?? (() => history.back())}>← 戻る</button>
          )}
        </div>
      </div>

      {/* ===== 情報レイヤ（最前面） ===== */}
      <div
        style={{
          position: "relative",
          zIndex: 20,
          height: "100%",
          overflowY: scrollY,
          paddingTop: HEADER_H,
        }}
      >
        <div
          style={{
            maxWidth,
            margin: "0 auto",
            padding: contentPadding ?? (isMobile ? "14px" : "18px"),
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
