// src/components/PageShell.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { useEmotion, type Emotion } from "../lib/emotion";

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

  /**
   * ✅ この画面で表示するキャラIDを強制したいとき（Chatの選択キャラと表示キャラを一致させる等）
   * 未指定なら settings（fixed/random）に従う
   */
  displayCharacterId?: string;

  /**
   * ✅ 表示する表情キー（neutral / think / happy ...）
   * 未指定時は EmotionContext（人格）に従う
   */
  displayExpression?: string;
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

function looksLikeImageFilePath(raw: string) {
  return /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(raw.trim());
}

function ensureTrailingSlash(p: string) {
  return p.endsWith("/") ? p : `${p}/`;
}

function normalizeExpression(raw: string): Emotion {
  const v = (raw ?? "").trim();
  if (
    v === "neutral" ||
    v === "happy" ||
    v === "sad" ||
    v === "think" ||
    v === "surprise" ||
    v === "love"
  ) {
    return v;
  }
  return "neutral";
}

function appendAssetVersion(url: string, assetVersion: string) {
  const u = (url ?? "").trim();
  const av = (assetVersion ?? "").trim();
  if (!u || !av) return u;

  const encoded = encodeURIComponent(av);
  return u.includes("?") ? `${u}&av=${encoded}` : `${u}?av=${encoded}`;
}

/**
 * ✅ 画像を「ロード完了してから」使うためのプリロード
 * - decode が使えれば decode 待ち
 */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();

    const img = new Image() as HTMLImageElement & {
      decode?: () => Promise<void>;
    };
    img.decoding = "async";

    img.onload = async () => {
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch {
        // decode失敗は許容
      }
      resolve();
    };
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

/** ✅ 画面判定キー（ルータ不問の簡易版） */
function getViewKey() {
  if (typeof window === "undefined") return "ssr";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export default function PageShell(props: Props) {
  const title = props.title;
  const subtitle = props.subtitle;
  const children = props.children;

  const maxWidth = props.maxWidth ?? 1100;
  const showBack = props.showBack ?? true;
  const onBack = props.onBack;
  const scrollY = props.scrollY ?? "auto";
  const contentPadding = props.contentPadding;

  // ✅ 人格（EmotionContext）
  const { emotion: globalEmotion } = useEmotion();
  const propExpressionRaw = (props.displayExpression ?? "").trim();
  const effectiveExpression = normalizeExpression(
    propExpressionRaw ? propExpressionRaw : globalEmotion,
  );

  const isMobile = useIsMobile();

  // ✅ ヘッダー高さは全端末で固定（位置ブレの根絶）
  const HEADER_H = 72;

  // ✅ Homeのように title/subtitle/back が全部無い画面はヘッダー自体を消す（= 上に詰める）
  const headerVisible = !!title || !!subtitle || showBack;
  const effectiveHeaderH = headerVisible ? HEADER_H : 0;

  const { settings } = useAppSettings();
  const minuteTick = useMinuteTick();

  // ✅ 画像キャッシュバスター（Cloudflare immutable 対策）
  const assetVersion = (settings.assetVersion ?? "").trim();

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

  // ✅ ここは「毎回読む」方式に（設定で更新したマップを即反映したい）
  const createdCharacters = loadCreatedCharacters();
  const charImageMap = loadCharacterImageMap();

  const [randomPickedId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    if (!createdCharacters.length) return "tsuduri";
    const i = Math.floor(Math.random() * createdCharacters.length);
    return createdCharacters[i]?.id ?? createdCharacters[0].id;
  });

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";
  const pickCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;

  // ✅ 画面側からの指定があればそれを最優先
  const displayCharacterId = (props.displayCharacterId ?? "").trim();
  const effectiveCharacterId = displayCharacterId || pickCharacterId;

  const characterOverrideSrc = (settings.characterOverrideSrc ?? "").trim();

  // ✅ 表情対応：/assets/characters/{id}/{expression}.png → neutral.png → 旧互換へ
  // 設定のキャラ別画像マップを最優先にする。
  const mappedRaw = (charImageMap[effectiveCharacterId] ?? "").trim();
  const mappedNorm = normalizePublicPath(mappedRaw) || "";
  const mappedIsFile = mappedNorm ? looksLikeImageFilePath(mappedNorm) : false;

  const mappedDir =
    mappedNorm && !mappedIsFile ? ensureTrailingSlash(mappedNorm) : "";

  const mappedExpressionSrc = mappedDir
    ? normalizePublicPath(`${mappedDir}${effectiveExpression}.png`)
    : "";
  const mappedNeutralSrc = mappedDir
    ? normalizePublicPath(`${mappedDir}neutral.png`)
    : "";
  const mappedSingleSrc = mappedIsFile ? mappedNorm : "";

  const expressionSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}/${effectiveExpression}.png`,
  );
  const neutralSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}/neutral.png`,
  );
  const fallbackSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}.png`,
  );

  const characterCandidates = useMemo(() => {
    const list = [
      appendAssetVersion(
        normalizePublicPath(characterOverrideSrc),
        assetVersion,
      ),
      mappedIsFile
        ? appendAssetVersion(mappedSingleSrc, assetVersion)
        : appendAssetVersion(mappedExpressionSrc, assetVersion),
      mappedIsFile ? "" : appendAssetVersion(mappedNeutralSrc, assetVersion),
      appendAssetVersion(expressionSrc, assetVersion),
      appendAssetVersion(neutralSrc, assetVersion),
      appendAssetVersion(fallbackSrc, assetVersion),
      appendAssetVersion("/assets/characters/tsuduri.png", assetVersion),
    ]
      .map((x) => (x ?? "").trim())
      .filter((x) => !!x);

    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const s of list) {
      if (seen.has(s)) continue;
      seen.add(s);
      uniq.push(s);
    }
    return uniq;
  }, [
    characterOverrideSrc,
    assetVersion,
    mappedIsFile,
    mappedSingleSrc,
    mappedExpressionSrc,
    mappedNeutralSrc,
    expressionSrc,
    neutralSrc,
    fallbackSrc,
  ]);

  /**
   * ✅ 「候補の解決」自体は変化しても、クロスフェードは
   * “最終的に確定した src” で1回だけ起こす
   */
  const [charResolvedSrc, setCharResolvedSrc] = useState<string>("");

  // 候補が変わったら最初から解決し直し（プリロードで見つかった最初の1枚を採用）
  const resolveTokenRef = useRef(0);
  useEffect(() => {
    if (!characterEnabled) {
      setCharResolvedSrc("");
      return;
    }
    const token = ++resolveTokenRef.current;

    (async () => {
      for (const src of characterCandidates) {
        try {
          await preloadImage(src);
          if (resolveTokenRef.current !== token) return;
          setCharResolvedSrc(src);
          return;
        } catch {
          // 次候補へ
        }
      }
      if (resolveTokenRef.current !== token) return;
      setCharResolvedSrc("");
    })();
  }, [characterCandidates.join("|"), characterEnabled]);

  // ✅ 表示倍率は 50%〜200% に統一（0.5〜2.0）
  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  // ===== UIクロスフェード / キャラクロスフェード 共通 =====
  const FADE_MS = 500;

  // ===== キャラ：クロスフェード（resolvedSrc が変わったら） =====
  const [charCurrentSrc, setCharCurrentSrc] = useState<string>("");
  const [charNextSrc, setCharNextSrc] = useState<string>("");
  const [charFadeOn, setCharFadeOn] = useState(false);
  const charFadeTokenRef = useRef(0);

  useEffect(() => {
    if (!characterEnabled || !charResolvedSrc) {
      setCharCurrentSrc("");
      setCharNextSrc("");
      setCharFadeOn(false);
      return;
    }

    // 初回
    if (!charCurrentSrc) {
      setCharCurrentSrc(charResolvedSrc);
      setCharNextSrc("");
      setCharFadeOn(false);
      return;
    }

    // 同一なら何もしない
    if (charResolvedSrc === charCurrentSrc) return;

    const token = ++charFadeTokenRef.current;

    // next をセットしてから、次フレームでfade開始
    setCharNextSrc(charResolvedSrc);
    setCharFadeOn(false);

    requestAnimationFrame(() => {
      if (charFadeTokenRef.current !== token) return;
      setCharFadeOn(true);
    });

    const t = window.setTimeout(() => {
      if (charFadeTokenRef.current !== token) return;
      setCharCurrentSrc(charResolvedSrc);
      setCharNextSrc("");
      setCharFadeOn(false);
    }, FADE_MS);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charResolvedSrc, characterEnabled]);

  // ===== UI：クロスフェード（画面キーが変わったら） =====
  const [uiViewKey, setUiViewKey] = useState(() => getViewKey());
  const [uiCurrentChildren, setUiCurrentChildren] =
    useState<ReactNode>(children);
  const [uiNextChildren, setUiNextChildren] = useState<ReactNode>(null);
  const [uiFadeOn, setUiFadeOn] = useState(false);
  const uiTokenRef = useRef(0);

  // children は毎回変わり得るので、画面キー基準で「切替」を検出
  useEffect(() => {
    const nextKey = getViewKey();
    if (nextKey === uiViewKey) {
      // 同一画面内の再レンダは current を更新（クロスフェードしない）
      setUiCurrentChildren(children);
      return;
    }

    const token = ++uiTokenRef.current;
    setUiViewKey(nextKey);

    // next 層に新しい children を置く
    setUiNextChildren(children);
    setUiFadeOn(false);

    // 次フレームでfade開始
    requestAnimationFrame(() => {
      if (uiTokenRef.current !== token) return;
      setUiFadeOn(true);
    });

    const t = window.setTimeout(() => {
      if (uiTokenRef.current !== token) return;
      setUiCurrentChildren(children);
      setUiNextChildren(null);
      setUiFadeOn(false);
    }, FADE_MS);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

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

      "--shell-header-h": `${effectiveHeaderH}px`,

      "--bg-image": bgImage,
      "--bg-blur": `${Math.round(clamp(bgBlur, 0, 60))}px`,
      "--bg-dim": `${clamp(bgDim, 0, 1)}`,

      "--glass-blur": `${Math.round(clamp(glassBlur, 0, 60))}px`,
      "--glass-alpha": `${clamp(glassAlpha, 0, 1)}`,
      "--glass-alpha-strong": `${clamp(glassAlpha + 0.13, 0, 1)}`,
    };
  }, [
    effectiveHeaderH,
    effectiveBgSrc,
    bgMode,
    bgBlur,
    bgDim,
    glassBlur,
    glassAlpha,
  ]);

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

  const characterBaseStyle: CSSProperties = {
    position: "absolute",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
    transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
    maxWidth: "min(46vw, 520px)",
    height: "auto",
    willChange: "opacity",
  };

  const characterUnderStyle: CSSProperties = {
    ...characterBaseStyle,
    opacity: clamp(characterOpacity, 0, 1) * (charFadeOn ? 0 : 1),
    transition: `opacity ${FADE_MS}ms ease`,
  };

  const characterOverStyle: CSSProperties = {
    ...characterBaseStyle,
    opacity: clamp(characterOpacity, 0, 1) * (charFadeOn ? 1 : 0),
    transition: `opacity ${FADE_MS}ms ease`,
  };

  // ✅ UIクロスフェード用（本文だけ）
  const uiLayerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  const uiUnderStyle: CSSProperties = {
    ...uiLayerBase,
    opacity: uiFadeOn ? 0 : 1,
    transition: `opacity ${FADE_MS}ms ease`,
  };

  const uiOverStyle: CSSProperties = {
    ...uiLayerBase,
    opacity: uiFadeOn ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease`,
    pointerEvents: uiFadeOn ? "auto" : "none",
  };

  return (
    <div className="page-shell" style={rootStyle}>
      {/* ✅ 背景レイヤ（最背面） */}
      <div style={bgLayerStyle} aria-hidden="true">
        <div style={bgImageStyle} />
        <div style={bgDimStyle} />

        {characterEnabled && charCurrentSrc ? (
          <>
            <img src={charCurrentSrc} alt="" style={characterUnderStyle} />
            {charNextSrc ? (
              <img src={charNextSrc} alt="" style={characterOverStyle} />
            ) : null}
          </>
        ) : null}
      </div>

      {/* ✅ ヘッダー（最前面） */}
      {headerVisible ? (
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
      ) : null}

      {/* ✅ 本文（情報レイヤ：キャラより前） */}
      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          {/* ここで本文を2枚重ねクロスフェード */}
          <div
            className="page-shell-inner"
            style={{ position: "relative", minHeight: "100%" }}
          >
            <div style={uiUnderStyle}>{uiCurrentChildren}</div>
            {uiNextChildren != null ? (
              <div style={uiOverStyle}>{uiNextChildren}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
