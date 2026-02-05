// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  useAppSettings,
  type BgMode,
  type BgTimeBand,
} from "../lib/appSettings";

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

  /**
   * ✅ 画面全体は基本スクロール禁止
   * ただし特殊な画面で「Shell側でスクロールしたい」時だけ "auto" にできる
   */
  scrollY?: "hidden" | "auto";

  /** 設定画面などで、右側のテストキャラを出す/出さない */
  showTestCharacter?: boolean;
};

/** ====== セッション固定のseed（render中の Date.now は禁止なのでモジュール初期化で作る） ====== */
const SESSION_SEED = (() => {
  try {
    // sessionStorageが使えるならそれを優先（同タブ内で安定）
    const k = "tsuduri_session_seed_v1";
    if (typeof window !== "undefined" && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(k);
      if (existing) return existing;
      const v = String(Date.now()); // module initなのでeslint purityに引っかからない
      window.sessionStorage.setItem(k, v);
      return v;
    }
  } catch {
    // ignore
  }
  return String(Date.now());
})();

/** 文字列を安定した数値ハッシュにする（djb2） */
function hashString(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** 配列から seed で決定的に1つ選ぶ */
function pickBySeed<T>(arr: T[], seedStr: string): T | null {
  if (!arr.length) return null;
  const h = hashString(seedStr);
  return arr[h % arr.length] ?? arr[0] ?? null;
}

/** 1分境界で更新（時刻連動背景の追従用） */
function useMinuteTicker() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let timer: number | null = null;

    const arm = () => {
      const now = Date.now();
      const msToNextMinute = 60_000 - (now % 60_000) + 10;
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

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 980,
  showBack = true,
  onBack,
  scrollY = "hidden",
  showTestCharacter = true,
}: Props) {
  const { settings } = useAppSettings();
  const minuteTick = useMinuteTicker();

  // ===== 背景 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;

  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc = normalizePublicPath(fixedBgSrcRaw);

  const nowBand: BgTimeBand = useMemo(() => {
    // minuteTick が変わると更新される（依存として正しい）
    return getTimeBand(new Date());
  }, [minuteTick]);

  const bgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return resolveAutoBackgroundSrc(autoBgSet, nowBand);
  }, [bgMode, fixedBgSrc, autoBgSet, nowBand]);

  // ===== 見た目（暗幕/ぼかし/ガラス）=====
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

  // ===== キャラ（決定的ランダム）=====
  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;

  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const fixedCharacterId =
    settings.fixedCharacterId ?? DEFAULT_SETTINGS.fixedCharacterId;

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;

  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const characterOverrideSrcRaw =
    settings.characterOverrideSrc ?? DEFAULT_SETTINGS.characterOverrideSrc;
  const characterOverrideSrc = normalizePublicPath(characterOverrideSrcRaw);

  // 画像割り当てmap（Settings.tsxで保存してる前提）
  const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
  const [charImageMapTick, setCharImageMapTick] = useState(0);

  useEffect(() => {
    // 同一タブ更新追従（Settingsが dispatchEvent("tsuduri-settings") してる想定）
    const onSync = () => setCharImageMapTick((v) => v + 1);
    window.addEventListener("tsuduri-settings", onSync);
    return () => window.removeEventListener("tsuduri-settings", onSync);
  }, []);

  const charImageMap = useMemo(() => {
    try {
      const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }, [charImageMapTick]);

  // “作成キャラ一覧”をどこから読むかは既存仕様に合わせる必要があるが、
  // PageShell側では「fixedCharacterIdがあればそれ」「randomなら割当mapのキーから決定的に選ぶ」だけにする
  const availableCharacterIds = useMemo(() => {
    const ids = Object.keys(charImageMap);
    if (fixedCharacterId && !ids.includes(fixedCharacterId)) {
      // fixedがmapに無いこともあるので、そこは許容
      return ids.length ? ids : fixedCharacterId ? [fixedCharacterId] : [];
    }
    return ids.length ? ids : fixedCharacterId ? [fixedCharacterId] : [];
  }, [charImageMap, fixedCharacterId]);

  const activeCharacterId = useMemo(() => {
    if (!characterEnabled) return "";
    if (characterMode === "fixed") return fixedCharacterId || "";
    const path =
      typeof window !== "undefined" ? window.location.pathname : "unknown";
    const picked =
      pickBySeed(availableCharacterIds, `${SESSION_SEED}:${path}`) || "";
    return picked;
  }, [
    characterEnabled,
    characterMode,
    fixedCharacterId,
    availableCharacterIds,
  ]);

  const characterSrc = useMemo(() => {
    if (!characterEnabled) return "";
    if (characterOverrideSrc) return characterOverrideSrc;
    const fromMap = charImageMap[activeCharacterId] ?? "";
    const normalized = normalizePublicPath(fromMap);
    return normalized || "";
  }, [characterEnabled, characterOverrideSrc, charImageMap, activeCharacterId]);

  // ===== レイアウト =====
  const HEADER_H = 56;

  const rootStyle: React.CSSProperties = {
    position: "relative",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    background: "#000",
  };

  const bgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: bgSrc ? `url("${bgSrc}")` : "none",
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: bgBlur ? `blur(${bgBlur}px)` : "none",
    transform: bgBlur ? "scale(1.05)" : "none", // ぼかし端の黒縁対策
    zIndex: 0,
  };

  const dimStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `rgba(0,0,0,${clamp(bgDim, 0, 1)})`,
    zIndex: 1,
  };

  const headerStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 10,
    height: HEADER_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    boxSizing: "border-box",
    pointerEvents: "none", // 子だけonにする
  };

  const backBtnStyle: React.CSSProperties = {
    pointerEvents: "auto",
    position: "absolute",
    right: 12,
    top: 10,
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const headerTitleWrap: React.CSSProperties = {
    pointerEvents: "auto",
    display: "grid",
    gap: 2,
    textAlign: "center",
    maxWidth: "min(920px, calc(100% - 120px))",
  };

  const bodyOuterStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 10,
    height: `calc(100vh - ${HEADER_H}px)`,
    overflowY: scrollY, // 基本 hidden
    overflowX: "hidden",
  };

  const bodyInnerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: "16px 14px 16px",
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0, // ← 子のスクロール箱を生かす超重要
    display: "flex",
    flexDirection: "column",
  };

  const glassVarsStyle: React.CSSProperties = {
    // glassAlpha / glassBlur をCSS変数で流す（既存の .glass クラスが拾う想定）
    // もしCSSが無ければ後でindex.cssに足す
    ["--glass-alpha" as any]: String(clamp(glassAlpha, 0, 0.6)),
    ["--glass-blur" as any]: `${clamp(glassBlur, 0, 32)}px`,
  };

  const characterStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    bottom: 0,
    zIndex: 9,
    pointerEvents: "none",
    transformOrigin: "bottom right",
    transform: `scale(${clamp(characterScale, 0.7, 5.0)})`,
    opacity: clamp(characterOpacity, 0, 1),
    filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.35))",
  };

  return (
    <div style={{ ...rootStyle, ...glassVarsStyle }}>
      <div style={bgStyle} />
      <div style={dimStyle} />

      {/* キャラ */}
      {characterEnabled && showTestCharacter && characterSrc ? (
        <img src={characterSrc} alt="" style={characterStyle} />
      ) : null}

      {/* ヘッダー */}
      <header style={headerStyle}>
        {showBack ? (
          <button type="button" style={backBtnStyle} onClick={onBack}>
            ← 戻る
          </button>
        ) : null}

        <div style={headerTitleWrap}>
          {title}
          {subtitle}
        </div>
      </header>

      {/* 本体（スクロールは基本禁止。必要なら各画面で“箱”を作る） */}
      <main style={bodyOuterStyle}>
        <div style={bodyInnerStyle}>{children}</div>
      </main>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
