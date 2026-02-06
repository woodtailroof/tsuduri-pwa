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

  /** 画面ごとに幅を変えたい時用（本文だけに適用） */
  maxWidth?: number;

  /** 戻るボタンを表示するか（デフォルト: true） */
  showBack?: boolean;

  /** 戻るボタン押下時の挙動を上書きしたい場合 */
  onBack?: () => void;

  /**
   * 旧互換：title の配置指示
   * ✅ ただし「固定ヘッダーのタイトル位置」は常に左端固定（視点ブレ対策）
   */
  titleLayout?: "center" | "left";

  /** スクロール制御（本文領域に適用） */
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

  /**
   * ✅ 重要：ヘッダーは全画面で “同じ位置” を保証するため、maxWidth に追従させない
   * - ここを props.maxWidth にすると、画面ごとにヘッダー内側の幅が変わってズレる
   */
  const HEADER_MAX_W = 1100;

  /**
   * ✅ 左右パディングも固定（画面ごとに contentPadding が違ってもヘッダーは動かない）
   */
  const HEADER_SIDE_PAD = "clamp(12px, 3vw, 18px)";

  const HEADER_H = isMobile ? 64 : 72;

  const rootStyle = useMemo<StyleWithVars>(() => {
    return {
      width: "100%",
      minHeight: "100dvh",
      overflowX: "clip",
      overflowY: "visible",
      display: "flex",
      flexDirection: "column",
      "--shell-header-h": `${HEADER_H}px`,
    };
  }, [HEADER_H]);

  // デフォルトの本文 padding（旧互換で contentPadding が来たら上書き）
  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  // ✅ 本文領域（ここだけスクロール制御）
  const contentOuterStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "clip",
    overflowY: scrollY,
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    maxWidth,
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    minHeight: "100%",
  };

  // ✅ ヘッダー分だけ本文を下げる（全端末で統一）
  const contentTopPadStyle: CSSProperties = {
    paddingTop: "var(--shell-header-h)",
  };

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

  // ✅ どの画面でも固定位置になるヘッダー
  const headerStyle: CSSProperties = {
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

  // ✅ ヘッダー“内側”の幅は常に一定（本文 maxWidth と切り離す）
  const headerInnerStyle: CSSProperties = {
    height: "100%",
    width: "100%",
    maxWidth: HEADER_MAX_W,
    margin: "0 auto",
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: HEADER_SIDE_PAD,
    paddingRight: HEADER_SIDE_PAD,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    boxSizing: "border-box",
  };

  /**
   * ✅ ここが今回の本丸：
   * - ヘッダーのタイトルは常に「左端固定」
   * - titleLayout はヘッダーでは使わない（視点ブレ対策）
   */
  const titleSlotStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flex: "1 1 auto",
    textAlign: "left",
    alignItems: "flex-start",
  };

  const titleClampStyle: CSSProperties = {
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const subtitleStyle: CSSProperties = {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.66)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "56vw",
    textAlign: "left",
  };

  // ✅ 右側の「戻る」が無いときも位置を固定するためのスペーサ
  const rightSlotStyle: CSSProperties = {
    flex: "0 0 auto",
    minWidth: 88, // 戻るボタン相当の幅を確保して“右端位置”を固定
    display: "flex",
    justifyContent: "flex-end",
  };

  /**
   * （任意）本文内のタイトル寄せは今まで通り使えるように残しておく
   * ただしヘッダーは常に左固定なので、ここはUI上ほぼ影響しない
   */
  void titleLayout;

  return (
    <div style={rootStyle}>
      {/* ✅ 常に固定ヘッダー（タイトルも戻るも絶対に同じ場所） */}
      <div style={headerStyle}>
        <div style={headerInnerStyle}>
          <div style={titleSlotStyle}>
            {title ? <div style={titleClampStyle}>{title}</div> : null}
            {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
          </div>

          <div style={rightSlotStyle}>
            {showBack ? (
              <button type="button" onClick={onClickBack} style={backBtnStyle}>
                ← 戻る
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>

      {/* ✅ 本文（ここだけ画面ごとに maxWidth が変わる） */}
      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          <div style={contentTopPadStyle}>{children}</div>
        </div>
      </div>
    </div>
  );
}
