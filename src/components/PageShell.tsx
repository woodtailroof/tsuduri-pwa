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
   * PageShell内の「本文領域」の padding を上書き
   * 例: "0" / "12px 18px" / 0
   */
  contentPadding?: string | number;

  /** 旧コード互換 */
  showTestCharacter?: boolean;

  /**
   * この画面で表示するキャラIDを強制したいとき
   * 未指定なら settings（fixed/random）に従う
   */
  displayCharacterId?: string;

  /**
   * ✅ 表示する表情キー
   * 例: "neutral" | "thinking" | "happy" ...
   */
  displayExpression?: string;
};

// CSS変数を style に安全に入れるための型
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

/** 1分ごとにUIを更新（自動背景の時間帯追従用） */
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
  const title = props.title;
  const subtitle = props.subtitle;
  const children = props.children;

  const maxWidth = props.maxWidth ?? 1100;
  const showBack = props.showBack ?? true;
  const onBack = props.onBack;
  const scrollY = props.scrollY ?? "auto";
  const contentPadding = props.contentPadding;

  const displayExpression = (props.displayExpression ?? "neutral").trim();

  const isMobile = useIsMobile();

  const HEADER_H = 72;
  const headerVisible = !!title || !!subtitle || showBack;
  const effectiveHeaderH = headerVisible ? HEADER_H : 0;

  const { settings } = useAppSettings();
  const minuteTick = useMinuteTick();

  // ===== 背景 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;
  const fixedBgSrc =
    normalizePublicPath(settings.fixedBgSrc) || "/assets/bg/ui-check.png";

  const autoPreviewSrc = useMemo(() => {
    const band = getTimeBand(new Date());
    return resolveAutoBackgroundSrc(autoBgSet, band);
  }, [autoBgSet, minuteTick]);

  const effectiveBgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return autoPreviewSrc;
  }, [bgMode, fixedBgSrc, autoPreviewSrc]);

  // ===== キャラ =====
  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const createdCharacters = useMemo(loadCreatedCharacters, []);
  const charImageMap = useMemo(loadCharacterImageMap, []);

  const [randomPickedId] = useState<string>(() => {
    if (!createdCharacters.length) return "tsuduri";
    const i = Math.floor(Math.random() * createdCharacters.length);
    return createdCharacters[i]?.id ?? createdCharacters[0].id;
  });

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";
  const pickCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;

  const displayCharacterId = (props.displayCharacterId ?? "").trim();
  const effectiveCharacterId = displayCharacterId || pickCharacterId;

  const characterOverrideSrc = (settings.characterOverrideSrc ?? "").trim();

  // ===== 表情対応（ここが今回の差分の本体）=====
  const expressionSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}/${displayExpression}.png`,
  );
  const neutralSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}/neutral.png`,
  );
  const mappedSrc = normalizePublicPath(
    charImageMap[effectiveCharacterId] ?? "",
  );
  const fallbackSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}.png`,
  );

  const characterSrc = normalizePublicPath(
    characterOverrideSrc ||
      expressionSrc ||
      neutralSrc ||
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
      position: "relative",

      "--shell-header-h": `${effectiveHeaderH}px`,
      "--bg-image": bgImage,
    };
  }, [effectiveHeaderH, effectiveBgSrc, bgMode]);

  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  const onClickBack = useCallback(() => {
    if (onBack) return onBack();
    window.history.back();
  }, [onBack]);

  return (
    <div className="page-shell" style={rootStyle}>
      {/* 背景＋キャラ */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        {characterEnabled && characterSrc && (
          <img
            src={characterSrc}
            alt=""
            style={{
              position: "absolute",
              right: "env(safe-area-inset-right)",
              bottom: "env(safe-area-inset-bottom)",
              opacity: clamp(characterOpacity, 0, 1),
              transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
              transformOrigin: "bottom right",
              maxWidth: "min(46vw, 520px)",
              filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
            }}
          />
        )}
      </div>

      {headerVisible && (
        <div
          style={{
            position: "fixed",
            inset: "0 0 auto 0",
            height: "var(--shell-header-h)",
            zIndex: 999,
            background: "rgba(0,0,0,0.22)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ padding: 12, display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              {title}
              {subtitle}
            </div>
            {showBack && <button onClick={onClickBack}>← 戻る</button>}
          </div>
        </div>
      )}

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: scrollY,
          paddingTop: "var(--shell-header-h)",
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth,
            margin: "0 auto",
            padding: resolvedFramePadding,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
