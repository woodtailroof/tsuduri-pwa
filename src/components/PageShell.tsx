// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  useAppSettings,
  type BgTimeBand,
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

  /** タイトル配置 */
  titleLayout?: "left" | "center";

  /**
   * Shell全体の縦スクロール制御
   * - "hidden": 画面全体はスクロール禁止（推奨、各画面の特定カラムだけスクロール）
   * - "auto": children 側をスクロールさせたい時
   */
  scrollY?: "hidden" | "auto";

  /** children の内側余白（PageShell側で一括管理したい時） */
  contentPadding?: string;

  /**
   * 設定画面などで「キャラを一時的に消したい」用途
   * - false: キャラを非表示
   * - true/undefined: 通常表示
   */
  showTestCharacter?: boolean;
};

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

/** 作成キャラ一覧（v2/v1混在をゆるく吸収） */
function loadCreatedCharacterIds(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  if (!Array.isArray(list)) return [];
  const ids = list
    .map((c) => (typeof c?.id === "string" ? c.id : ""))
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

/** キャラID -> 画像パス の割り当て（Settings で編集してるやつ） */
const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

function loadCharacterImageMap(): CharacterImageMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
  const map = safeJsonParse<CharacterImageMap>(raw, {});
  if (!map || typeof map !== "object") return {};
  return map;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 980,
  showBack = true,
  onBack,
  titleLayout = "left",
  scrollY = "hidden",
  contentPadding = "clamp(10px, 2vw, 18px)",
  showTestCharacter = true,
}: Props) {
  const { settings } = useAppSettings();

  // ===== 見た目（安全なデフォルト） =====
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

  // ===== 背景 =====
  const bgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet = (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim();
  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc = normalizePublicPath(fixedBgSrcRaw);

  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    let timer: number | null = null;
    const arm = () => {
      const now = Date.now();
      const ms = 60_000 - (now % 60_000) + 5;
      timer = window.setTimeout(() => {
        setMinuteTick((v) => v + 1);
        arm();
      }, ms);
    };
    arm();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  const nowBand: BgTimeBand = useMemo(
    () => getTimeBand(new Date()),
    [minuteTick],
  );

  const bgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc || "";
    return resolveAutoBackgroundSrc(autoBgSet, nowBand) || "";
  }, [bgMode, fixedBgSrc, autoBgSet, nowBand]);

  // ===== キャラ =====
  const characterEnabled =
    (settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled) &&
    showTestCharacter;

  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;
  const fixedCharacterId = (settings.fixedCharacterId ?? "").trim();
  const overrideSrcRaw = (settings.characterOverrideSrc ?? "").trim();

  const characterScale = Number.isFinite(settings.characterScale)
    ? clamp(settings.characterScale, 0.7, 5.0)
    : DEFAULT_SETTINGS.characterScale;

  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? clamp(settings.characterOpacity, 0, 1)
    : DEFAULT_SETTINGS.characterOpacity;

  const [randomPickId, setRandomPickId] = useState<string>("");

  // 画面遷移（＝マウント）や、モード/作成キャラ変化でランダムを引き直す
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (characterMode !== "random") return;

    const ids = loadCreatedCharacterIds();
    const pool = ids.length ? ids : ["tsuduri"];
    const pick = pool[Math.floor(Math.random() * pool.length)] || "tsuduri";
    setRandomPickId(pick);
  }, [characterMode, minuteTick]);

  // storage は同一タブ更新で飛ばないことがあるので、Settings が投げる tsuduri-settings も拾う
  useEffect(() => {
    const onAny = () => {
      if (characterMode !== "random") return;
      const ids = loadCreatedCharacterIds();
      const pool = ids.length ? ids : ["tsuduri"];
      const pick = pool[Math.floor(Math.random() * pool.length)] || "tsuduri";
      setRandomPickId(pick);
    };
    window.addEventListener("storage", onAny);
    window.addEventListener("tsuduri-settings" as any, onAny);
    return () => {
      window.removeEventListener("storage", onAny);
      window.removeEventListener("tsuduri-settings" as any, onAny);
    };
  }, [characterMode]);

  const effectiveCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickId;

  const characterSrc = useMemo(() => {
    const map = loadCharacterImageMap();

    const override = normalizePublicPath(overrideSrcRaw);
    if (override) return override;

    const mapped = normalizePublicPath(map[effectiveCharacterId] ?? "");
    if (mapped) return mapped;

    // 最後の保険（プロジェクトに合わせて好きに差し替えOK）
    return "/assets/characters/tsuduri.png";
  }, [overrideSrcRaw, effectiveCharacterId, minuteTick]);

  // ===== 戻る =====
  const handleBack = () => {
    if (onBack) onBack();
    else history.back();
  };

  return (
    <div
      style={{
        height: "100svh",
        overflow: "hidden",
        position: "relative",
        color: "#fff",
        // glass 変数
        ["--ts-glass-alpha" as any]: String(glassAlpha),
        ["--ts-glass-blur" as any]: `${glassBlur}px`,
      }}
    >
      <style>{`
        /* ===== glass ===== */
        .glass{
          background: rgba(0,0,0, calc(var(--ts-glass-alpha, 0.22)));
          border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(var(--ts-glass-blur, 12px));
          -webkit-backdrop-filter: blur(var(--ts-glass-blur, 12px));
        }
        .glass-strong{
          background: rgba(0,0,0, calc(var(--ts-glass-alpha, 0.22) + 0.06));
          border: 1px solid rgba(255,255,255,0.16);
        }

        /* iOSの変なスクロール */
        .ts-scroll{
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* ボタン/入力の最低見た目 */
        button, select, input {
          font: inherit;
        }
      `}</style>

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
            filter: bgBlur ? `blur(${bgBlur}px)` : undefined,
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
          background: `rgba(0,0,0,${clamp(bgDim, 0, 1)})`,
          zIndex: 1,
        }}
      />

      {/* 画面本体 */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* ヘッダー（固定） */}
        <div
          style={{
            padding: contentPadding,
            paddingBottom: 10,
          }}
        >
          <div
            style={{
              maxWidth,
              margin: "0 auto",
              position: "relative",
              display: "grid",
              gap: 8,
            }}
          >
            {/* 戻る（右上固定） */}
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                className="glass"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 14,
                  color: "rgba(255,255,255,0.92)",
                  cursor: "pointer",
                  userSelect: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                title="戻る"
              >
                ⟵ 戻る
              </button>
            )}

            <div
              style={{
                textAlign: titleLayout === "center" ? "center" : "left",
                paddingRight: showBack ? 86 : 0, // 右上ボタン分の逃げ
              }}
            >
              {title}
              {subtitle}
            </div>
          </div>
        </div>

        {/* コンテンツ（ここを scrollY で制御） */}
        <div
          className={scrollY === "auto" ? "ts-scroll" : undefined}
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: scrollY === "auto" ? "auto" : "hidden",
            overflowX: "hidden",
            padding: contentPadding,
            paddingTop: 0,
          }}
        >
          <div style={{ maxWidth, margin: "0 auto", minHeight: 0 }}>
            {children}
          </div>
        </div>
      </div>

      {/* キャラ（右下固定） */}
      {characterEnabled && !!characterSrc && (
        <img
          src={characterSrc}
          alt=""
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            transformOrigin: "bottom right",
            transform: `scale(${characterScale})`,
            opacity: characterOpacity,
            pointerEvents: "none",
            zIndex: 3,
            maxWidth: "55vw",
            maxHeight: "60svh",
            filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.35))",
          }}
        />
      )}
    </div>
  );
}
