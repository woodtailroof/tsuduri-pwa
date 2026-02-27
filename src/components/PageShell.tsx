// src/components/PageShell.tsx
import {
  useCallback,
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

  /** 旧互換：title の配置指示（今は left 前提。受け口だけ残す） */
  titleLayout?: "center" | "left";

  /** スクロール制御（本文領域のスクロール） */
  scrollY?: "auto" | "hidden";

  /**
   * ✅ PageShell内の「本文領域」の padding を上書き
   * 例: "0" / "12px 18px" / 0
   */
  contentPadding?: string | number;

  /** ✅ 旧コード互換：Settings 側が渡してても落ちないよう受け口だけ残す */
  showTestCharacter?: boolean;

  /**
   * ✅ 表示したいキャラID（Stageへ通知する）
   * 渡されない画面では "指定なし" となり、Stage設定（fixed/random）が効く
   */
  displayCharacterId?: string;

  /**
   * ✅ 互換受け口だけ残す（実際の表情反映は Stage が担当）
   */
  displayExpression?: string;
};

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

function stableString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export default function PageShell(props: Props) {
  const title = props.title;
  const subtitle = props.subtitle;
  const children = props.children;

  const maxWidth = props.maxWidth ?? 1100;
  const showBack = props.showBack ?? true;
  const onBack = props.onBack;
  const scrollY = props.scrollY ?? "auto";
  const contentPadding = props.contentPadding;

  const isMobile = useIsMobile();

  // ✅ ヘッダー高さは全端末で固定（位置ブレの根絶）
  const HEADER_H = 72;

  // ✅ Homeのように title/subtitle/back が全部無い画面はヘッダー自体を消す（= 上に詰める）
  const headerVisible = !!title || !!subtitle || showBack;
  const effectiveHeaderH = headerVisible ? HEADER_H : 0;

  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  const onClickBack = useCallback(() => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
  }, [onBack]);

  // ✅ 画面遷移ごとの“合図”キー（ランダム更新のトリガー用）
  const routeKey = useMemo(() => {
    const t = stableString(title);
    const s = stableString(subtitle);
    const w = String(maxWidth);
    const y = String(scrollY);
    // children は巨大になり得るので使わない
    return `${t}|${s}|${w}|${y}`;
  }, [title, subtitle, maxWidth, scrollY]);

  // ✅ Stageへ「表示キャラID」を通知（Chatなどが指定すると固定表示になる）
  useEffect(() => {
    if (typeof window === "undefined") return;

    const id = (props.displayCharacterId ?? "").trim();
    window.dispatchEvent(
      new CustomEvent("tsuduri-display-character", {
        detail: { id },
      }),
    );
  }, [props.displayCharacterId]);

  // ✅ 画面が変わった合図（常駐Stageに届く）
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("tsuduri-stage-route", {
        detail: { key: routeKey },
      }),
    );
  }, [routeKey]);

  // ✅ ヘッダー（classで疑似ブラー）
  const headerStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    height: `${effectiveHeaderH}px`,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 0,
    background: "rgba(0,0,0,var(--glass-alpha, 0.22))",
  };

  const headerInnerStyle: CSSProperties = {
    height: "100%",
    width: "100%",
    paddingTop: "max(10px, env(safe-area-inset-top))",
    paddingLeft: "max(14px, env(safe-area-inset-left))",
    paddingRight: "max(14px, env(safe-area-inset-right))",
    paddingBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    boxSizing: "border-box",
  };

  const titleSlotStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flex: "1 1 auto",
    alignItems: "flex-start",
    textAlign: "left",
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
    maxWidth: "70vw",
  };

  const backBtnStyle: CSSProperties = {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,var(--glass-alpha, 0.22))",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  };

  type CSSVars = Record<`--${string}`, string>;
  const shellStyle: CSSProperties & CSSVars = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    "--shell-header-h": `${effectiveHeaderH}px`,
  };

  const contentOuterStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "clip",
    overflowY: scrollY,
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    paddingTop: `${effectiveHeaderH}px`,
    position: "relative",
    zIndex: 20,
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    maxWidth,
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    boxSizing: "border-box",
  };

  return (
    <div className="page-shell" style={shellStyle}>
      {headerVisible ? (
        <div className="glass-header" style={headerStyle}>
          <div style={headerInnerStyle}>
            <div style={titleSlotStyle}>
              {title ? <div style={titleClampStyle}>{title}</div> : null}
              {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
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
      ) : null}

      <div style={contentOuterStyle}>
        <div style={frameStyle}>
          <div
            className="page-shell-inner"
            style={{ position: "relative", height: "100%", minHeight: 0 }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
