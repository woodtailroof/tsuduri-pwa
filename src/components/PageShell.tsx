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

  /** スクロール制御（※PCは「本文領域」だけに適用して統一） */
  scrollY?: "auto" | "hidden";

  /**
   * ✅ 旧実装互換：PageShell内の「本文領域」の padding を上書き
   * 例: "0" / "12px 18px" / 0
   */
  contentPadding?: string | number;

  /**
   * ✅ 旧実装互換：設定画面などが渡しているフラグ（現行PageShellでは表示制御しない）
   * 受け口だけ用意してビルドを通す。
   */
  showTestCharacter?: boolean;
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

export default function PageShell(props: Props) {
  const {
    title,
    subtitle,
    children,
    maxWidth = 1100,
    showBack = true,
    onBack,
    titleLayout = "center",
    scrollY = "auto",
    contentPadding,
    // showTestCharacter は受け口のみ（このコンポーネント内では使わない）
  } = props;

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // ✅ PC固定ヘッダー仕様（タイトル左上、戻る右上を固定）
  const DESKTOP_HEADER_H = 72;

  const rootStyle = useMemo<StyleWithVars>(() => {
    return {
      width: "100%",
      minHeight: "100dvh",
      overflowX: "clip",
      // ここをスクロールコンテナにしない（sticky/fixedの挙動ブレを防ぐ）
      overflowY: "visible",
      display: "flex",
      flexDirection: "column",
      "--shell-header-h": `${DESKTOP_HEADER_H}px`,
    };
  }, []);

  // デフォルトの本文 padding（旧互換で contentPadding が来たら上書き）
  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  // ✅ 本文領域（PCはここだけスクロール制御して、全画面の統一感を担保）
  const contentOuterStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "clip",
    overflowY: isDesktop ? scrollY : "visible", // スマホは今の挙動を崩さない
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    minHeight: "100%",
  };

  // ✅ PC: ヘッダー分だけ本文を下げる（各画面で paddingTop 逃げをさせない）
  const desktopContentStyle: CSSProperties = isDesktop
    ? { paddingTop: "var(--shell-header-h)" }
    : {};

  const onClickBack = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
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

  // ✅ PCは「完全固定」ヘッダー（画面ごとの差分を出さない）
  const desktopHeaderStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    height: "var(--shell-header-h)",
    background: "rgba(0,0,0,0.22)",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const desktopHeaderInnerStyle: CSSProperties = {
    height: "100%",
    maxWidth,
    margin: "0 auto",
    padding: "10px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  };

  const titleSlotStyleDesktop: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flex: "1 1 auto",
  };

  const subtitleStyleDesktop: CSSProperties = {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.66)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "56vw",
  };

  const titleClampStyle: CSSProperties = {
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  // ✅ スマホは現状維持（不満なし前提）
  const mobileHeaderWrapStyle: CSSProperties = {
    display: "grid",
    gap: 6,
    marginBottom: 12,
  };

  const mobileTitleSlotStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: titleLayout === "left" ? "flex-start" : "center",
    gap: 10,
    minWidth: 0,
  };

  const mobileSubtitleStyle: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.62)",
    textAlign: titleLayout === "left" ? "left" : "center",
  };

  return (
    <div style={rootStyle}>
      {isDesktop ? (
        <div style={desktopHeaderStyle}>
          <div style={desktopHeaderInnerStyle}>
            <div style={titleSlotStyleDesktop}>
              {title ? <div style={titleClampStyle}>{title}</div> : null}
              {subtitle ? (
                <div style={subtitleStyleDesktop}>{subtitle}</div>
              ) : null}
            </div>

            {showBack ? (
              <button type="button" onClick={onClickBack} style={backBtnStyle}>
                ← 戻る
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      ) : (
        <div style={mobileHeaderWrapStyle}>
          <div style={mobileTitleSlotStyle}>
            {title ? <div style={titleClampStyle}>{title}</div> : null}
          </div>

          {subtitle ? <div style={mobileSubtitleStyle}>{subtitle}</div> : null}

          {showBack ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClickBack} style={backBtnStyle}>
                ← 戻る
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          <div style={desktopContentStyle}>{children}</div>
        </div>
      </div>
    </div>
  );
}
