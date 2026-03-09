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
  maxWidth?: number;
  showBack?: boolean;
  onBack?: () => void;
  titleLayout?: "center" | "left";
  scrollY?: "auto" | "hidden";
  contentPadding?: string | number;
  showTestCharacter?: boolean;
  displayCharacterId?: string;
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

type CSSVars = Record<`--${string}`, string>;

export default function PageShell(props: Props) {
  console.log("PageShell render");

  const title = props.title;
  const subtitle = props.subtitle;
  const children = props.children;

  const maxWidth = props.maxWidth ?? 1100;
  const showBack = props.showBack ?? true;
  const onBack = props.onBack;
  const scrollY = props.scrollY ?? "auto";
  const contentPadding = props.contentPadding;

  const isMobile = useIsMobile();

  const HEADER_H = 72;

  const headerVisible = !!title || !!subtitle || showBack;
  const effectiveHeaderH = headerVisible ? HEADER_H : 0;

  const defaultFramePadding = isMobile ? "14px 14px 18px" : "18px 18px 20px";
  const resolvedFramePadding =
    contentPadding !== undefined ? contentPadding : defaultFramePadding;

  const onClickBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined") window.history.back();
  }, [onBack]);

  const routeKey = useMemo(() => {
    const t = stableString(title);
    const s = stableString(subtitle);
    const w = String(maxWidth);
    const y = String(scrollY);
    return `${t}|${s}|${w}|${y}`;
  }, [title, subtitle, maxWidth, scrollY]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const id = (props.displayCharacterId ?? "").trim();

    window.dispatchEvent(
      new CustomEvent("tsuduri-display-character", {
        detail: { id },
      }),
    );
  }, [props.displayCharacterId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("tsuduri-stage-route", {
        detail: { key: routeKey },
      }),
    );
  }, [routeKey]);

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

  const headerOuterStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    height: `${effectiveHeaderH}px`,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 0,
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

  const titleWrapStyle: CSSProperties = {
    minWidth: 0,
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

  const subtitleStyle: CSSProperties = {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.66)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const backWrapStyle: CSSProperties = {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div className="page-shell" style={shellStyle}>
      {headerVisible ? (
        <div className="glass-header" style={headerOuterStyle}>
          <div style={headerInnerStyle}>
            <div style={titleWrapStyle}>
              {title}
              {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
            </div>

            {showBack ? (
              <div style={backWrapStyle}>
                <button type="button" onClick={onClickBack}>
                  ← 戻る
                </button>
              </div>
            ) : (
              <span />
            )}
          </div>
        </div>
      ) : null}

      <div style={contentOuterStyle}>
        <div style={frameStyle}>{children}</div>
      </div>
    </div>
  );
}
