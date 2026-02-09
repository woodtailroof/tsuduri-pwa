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
  showTestCharacter?: boolean;
};

type CSSVars = Record<`--${string}`, string>;
type StyleWithVars = CSSProperties & CSSVars;

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function useMinuteTick() {
  const [tick, setTick] = useState(0);

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

function loadCreatedCharacters(): { id: string; label: string }[] {
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
  const uniq: { id: string; label: string }[] = [];
  for (const c of normalized) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    uniq.push(c);
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

export default function PageShell(props: Props) {
  const {
    title,
    subtitle,
    children,
    maxWidth = 1100,
    showBack = true,
    onBack,
    scrollY = "auto",
    contentPadding,
  } = props;

  const isMobile = useIsMobile();
  const HEADER_H = 72;

  const { settings } = useAppSettings();
  const minuteTick = useMinuteTick();

  // ===== 背景 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;
  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw) || "/assets/bg/ui-check.png";

  const autoPreviewSrc = useMemo(() => {
    const band = getTimeBand(new Date());
    return resolveAutoBackgroundSrc(autoBgSet, band);
  }, [autoBgSet, minuteTick]);

  const effectiveBgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return autoPreviewSrc;
  }, [bgMode, fixedBgSrc, autoPreviewSrc]);

  // ===== ガラス =====
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

  // ===== キャラ =====
  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const createdCharacters = useMemo(() => loadCreatedCharacters(), []);
  const charImageMap = useMemo(() => loadCharacterImageMap(), []);

  const [randomPickedId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    if (!createdCharacters.length) return "tsuduri";
    const i = Math.floor(Math.random() * createdCharacters.length);
    return createdCharacters[i]?.id ?? createdCharacters[0].id;
  });

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";
  const pickCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;

  const characterOverrideSrc = (settings.characterOverrideSrc ?? "").trim();
  const mappedSrc = normalizePublicPath(charImageMap[pickCharacterId] ?? "");
  const fallbackSrc = normalizePublicPath(
    `/assets/characters/${pickCharacterId}.png`,
  );

  const characterSrc = normalizePublicPath(
    characterOverrideSrc ||
      mappedSrc ||
      fallbackSrc ||
      "/assets/characters/tsuduri.png",
  );

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const rootStyle = useMemo<StyleWithVars>(() => {
    const bgImage =
      effectiveBgSrc && bgMode !== "off" ? `url("${effectiveBgSrc}")` : "none";

    return {
      width: "100%",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",

      "--shell-header-h": `${HEADER_H}px`,
      "--bg-image": bgImage,
      "--bg-blur": `${Math.round(clamp(bgBlur, 0, 60))}px`,
      "--bg-dim": `${clamp(bgDim, 0, 1)}`,
      "--glass-blur": `${Math.round(clamp(glassBlur, 0, 60))}px`,
      "--glass-alpha": `${clamp(glassAlpha, 0, 1)}`,
      "--glass-alpha-strong": `${clamp(glassAlpha + 0.13, 0, 1)}`,
    };
  }, [HEADER_H, effectiveBgSrc, bgMode, bgBlur, bgDim, glassBlur, glassAlpha]);

  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  const contentOuterStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "clip",
    overflowY: scrollY,
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    paddingTop: "var(--shell-header-h)",
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    minHeight: "100%",
  };

  const onClickBack = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
  };

  const headerStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    height: "var(--shell-header-h)",
    background: "rgba(0,0,0,0.22)",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const headerInnerStyle: CSSProperties = {
    height: "100%",
    width: "100%",
    paddingTop: "max(10px, env(safe-area-inset-top))",
    paddingLeft: "max(14px, env(safe-area-inset-left))",
    paddingRight: "max(14px, env(safe-area-inset-right))",
    paddingBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    boxSizing: "border-box",
  };

  const backBtnStyle: CSSProperties = {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.28)",
    color: "rgba(255,255,255,0.88)",
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

  // ★ スマホ時はキャラを情報レイヤより奥へ
  const characterStyle: CSSProperties = {
    position: "fixed",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
    zIndex: isMobile ? 5 : 10,
    pointerEvents: "none",
    opacity: clamp(characterOpacity, 0, 1),
    transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
    maxWidth: "min(46vw, 520px)",
    height: "auto",
  };

  return (
    <div className="page-shell" style={rootStyle}>
      {characterEnabled && characterSrc ? (
        <img src={characterSrc} alt="" style={characterStyle} />
      ) : null}

      <div style={headerStyle}>
        <div style={headerInnerStyle}>
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            {title}
            {subtitle}
          </div>
          {showBack ? (
            <button type="button" onClick={onClickBack} style={backBtnStyle}>
              ← 戻る
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>

      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          <div
            className="page-shell-inner"
            style={{ position: "relative", zIndex: 20 }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
