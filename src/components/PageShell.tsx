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
  type BgTimeBand,
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

  /** 旧互換：title の配置指示（ただしPCは固定ヘッダーで強制的に左上） */
  titleLayout?: "center" | "left";

  /** スクロール制御（※PCは「本文領域」だけに適用して統一） */
  scrollY?: "auto" | "hidden";

  /**
   * ✅ 旧実装互換：PageShell内の「本文領域」の padding を上書き
   * 例: "0" / "12px 18px" / 0
   */
  contentPadding?: string | number;

  /**
   * ✅ 旧実装互換：設定画面などが渡しているフラグ（現行PageShellでは表示制御しない）
   * 受け口だけ用意してビルドを通す。
   */
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
  const [, setTick] = useState(0);

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

  return 1;
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
    titleLayout = "center",
    scrollY = "auto",
    contentPadding,
  } = props;

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // ✅ PC固定ヘッダー仕様（タイトル左上、戻る右上を固定）
  const DESKTOP_HEADER_H = 72;

  // ✅ AppSettings（背景/ガラス/キャラ）
  const { settings } = useAppSettings();
  useMinuteTick(); // 自動背景の時間帯追従

  // ===== 背景 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;
  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw) || "/assets/bg/ui-check.png";

  const nowBand: BgTimeBand = useMemo(() => getTimeBand(new Date()), []);
  // ↑ minute tick は hook 側で rerender を起こすので、ここは new Date() でOK

  const autoPreviewSrc = useMemo(
    () => resolveAutoBackgroundSrc(autoBgSet, getTimeBand(new Date())),
    [autoBgSet],
  );

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
      minHeight: "100dvh",
      overflowX: "clip",
      overflowY: "visible",
      display: "flex",
      flexDirection: "column",
      "--shell-header-h": `${DESKTOP_HEADER_H}px`,

      // ✅ 背景・ガラス（index.css の .page-shell が参照）
      "--bg-image": bgImage,
      "--bg-blur": `${Math.round(clamp(bgBlur, 0, 60))}px`,
      "--bg-dim": `${clamp(bgDim, 0, 1)}`,
      "--glass-blur": `${Math.round(clamp(glassBlur, 0, 60))}px`,
      "--glass-alpha": `${clamp(glassAlpha, 0, 1)}`,
      "--glass-alpha-strong": `${clamp(glassAlpha + 0.13, 0, 1)}`,
    };
  }, [
    DESKTOP_HEADER_H,
    effectiveBgSrc,
    bgMode,
    bgBlur,
    bgDim,
    glassBlur,
    glassAlpha,
  ]);

  // デフォルトの本文 padding（旧互換で contentPadding が来たら上書き）
  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  // ✅ 本文領域（PCはここだけスクロール制御して統一）
  const contentOuterStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "clip",
    overflowY: isDesktop ? scrollY : "visible",
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    minHeight: "100%",
  };

  // ✅ PC: ヘッダー分だけ本文を下げる
  const desktopContentStyle: CSSProperties = isDesktop
    ? { paddingTop: "var(--shell-header-h)" }
    : {};

  const onClickBack = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
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

  // ✅ PC固定ヘッダー
  const desktopHeaderStyle: CSSProperties = {
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

  const desktopHeaderInnerStyle: CSSProperties = {
    height: "100%",
    maxWidth,
    margin: "0 auto",
    padding: "10px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  };

  const titleSlotStyleDesktop: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flex: "1 1 auto",
    alignItems: "flex-start",
    textAlign: "left",
  };

  const subtitleStyleDesktop: CSSProperties = {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.66)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "56vw",
  };

  const titleClampStyle: CSSProperties = {
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  // ✅ スマホヘッダー
  const mobileHeaderWrapStyle: CSSProperties = {
    display: "grid",
    gap: 6,
    marginBottom: 12,
  };

  const mobileTitleSlotStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: titleLayout === "left" ? "flex-start" : "center",
    gap: 10,
    minWidth: 0,
  };

  const mobileSubtitleStyle: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.62)",
    textAlign: titleLayout === "left" ? "left" : "center",
  };

  const characterStyle: CSSProperties = {
    position: "fixed",
    right: "max(6px, env(safe-area-inset-right))",
    bottom: "max(6px, env(safe-area-inset-bottom))",
    zIndex: 30,
    pointerEvents: "none",
    opacity: clamp(characterOpacity, 0, 1),
    transform: `scale(${clamp(characterScale, 0.7, 5)})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
    maxWidth: "min(46vw, 520px)",
    height: "auto",
  };

  return (
    <div className="page-shell" style={rootStyle}>
      {/* ✅ キャラ（全画面共通） */}
      {characterEnabled && characterSrc ? (
        <img src={characterSrc} alt="" style={characterStyle} />
      ) : null}

      {isDesktop ? (
        <div style={desktopHeaderStyle}>
          <div style={desktopHeaderInnerStyle}>
            <div style={titleSlotStyleDesktop}>
              {title ? <div style={titleClampStyle}>{title}</div> : null}
              {subtitle ? (
                <div style={subtitleStyleDesktop}>{subtitle}</div>
              ) : null}
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
      ) : (
        <div style={mobileHeaderWrapStyle}>
          <div style={mobileTitleSlotStyle}>
            {title ? <div style={titleClampStyle}>{title}</div> : null}
          </div>

          {subtitle ? <div style={mobileSubtitleStyle}>{subtitle}</div> : null}

          {showBack ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClickBack} style={backBtnStyle}>
                ← 戻る
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          <div className="page-shell-inner" style={desktopContentStyle}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
