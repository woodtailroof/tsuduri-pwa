// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  resolveAutoBackgroundSrc,
  useAppSettings,
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
   * ✅ PageShell の本文スクロール制御
   * - "auto": 本文が必要に応じてスクロール（基本これ）
   * - "hidden": 本文をスクロールさせない（画面側で独自スクロールする時だけ）
   */
  scrollY?: "auto" | "hidden";

  /**
   * ✅ 右側に立ち絵を出すか（Settings での大型プレビュー等）
   * 既存コード互換のため残してる
   */
  showTestCharacter?: boolean;

  /**
   * ✅ ヘッダー右側に追加の操作を置きたい時（将来用）
   * 例：Chat の「全員集合ON/OFF」などを“ヘッダーの中”に収められる
   */
  headerRight?: ReactNode;
};

const HEADER_H = 56; // ヘッダー高さ（固定）

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 960,
  showBack = true,
  onBack,
  scrollY = "auto",
  showTestCharacter = false,
  headerRight,
}: Props) {
  const { settings } = useAppSettings();

  // ===== 背景（ここは PageShell が責任を持つ） =====
  const bgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;

  // 1分ごとに “自動背景” を更新したい時だけ tick
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    if (bgMode !== "auto") return;
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
  }, [bgMode]);

  const nowBand = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 9) return "morning";
    if (h >= 9 && h < 16) return "day";
    if (h >= 16 && h < 19) return "evening";
    return "night";
  }, [minuteTick]);

  const bgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return settings.fixedBgSrc || "";
    return resolveAutoBackgroundSrc(autoBgSet, nowBand as any);
  }, [bgMode, settings.fixedBgSrc, autoBgSet, nowBand]);

  const bgDim = Number.isFinite(settings.bgDim)
    ? settings.bgDim
    : DEFAULT_SETTINGS.bgDim;
  const bgBlur = Number.isFinite(settings.bgBlur)
    ? settings.bgBlur
    : DEFAULT_SETTINGS.bgBlur;

  // ===== レイアウト =====
  // ✅ ここが超重要：全画面の“スクロールの責任”を PageShell が握る
  // これで Settings がスクロールしない/Chat が見切れる問題が消えやすい
  const shellStyle: React.CSSProperties = {
    position: "relative",
    minHeight: "100vh",
    width: "100%",
    overflow: "hidden", // 背景用。スクロールは inner に持たせる
  };

  const bgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: bgSrc ? `url(${bgSrc})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: bgBlur ? `blur(${bgBlur}px)` : undefined,
    transform: bgBlur ? "scale(1.02)" : undefined, // blur の端を隠す
  };

  const dimStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `rgba(0,0,0,${bgDim})`,
  };

  // ヘッダーは常に上。戻るは右上固定。
  const headerStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 50,
    height: HEADER_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.18)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
  };

  const headerLeftStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  };

  const titleWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: 2,
    minWidth: 0,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const backBtnStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "rgba(255,255,255,0.85)",
    padding: "8px 12px",
    borderRadius: 999,
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  // 本文：ここがスクロールの本体
  const bodyOuterStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 10,
    height: `calc(100vh - ${HEADER_H}px)`,
    overflowY: scrollY === "auto" ? "auto" : "hidden",
    overflowX: "hidden",
  };

  const bodyInnerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: "16px 14px 28px",
    boxSizing: "border-box",
  };

  // 右側立ち絵の領域（既存互換：showTestCharacter）
  // ※ここは “見た目だけ” で、スクロールを邪魔しないように pointerEvents: none
  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;
  const charSrc = settings.characterOverrideSrc || "/assets/ch/vt1.png";

  const charStyle: React.CSSProperties = {
    position: "fixed",
    right: 8,
    bottom: -6,
    zIndex: 20,
    pointerEvents: "none",
    opacity: characterOpacity,
    transform: `scale(${characterScale})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.35))",
  };

  const showChar =
    (settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled) &&
    showTestCharacter;

  return (
    <div style={shellStyle}>
      {/* 背景 */}
      <div style={bgStyle} />
      <div style={dimStyle} />

      {/* ヘッダー（右上戻る固定） */}
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <div style={titleWrapStyle}>
            <div style={{ minWidth: 0 }}>{title}</div>
            {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {headerRight}
          {showBack ? (
            <button type="button" style={backBtnStyle} onClick={onBack}>
              ← 戻る
            </button>
          ) : null}
        </div>
      </div>

      {/* 本文（ここがスクロール担当） */}
      <div style={bodyOuterStyle}>
        <div style={bodyInnerStyle}>{children}</div>
      </div>

      {/* 立ち絵 */}
      {showChar ? (
        <img
          src={charSrc}
          alt=""
          style={charStyle}
          onError={(e) => {
            // 画像が無い時に透明で邪魔しない
            (e.currentTarget as HTMLImageElement).style.opacity = "0";
          }}
        />
      ) : null}
    </div>
  );
}
