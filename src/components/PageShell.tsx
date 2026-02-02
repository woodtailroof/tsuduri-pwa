// src/components/PageShell.tsx
import type { ReactNode } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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

/**
 * ✅ purity ルール対策
 * - render 中に Date.now / Math.random を呼ばない
 * - “mountごとのseed” はモジュールスコープの連番から作る
 */
const GLOBAL_MOUNT_SEED = Math.floor(Math.random() * 1_000_000_000);
let MOUNT_COUNTER = 0;
function nextMountSeed() {
  // 連番で十分（擬似ランダム選択の“分岐”に使うだけ）
  MOUNT_COUNTER = (MOUNT_COUNTER + 1) % 1_000_000_000;
  return GLOBAL_MOUNT_SEED + MOUNT_COUNTER;
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

function pickBySeed(arr: string[], seed: number): string | "" {
  if (!arr.length) return "";
  const i = Math.abs(seed) % arr.length;
  return arr[i] ?? "";
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
  const bgDim = clamp(
    Number.isFinite(settings.bgDim) ? settings.bgDim : 0.35,
    0,
    1,
  );
  const bgBlur = clamp(
    Number.isFinite(settings.bgBlur) ? settings.bgBlur : 10,
    0,
    40,
  );

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

  // ✅ mountごとのseed（render中に不純関数ゼロ）
  const mountSeedRef = useRef<number>(nextMountSeed());

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

    if (characterMode === "fixed") {
      return fixedCharacterId || ids[0] || "tsuduri";
    }

    const picked = pickBySeed(ids, mountSeedRef.current);
    return picked || ids[0] || "tsuduri";
  }, [characterMode, fixedCharacterId]);

  const characterSrc = useMemo(() => {
    if (!characterEnabled) return "";
    if (characterOverrideSrc) return characterOverrideSrc;

    const map = loadCharacterImageMap();
    const raw = map[activeCharacterId] ?? "";
    const mapped = normalizePublicPath(raw);

    return mapped || `/assets/characters/${activeCharacterId}.png` || "";
  }, [characterEnabled, characterOverrideSrc, activeCharacterId, charMapTick]);

  // キャラに被らないよう “下に余白” を足す（上限あり）
  const characterReservePx = useMemo(() => {
    if (!characterEnabled) return 0;
    const base = 120;
    return clamp(Math.round(base * characterScale), 90, 280);
  }, [characterEnabled, characterScale]);

  // ===== レイアウト（統一）=====
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

  // UIは最前面（キャラより上）
  const innerStyle: CSSProperties = useMemo(
    () => ({
      width: "100%",
      maxWidth,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      boxSizing: "border-box",
      position: "relative",
      zIndex: 3,
      flex: 1,
      minHeight: 0,
    }),
    [maxWidth],
  );

  const headerStyle: CSSProperties = useMemo(() => {
    const alignItems = titleLayout === "left" ? "flex-start" : "center";
    const textAlign: CSSProperties["textAlign"] =
      titleLayout === "left" ? "left" : "center";

    return {
      position: "relative",
      padding: "8px 12px 0 12px",
      minWidth: 0,
      boxSizing: "border-box",
      display: "grid",
      gap: 6,
      alignItems: "start",
      justifyItems: alignItems,
      textAlign,
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
            filter: `blur(${Math.round(bgBlur)}px)`,
            opacity: 1,
            zIndex: 0,
          }}
        />
      )}

      {/* キャラ（UIの裏） */}
      {characterEnabled && !!characterSrc && (
        <img
          src={characterSrc}
          alt=""
          draggable={false}
          style={{
            position: "fixed",
            right: "env(safe-area-inset-right)",
            bottom: "env(safe-area-inset-bottom)",
            height: `${Math.round(220 * characterScale)}px`,
            width: "auto",
            opacity: characterOpacity,
            zIndex: 1,
            pointerEvents: "none",
            userSelect: "none",
            filter: "none",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      {/* 暗幕（背景+キャラをまとめて落とす。UIには影響しない） */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0,0,0,${bgDim})`,
          zIndex: 2,
        }}
      />

      {/* 右上固定：戻るボタン */}
      {showBack && (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : history.back())}
          className="chat-btn glass"
          style={{
            position: "fixed",
            top: "env(safe-area-inset-top)",
            right: "env(safe-area-inset-right)",
            margin: 10,
            height: 36,
            padding: "8px 12px",
            borderRadius: 12,
            color: "rgba(255,255,255,0.92)",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            zIndex: 4,
          }}
        >
          ← 戻る
        </button>
      )}

      <div style={innerStyle}>
        {(title || subtitle) && (
          <div style={headerStyle}>
            {title}
            {subtitle}
            {showTestCharacter ? (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.55)",
                  userSelect: "none",
                }}
                title="showTestCharacter（PageShell互換）"
              >
                👧
              </div>
            ) : null}
          </div>
        )}

        <div style={contentStyle}>{children}</div>
      </div>
    </div>
  );
}
