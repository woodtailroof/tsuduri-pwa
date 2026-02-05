// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  getTimeBand,
  type BgMode,
  type BgTimeBand,
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
   * PageShell の「中身領域」のスクロール挙動
   * - auto: 中身全体をスクロール（設定画面など）
   * - hidden: 中身をスクロールさせない（Chatのように内部だけスクロールさせたいとき）
   */
  scrollY?: "auto" | "hidden";

  /** ✅ タイトルの配置（既存画面が使っているので正式サポート） */
  titleLayout?: "left" | "center";

  /** ✅ 中身のpadding（既存画面が使っているので正式サポート） */
  contentPadding?: string;

  /** 設定画面などで「右側にテストキャラ」を出したい場合（未使用でもOK） */
  showTestCharacter?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** ✅ 1分ごとにUIを更新（自動背景の時間帯追従用） */
function useMinuteTick() {
  const [tick, setTick] = useState(1);

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

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 980,
  showBack = true,
  onBack,
  scrollY = "auto",
  titleLayout = "center",
  contentPadding = "clamp(12px, 2.4vw, 18px)",
}: Props) {
  const { settings } = useAppSettings();
  const minuteTick = useMinuteTick();

  // ===== 背景 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;

  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw) || "/assets/bg/ui-check.png";

  const nowBand: BgTimeBand = useMemo(
    () => getTimeBand(new Date()),
    [minuteTick],
  );
  const autoSrc = useMemo(
    () => resolveAutoBackgroundSrc(autoBgSet, nowBand),
    [autoBgSet, nowBand],
  );

  const bgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return autoSrc;
  }, [bgMode, fixedBgSrc, autoSrc]);

  // ===== 見た目 =====
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

  // PageShell の「中身領域」を安定させるための最重要ポイント
  // ✅ outer: 100svh + overflow hidden（画面全体のスクロール禁止）
  // ✅ inner: flex:1 + minHeight:0 + overflowY 制御（ここがないと “スクロールできない” が起きる）
  const contentOverflow = scrollY === "auto" ? "auto" : "hidden";

  // glass設定をCSS変数で反映（.glass クラスが var を参照する前提）
  const rootVars: React.CSSProperties = {
    ["--ts-glass-alpha" as any]: String(clamp(glassAlpha, 0, 0.9)),
    ["--ts-glass-blur" as any]: `${clamp(glassBlur, 0, 40)}px`,
  };

  return (
    <div
      style={{
        ...rootVars,
        position: "relative",
        height: "100svh",
        width: "100%",
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* 背景 */}
      {bgSrc && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transform: "translateZ(0)",
            filter: bgBlur ? `blur(${bgBlur}px)` : undefined,
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
        }}
      />

      {/* 前景 */}
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            flex: "0 0 auto",
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              maxWidth,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: showBack ? "auto 1fr auto" : "1fr auto",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            {showBack ? (
              <button
                type="button"
                className="glass"
                onClick={() => (onBack ? onBack() : history.back())}
                style={{
                  borderRadius: 999,
                  padding: "8px 12px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.9)",
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                ← 戻る
              </button>
            ) : null}

            <div
              style={{
                minWidth: 0,
                textAlign: titleLayout === "left" ? "left" : "center",
              }}
            >
              {title ? <div style={{ minWidth: 0 }}>{title}</div> : null}
              {subtitle ? <div style={{ minWidth: 0 }}>{subtitle}</div> : null}
            </div>

            {/* 右上の“予約席” いまは空（将来アイコン置き場にできる） */}
            <div style={{ minWidth: 0 }} />
          </div>
        </div>

        {/* 中身（ここがスクロールの要） */}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: contentOverflow as any,
            overflowX: "hidden",
          }}
        >
          <div
            style={{
              maxWidth,
              margin: "0 auto",
              padding: contentPadding,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
