// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

  /** ✅ タイトルの寄せ（デフォ: center） */
  titleLayout?: TitleLayout;

  /** ✅ コンテンツ領域の縦スクロール制御（デフォ: auto） */
  scrollY?: "auto" | "hidden";

  /** ✅ コンテンツのパディング（デフォ: 14） */
  contentPadding?: number | string;

  /** ✅ 設定画面などでテスト表示したい時用（PageShell 側が対応していれば使う） */
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

  // 背景画像（PageShell 側が既に別実装なら、ここは軽く動く安全版）
  const bgMode = (settings.bgMode ?? "auto") as "auto" | "fixed" | "off";
  const autoBgSet = (settings.autoBgSet ?? "surf").trim() || "surf";
  const fixedBgSrcRaw = settings.fixedBgSrc ?? "";
  const fixedBgSrc = normalizePublicPath(fixedBgSrcRaw);

  function getTimeBand(d: Date): "morning" | "day" | "evening" | "night" {
    const h = d.getHours();
    if (h >= 5 && h <= 9) return "morning";
    if (h >= 10 && h <= 15) return "day";
    if (h >= 16 && h <= 18) return "evening";
    return "night";
  }

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

    // auto
    const band = getTimeBand(new Date());
    return `/assets/bg/${autoBgSet}_${band}.png`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgMode, fixedBgSrc, autoBgSet, minuteTick]);

  const containerStyle = useMemo(() => {
    const dim = clamp(bgDim, 0, 1);
    const blur = clamp(bgBlur, 0, 40);

    return {
      minHeight: "100svh",
      width: "100%",
      display: "flex",
      justifyContent: "center",
      padding:
        "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
      boxSizing: "border-box" as const,
      position: "relative" as const,
      overflow: "hidden",
      backgroundColor: "#0b0f18",
    };
  }, [bgDim, bgBlur]);

  const innerStyle = useMemo(() => {
    return {
      width: "100%",
      maxWidth,
      display: "flex",
      flexDirection: "column" as const,
      gap: 12,
      padding: 0,
      boxSizing: "border-box" as const,
      position: "relative" as const,
      zIndex: 2,
    };
  }, [maxWidth]);

  const headerStyle = useMemo(() => {
    const align = titleLayout === "left" ? "flex-start" : "center";
    return {
      display: "flex",
      alignItems: align,
      justifyContent: "space-between",
      gap: 12,
      minWidth: 0,
    };
  }, [titleLayout]);

  const titleWrapStyle = useMemo(() => {
    const align = titleLayout === "left" ? "flex-start" : "center";
    const textAlign = titleLayout === "left" ? "left" : "center";
    return {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: align,
      justifyContent: "center",
      gap: 6,
      minWidth: 0,
      width: "100%",
      textAlign: textAlign as const,
    };
  }, [titleLayout]);

  const contentStyle = useMemo(() => {
    return {
      flex: 1,
      minHeight: 0,
      overflowY: scrollY,
      overflowX: "hidden" as const,
      padding: contentPadding,
      boxSizing: "border-box" as const,
    };
  }, [scrollY, contentPadding]);

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

            {/* 右側のスペーサ */}
            <div
              style={{ width: 78, display: "flex", justifyContent: "flex-end" }}
            >
              {showTestCharacter ? (
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.55)",
                    userSelect: "none",
                  }}
                  title="showTestCharacter（PageShellの互換用）"
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
