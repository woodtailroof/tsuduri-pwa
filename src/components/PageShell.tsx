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
  return Array.from(new Set(ids));
}

function getTimeBand(d: Date): "morning" | "day" | "evening" | "night" {
  const h = d.getHours();
  if (h >= 5 && h <= 9) return "morning";
  if (h >= 10 && h <= 15) return "day";
  if (h >= 16 && h <= 18) return "evening";
  return "night";
}

/** “ランダム（画面遷移ごと）” のためのマウントID（impure関数は使わない） */
let PAGE_SHELL_MOUNT_COUNTER = 0;
function nextMountId() {
  PAGE_SHELL_MOUNT_COUNTER += 1;
  return PAGE_SHELL_MOUNT_COUNTER;
}

function pickBySeed(ids: string[], seed: number): string {
  if (!ids.length) return "tsuduri";
  const s = Math.abs(seed) % ids.length;
  return ids[s] ?? ids[0] ?? "tsuduri";
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

  // “画面遷移ごと”に seed が変わる（Date.now/Math.randomは使わない）
  const [mountId] = useState(() => nextMountId());

  // ===== 背景・表示系（Settings と連動）=====
  const bgDim = Number.isFinite(settings.bgDim) ? settings.bgDim : 0.35;
  const bgBlur = Number.isFinite(settings.bgBlur) ? settings.bgBlur : 10;

  const bgMode = (settings.bgMode ?? "auto") as "auto" | "fixed" | "off";
  const autoBgSet = (settings.autoBgSet ?? "surf").trim() || "surf";
  const fixedBgSrcRaw = settings.fixedBgSrc ?? "";
  const fixedBgSrc = normalizePublicPath(fixedBgSrcRaw);

  // 1分ごとに “auto背景” が追従する
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

  // 同一タブで Settings が map を更新したとき追従（tsuduri-settings イベント）
  const [charMapTick, setCharMapTick] = useState(0);
  useEffect(() => {
    const on = () => setCharMapTick((v) => v + 1);
    window.addEventListener("tsuduri-settings", on as EventListener);
    return () =>
      window.removeEventListener("tsuduri-settings", on as EventListener);
  }, []);

  const activeCharacterId = useMemo(() => {
    const ids = loadCreatedCharacterIds();
    if (characterMode === "fixed")
      return fixedCharacterId || ids[0] || "tsuduri";
    // “画面遷移ごと” = PageShell が mount されるたびに mountId が変わる
    return pickBySeed(ids, mountId);
  }, [characterMode, fixedCharacterId, mountId]);

  const characterSrc = useMemo(() => {
    if (!characterEnabled) return "";
    if (characterOverrideSrc) return characterOverrideSrc;

    const map = loadCharacterImageMap();
    const raw = map[activeCharacterId] ?? "";
    const mapped = normalizePublicPath(raw);

    // マップが無い場合のフォールバック
    return (
      mapped ||
      `/assets/characters/${activeCharacterId}.png` ||
      "/assets/characters/tsuduri.png"
    );
  }, [characterEnabled, characterOverrideSrc, activeCharacterId, charMapTick]);

  // コンテンツ下の確保（控えめに）
  const characterReservePx = useMemo(() => {
    if (!characterEnabled) return 0;
    const base = 90;
    return clamp(Math.round(base * characterScale), 80, 220);
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
      boxSizing: "border-box",
      position: "relative",
      zIndex: 5, // UIを最前面
      flex: 1,
      minHeight: 0, // スクロールの肝
    }),
    [maxWidth],
  );

  const headerStyle: CSSProperties = useMemo(() => {
    const align = titleLayout === "left" ? "flex-start" : "center";
    const textAlign: CSSProperties["textAlign"] =
      titleLayout === "left" ? "left" : "center";
    return {
      padding: "10px 12px 0",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      alignItems: align,
      textAlign,
      gap: 6,
      minWidth: 0,
    };
  }, [titleLayout]);

  const contentStyle: CSSProperties = useMemo(() => {
    const basePadding =
      typeof contentPadding === "number"
        ? `${contentPadding}px`
        : contentPadding;

    const padBottom =
      typeof contentPadding === "number"
        ? `${contentPadding + characterReservePx}px`
        : `calc(${basePadding} + ${characterReservePx}px)`;

    return {
      flex: 1,
      minHeight: 0, // スクロールの肝
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

      {/* キャラ（UIより後ろに回す / 右下ぴったり / 影なし） */}
      {characterEnabled && !!characterSrc && (
        <img
          src={characterSrc}
          alt=""
          draggable={false}
          style={{
            position: "fixed",
            right: "calc(env(safe-area-inset-right) + 0px)",
            bottom: "calc(env(safe-area-inset-bottom) + 0px)",
            height: `${Math.round(220 * characterScale)}px`,
            width: "auto",
            opacity: characterOpacity,
            zIndex: 3, // UI(5)より後ろ、背景(0-1)より前
            pointerEvents: "none",
            userSelect: "none",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      {/* 戻るボタン：右上固定で統一 */}
      {showBack && (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : history.back())}
          className="chat-btn glass"
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top) + 10px)",
            right: "calc(env(safe-area-inset-right) + 10px)",
            height: 36,
            padding: "8px 12px",
            borderRadius: 12,
            color: "rgba(255,255,255,0.92)",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            zIndex: 20,
          }}
        >
          ← 戻る
        </button>
      )}

      <div style={innerStyle}>
        {/* タイトル */}
        {(title || subtitle) && (
          <div style={headerStyle}>
            {title}
            {subtitle}
            {showTestCharacter ? (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.45)",
                  userSelect: "none",
                  marginTop: 2,
                }}
                title="showTestCharacter（PageShell互換）"
              >
                👧
              </div>
            ) : null}
          </div>
        )}

        {/* コンテンツ */}
        <div style={contentStyle}>{children}</div>
      </div>
    </div>
  );
}
