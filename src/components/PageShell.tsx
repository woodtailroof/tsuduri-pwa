// src/components/PageShell.tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  desktopContentLayout?: "default" | "wide-left" | "home-centered";
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
  const title = props.title;
  const subtitle = props.subtitle;
  const children = props.children;

  const maxWidth = props.maxWidth ?? 1100;
  const showBack = props.showBack ?? true;
  const onBack = props.onBack;
  const scrollY = props.scrollY ?? "auto";
  const contentPadding = props.contentPadding;
  const titleLayout = props.titleLayout ?? "center";
  const desktopContentLayout = props.desktopContentLayout ?? "default";

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
    const tl = String(titleLayout);
    const sb = String(showBack);
    return `${t}|${s}|${w}|${y}|${tl}|${sb}|${desktopContentLayout}`;
  }, [
    title,
    subtitle,
    maxWidth,
    scrollY,
    titleLayout,
    showBack,
    desktopContentLayout,
  ]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const id = (props.displayCharacterId ?? "").trim();

    window.dispatchEvent(
      new CustomEvent("tsuduri-display-character", {
        detail: { id },
      }),
    );
  }, [props.displayCharacterId]);

  useLayoutEffect(() => {
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
    boxSizing: "border-box",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    paddingTop: `${effectiveHeaderH}px`,
    position: "relative",
    zIndex: 20,
  };

  const frameStyle: CSSProperties & CSSVars = {
    width: "100%",
    height: scrollY === "hidden" ? "100%" : undefined,
    minHeight: scrollY === "hidden" ? 0 : "100%",
    margin: "0 auto",
    padding: resolvedFramePadding,
    position: "relative",
    boxSizing: "border-box",
    "--page-content-max": `${maxWidth}px`,
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

  const headerInnerStyle: CSSProperties & CSSVars = {
    height: "100%",
    width: "100%",
    paddingTop: "max(10px, env(safe-area-inset-top))",
    paddingLeft: "max(14px, env(safe-area-inset-left))",
    paddingRight: "max(14px, env(safe-area-inset-right))",
    paddingBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: titleLayout === "center" ? "center" : "space-between",
    gap: 12,
    minWidth: 0,
    boxSizing: "border-box",
    position: "relative",
    "--page-content-max": `${maxWidth}px`,
  };

  const titleWrapStyle: CSSProperties = {
    minWidth: 0,
    flex: titleLayout === "center" ? "0 1 auto" : "1 1 auto",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: titleLayout === "center" ? "center" : "flex-start",
    textAlign: titleLayout === "center" ? "center" : "left",
  };

  const subtitleStyle: CSSProperties = {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.66)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
    textAlign: titleLayout === "center" ? "center" : "left",
  };

  const backWrapStyle: CSSProperties = {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    position: "fixed",
    right: "max(14px, env(safe-area-inset-right))",
    top: `${effectiveHeaderH / 2}px`,
    transform: "translateY(-50%)",
    zIndex: 1,
  };

  return (
    <div
      className={`page-shell${
        desktopContentLayout === "wide-left" ? " page-shell--wide-left" : ""
      }${
        desktopContentLayout === "home-centered"
          ? " page-shell--home-centered"
          : ""
      }`}
      style={shellStyle}
    >
      <style>{`
        .page-shell {
          --page-character-reserve: clamp(500px, 31vw, 620px);
          --page-desktop-gutter: clamp(14px, 1.6vw, 30px);
        }

        .page-shell-header-inner,
        .page-shell-frame {
          max-width: var(--page-content-max);
          margin-left: auto;
          margin-right: auto;
        }

        .page-shell-title h1 {
          font-size: clamp(22px, 2vw, 32px) !important;
          line-height: 1.15 !important;
        }

        @media (min-width: 1180px) {
          .page-shell-header-inner,
          .page-shell-frame {
            width: min(
              var(--page-content-max),
              calc(100vw - var(--page-character-reserve))
            ) !important;
            max-width: none;
            margin-left: var(--page-desktop-gutter) !important;
            margin-right: auto !important;
          }

          .page-shell--wide-left {
            --page-character-reserve: clamp(500px, 31vw, 620px);
          }

          .page-shell--home-centered .page-shell-header-inner,
          .page-shell--home-centered .page-shell-frame {
            width: 100% !important;
            max-width: var(--page-content-max);
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }

        @media (min-width: 1180px) and (max-width: 1499px) {
          .page-shell {
            --page-character-reserve: clamp(400px, 29vw, 470px);
          }
        }

        @media (max-width: 820px) {
          .page-shell-title h1 {
            font-size: clamp(20px, 6vw, 28px) !important;
          }
        }
      `}</style>
      {headerVisible ? (
        <div className="glass-header" style={headerOuterStyle}>
          <div className="page-shell-header-inner" style={headerInnerStyle}>
            <div className="page-shell-title" style={titleWrapStyle}>
              {title}
              {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
            </div>

            {showBack ? (
              <div style={backWrapStyle}>
                <button type="button" onClick={onClickBack}>
                  ← 戻る
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={contentOuterStyle}>
        <div className="page-shell-frame" style={frameStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
