// src/components/PageShell.tsx
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

  /** 旧互換：title の配置指示（ただしPCは固定ヘッダーで強制的に左上） */
  titleLayout?: "center" | "left";

  /** スクロール制御 */
  scrollY?: "auto" | "hidden";
};

// CSS変数（--xxx）を style に安全に入れるための型
type CSSVars = Record<`--${string}`, string>;
type StyleWithVars = CSSProperties & CSSVars;

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

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 1100,
  showBack = true,
  onBack,
  titleLayout = "center",
  scrollY = "auto",
}: Props) {
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // ✅ PC固定ヘッダー仕様
  const DESKTOP_HEADER_H = 72;

  const rootStyle = useMemo<StyleWithVars>(() => {
    return {
      width: "100%",
      minHeight: "100dvh",
      overflowX: "clip",
      overflowY: scrollY,
      "--shell-header-h": `${DESKTOP_HEADER_H}px`,
    };
  }, [scrollY]);

  const frameStyle: CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: isMobile ? "14px 14px 18px" : "18px 18px 20px",
    position: "relative",
    minHeight: "100%",
  };

  // ✅ PC: ヘッダー分だけ本文を下げる（各画面で paddingTop 逃げをさせない）
  const desktopContentStyle: CSSProperties = isDesktop
    ? { paddingTop: "var(--shell-header-h)" }
    : {};

  const headerWrapStyle: CSSProperties = isDesktop
    ? {
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "var(--shell-header-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 18px",
        margin: "0 auto",
        maxWidth,
        background: "rgba(0,0,0,0.22)",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }
    : {
        display: "grid",
        gap: 6,
        marginBottom: 12,
      };

  const titleSlotStyle: CSSProperties = isDesktop
    ? {
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
        flex: "1 1 auto",
      }
    : {
        display: "flex",
        alignItems: "center",
        justifyContent: titleLayout === "left" ? "flex-start" : "center",
        gap: 10,
        minWidth: 0,
      };

  const subtitleStyle: CSSProperties = isDesktop
    ? {
        marginTop: 2,
        fontSize: 12,
        color: "rgba(255,255,255,0.66)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "56vw",
      }
    : {
        fontSize: 12,
        color: "rgba(255,255,255,0.62)",
        textAlign: titleLayout === "left" ? "left" : "center",
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
  };

  const onClickBack = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
  };

  const titleNode = title ? (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
      {isDesktop && subtitle ? (
        <div style={subtitleStyle}>{subtitle}</div>
      ) : null}
    </div>
  ) : null;

  return (
    <div style={rootStyle}>
      <div style={headerWrapStyle}>
        {isDesktop ? (
          <>
            <div style={titleSlotStyle}>{titleNode}</div>
            {showBack ? (
              <button type="button" onClick={onClickBack} style={backBtnStyle}>
                ← 戻る
              </button>
            ) : (
              <span />
            )}
          </>
        ) : (
          <>
            <div style={titleSlotStyle}>{titleNode}</div>
            {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
            {showBack ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClickBack}
                  style={backBtnStyle}
                >
                  ← 戻る
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div style={frameStyle}>
        <div style={desktopContentStyle}>{children}</div>
      </div>
    </div>
  );
}
