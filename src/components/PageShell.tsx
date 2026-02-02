// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAppSettings } from "../lib/appSettings";

type TitleLayout = "left" | "center";

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

  /** タイトルの寄せ（デフォ: center） */
  titleLayout?: TitleLayout;

  /** コンテンツ領域の縦スクロール制御（デフォ: auto） */
  scrollY?: "auto" | "hidden";

  /** コンテンツのパディング（デフォ: 14） */
  contentPadding?: number | string;

  /** 設定画面などでテスト表示したい時用（互換用） */
  showTestCharacter?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizePublicPath(p: string) {
  const s = (p ?? "").trim();
  if (!s) return "";
  if (s.startsWith("/")) return s;
  return `/${s}`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Settings.tsx で使ってる作成キャラ画像マップ */
const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

function loadCharacterImageMap(): CharacterImageMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
  const map = safeJsonParse<CharacterImageMap>(raw, {});
  if (!map || typeof map !== "object") return {};
  return map;
}

/** Settings の “作成キャラ” から読むストレージ（CharacterSettings 側） */
const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";
type StoredCharacterLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
};

function loadCreatedCharacterIds(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  const ids = list
    .map((c) => (typeof c?.id === "string" ? c.id : ""))
    .filter(Boolean);
  // uniq
  return Array.from(new Set(ids));
}

function getTimeBand(d: Date): "morning" | "day" | "evening" | "night" {
  const h = d.getHours();
  if (h >= 5 && h <= 9) return "morning";
  if (h >= 10 && h <= 15) return "day";
  if (h >= 16 && h <= 18) return "evening";
  return "night";
}

function pickRandom<T>(arr: T[]): T | null {
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
  titleLayout = "center",
  scrollY = "auto",
  contentPadding = 14,
  showTestCharacter = false,
}: Props) {
  const { settings } = useAppSettings();

  // ===== 背景・表示系（Settings と連動）=====
  const bgDim = Number.isFinite(settings.bgDim) ? settings.bgDim : 0.35;
  const bgBlur = Number.isFinite(settings.bgBlur) ? settings.bgBlur : 10;

  const bgMode = (settings.bgMode ?? "auto") as "auto" | "fixed" | "off";
  const autoBgSet = (settings.autoBgSet ?? "surf").trim() || "surf";
  const fixedBgSrcRaw = settings.fixedBgSrc ?? "";
  const fixedBgSrc = normalizePublicPath(fixedBgSrcRaw);

  // 1分ごとに “auto背景” が追従するようにする
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    let timer: number | null = null;

    const arm = () => {
      const now = Date.now();
      const msToNextMinute = 60_000 - (now % 60_000) + 5;
      timer = window.setTimeout(() => {
        setMinuteTick((v) => v + 1);
        arm();
      }, msToNextMinute);
    };

    arm();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  const bgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc || "";
    const band = getTimeBand(new Date());
    return `/assets/bg/${autoBgSet}_${band}.png`;
  }, [bgMode, fixedBgSrc, autoBgSet, minuteTick]);

  // ===== キャラ（Settings と連動）=====
  const characterEnabled = settings.characterEnabled ?? true;
  const characterMode = (settings.characterMode ?? "fixed") as
    | "fixed"
    | "random";
  const fixedCharacterId = (settings.fixedCharacterId ?? "").trim();
  const characterScale = clamp(
    Number.isFinite(settings.characterScale) ? settings.characterScale : 1.0,
    0.7,
    5.0,
  );
  const characterOpacity = clamp(
    Number.isFinite(settings.characterOpacity)
      ? settings.characterOpacity
      : 0.9,
    0,
    1,
  );

  // 既存互換: “キャラ画像を全部上書き” があればそれ最優先
  const characterOverrideSrc = normalizePublicPath(
    (settings.characterOverrideSrc ?? "").trim(),
  );

  // ランダム用: 画面遷移ごとに変えたいので PageShell mount ごとに決める
  const [activeCharacterId, setActiveCharacterId] = useState<string>(() => {
    const ids = loadCreatedCharacterIds();
    if (characterMode === "fixed")
      return fixedCharacterId || ids[0] || "tsuduri";
    return pickRandom(ids)?.toString() || ids[0] || "tsuduri";
  });

  useEffect(() => {
    // 設定が変わったら反映
    const ids = loadCreatedCharacterIds();
    if (characterMode === "fixed") {
      setActiveCharacterId(fixedCharacterId || ids[0] || "tsuduri");
    } else {
      setActiveCharacterId(pickRandom(ids) || ids[0] || "tsuduri");
    }
  }, [characterMode, fixedCharacterId]);

  // 同一タブで Settings が map を更新したとき追従（tsuduri-settings イベント）
  const [charMapTick, setCharMapTick] = useState(0);
  useEffect(() => {
    const on = () => setCharMapTick((v) => v + 1);
    window.addEventListener("tsuduri-settings", on as EventListener);
    return () =>
      window.removeEventListener("tsuduri-settings", on as EventListener);
  }, []);

  const characterSrc = useMemo(() => {
    if (!characterEnabled) return "";
    if (characterOverrideSrc) return characterOverrideSrc;

    const map = loadCharacterImageMap();
    const raw = map[activeCharacterId] ?? "";
    const mapped = normalizePublicPath(raw);

    // マップが無い場合のフォールバック
    // public/assets/characters/tsuduri.png を置いてある想定（無ければ好きなパスに変えてOK）
    return (
      mapped ||
      `/assets/characters/${activeCharacterId}.png` ||
      "/assets/characters/tsuduri.png"
    );
  }, [characterEnabled, characterOverrideSrc, activeCharacterId, charMapTick]);

  // キャラに被らないよう “下に余白” を足す（やりすぎないよう上限あり）
  const characterReservePx = useMemo(() => {
    if (!characterEnabled) return 0;
    const base = 140; // 基本確保量
    return clamp(Math.round(base * characterScale), 120, 340);
  }, [characterEnabled, characterScale]);

  const dim = clamp(bgDim, 0, 1);
  const blur = clamp(bgBlur, 0, 40);

  const containerStyle: CSSProperties = useMemo(
    () => ({
      minHeight: "100svh",
      width: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "stretch",
      padding:
        "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
      boxSizing: "border-box",
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#0b0f18",
    }),
    [],
  );

  const innerStyle: CSSProperties = useMemo(
    () => ({
      width: "100%",
      maxWidth,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      boxSizing: "border-box",
      position: "relative",
      zIndex: 2,
      flex: 1,
      minHeight: 0,
    }),
    [maxWidth],
  );

  const headerStyle: CSSProperties = useMemo(() => {
    const align = titleLayout === "left" ? "flex-start" : "center";
    return {
      display: "flex",
      alignItems: align,
      justifyContent: "space-between",
      gap: 12,
      minWidth: 0,
      padding: "0 12px",
      boxSizing: "border-box",
    };
  }, [titleLayout]);

  const titleWrapStyle: CSSProperties = useMemo(() => {
    const align = titleLayout === "left" ? "flex-start" : "center";
    const textAlign: CSSProperties["textAlign"] =
      titleLayout === "left" ? "left" : "center";
    return {
      display: "flex",
      flexDirection: "column",
      alignItems: align,
      justifyContent: "center",
      gap: 6,
      minWidth: 0,
      width: "100%",
      textAlign,
    };
  }, [titleLayout]);

  const contentStyle: CSSProperties = useMemo(() => {
    const basePadding =
      typeof contentPadding === "number"
        ? `${contentPadding}px`
        : contentPadding;

    // 下方向だけキャラ分をちょい足し（Chat は scrollY="hidden" で自前制御なので影響小）
    const padBottom =
      typeof contentPadding === "number"
        ? `${contentPadding + characterReservePx}px`
        : `calc(${basePadding} + ${characterReservePx}px)`;

    return {
      flex: 1,
      minHeight: 0,
      overflowY: scrollY,
      overflowX: "hidden",
      paddingTop: basePadding,
      paddingLeft: basePadding,
      paddingRight: basePadding,
      paddingBottom: padBottom,
      boxSizing: "border-box",
    };
  }, [scrollY, contentPadding, characterReservePx]);

  return (
    <div style={containerStyle}>
      {/* 背景 */}
      {!!bgSrc && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transform: "scale(1.02)",
            filter: `blur(${Math.round(blur)}px)`,
            opacity: 1,
            zIndex: 0,
          }}
        />
      )}

      {/* 暗幕 */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0,0,0,${dim})`,
          zIndex: 1,
        }}
      />

      {/* キャラ（画面右下固定） */}
      {characterEnabled && !!characterSrc && (
        <img
          src={characterSrc}
          alt=""
          draggable={false}
          style={{
            position: "fixed",
            right: "max(10px, env(safe-area-inset-right))",
            bottom: "max(10px, env(safe-area-inset-bottom))",
            height: `${Math.round(220 * characterScale)}px`,
            width: "auto",
            opacity: characterOpacity,
            zIndex: 10,
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.45))",
          }}
          onError={(e) => {
            // 画像が無ければ静かに消す（壊れアイコン回避）
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      <div style={innerStyle}>
        {/* ヘッダー */}
        {(showBack || title || subtitle) && (
          <div style={headerStyle}>
            {showBack ? (
              <button
                type="button"
                onClick={() => (onBack ? onBack() : history.back())}
                className="chat-btn glass"
                style={{
                  height: 36,
                  padding: "8px 12px",
                  borderRadius: 12,
                  color: "rgba(255,255,255,0.92)",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ← 戻る
              </button>
            ) : (
              <div style={{ width: 78 }} />
            )}

            <div style={titleWrapStyle}>
              {title}
              {subtitle}
            </div>

            {/* 右側スペーサ */}
            <div
              style={{
                width: 78,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              {showTestCharacter ? (
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.55)",
                    userSelect: "none",
                  }}
                  title="showTestCharacter（PageShell互換）"
                >
                  👧
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* コンテンツ */}
        <div style={contentStyle}>{children}</div>
      </div>
    </div>
  );
}
