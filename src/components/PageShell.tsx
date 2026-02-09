// src/components/PageShell.tsx
import {
  useCallback,
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

  /** 画面ごとに幅を変えたい時用（チャットだけ広め…とか） */
  maxWidth?: number;

  /** 戻るボタンを表示するか（デフォルト: true） */
  showBack?: boolean;

  /** 戻るボタン押下時の挙動を上書きしたい場合 */
  onBack?: () => void;

  /** 旧互換：title の配置指示（今は left 前提。受け口だけ残す） */
  titleLayout?: "center" | "left";

  /** スクロール制御（本文領域のスクロール） */
  scrollY?: "auto" | "hidden";

  /**
   * ✅ PageShell内の「本文領域」の padding を上書き
   * 例: "0" / "12px 18px" / 0
   */
  contentPadding?: string | number;

  /** ✅ 旧コード互換：Settings 側が渡してても落ちないよう受け口だけ残す */
  showTestCharacter?: boolean;
};

// CSS変数（--xxx）を style に安全に入れるための型
type CSSVars = Record<`--${string}`, string>;
type StyleWithVars = CSSProperties & CSSVars;

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown; // v2
  label?: unknown; // v1
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

/** ✅ 1分ごとにUIを更新（自動背景の時間帯追従用） */
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
  // ✅ TS6133対策：互換プロップは「型に残す」だけで、分割代入して変数にしない（= 未使用エラー回避）
  const title = props.title;
  const subtitle = props.subtitle;
  const children = props.children;

  const maxWidth = props.maxWidth ?? 1100;
  const showBack = props.showBack ?? true;
  const onBack = props.onBack;
  const scrollY = props.scrollY ?? "auto";
  const contentPadding = props.contentPadding;

  const isMobile = useIsMobile();

  // ✅ ヘッダー高さは全端末で固定（位置ブレの根絶）
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

  // ✅ 表示倍率は 50%〜200% に統一（0.5〜2.0）
  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  // ✅ root: #app-root が overflow:hidden なので PageShell 内で完結させる
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
      position: "relative",

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

  // ✅ 本文スクロール領域（ヘッダー分は常に確保）
  const contentOuterStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "clip",
    overflowY: scrollY,
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    paddingTop: "var(--shell-header-h)",
    position: "relative",
    zIndex: 20, // ✅ 情報レイヤは常に前
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    minHeight: "100%",
  };

  const onClickBack = useCallback(() => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
  }, [onBack]);

  // ✅ ヘッダーは常に viewport 基準で固定
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

  const titleSlotStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flex: "1 1 auto",
    alignItems: "flex-start",
    textAlign: "left",
  };

  const titleClampStyle: CSSProperties = {
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const subtitleStyle: CSSProperties = {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.66)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "70vw",
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
    flex: "0 0 auto",
  };

  /**
   * ✅ レイヤ順を「DOMとスタッキングコンテキスト」で安定化
   * 背景レイヤ(0) の中にキャラを入れて、情報レイヤ(20)より必ず後ろへ。
   * iOS Safari の fixed + backdropFilter バグに強い構造にする。
   */
  const bgLayerStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  };

  const bgImageStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: "var(--bg-image)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: `blur(var(--bg-blur))`,
    transform: "scale(1.03)",
  };

  const bgDimStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `rgba(0,0,0,var(--bg-dim))`,
  };

  const characterStyle: CSSProperties = {
    position: "absolute",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
    opacity: clamp(characterOpacity, 0, 1),
    transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
    maxWidth: "min(46vw, 520px)",
    height: "auto",
  };

  return (
    <div className="page-shell" style={rootStyle}>
      {/* ✅ 背景レイヤ（最背面） */}
      <div style={bgLayerStyle} aria-hidden="true">
        <div style={bgImageStyle} />
        <div style={bgDimStyle} />
        {characterEnabled && characterSrc ? (
          <img src={characterSrc} alt="" style={characterStyle} />
        ) : null}
      </div>

      {/* ✅ ヘッダー（最前面） */}
      <div style={headerStyle}>
        <div style={headerInnerStyle}>
          <div style={titleSlotStyle}>
            {title ? <div style={titleClampStyle}>{title}</div> : null}
            {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
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

      {/* ✅ 本文（情報レイヤ：キャラより前） */}
      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          <div className="page-shell-inner" style={{ position: "relative" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
