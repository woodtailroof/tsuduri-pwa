// src/screens/Home.tsx
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import PageShell from "../components/PageShell";
import SecretPortalHotspot from "../components/SecretPortalHotspot";
import { useAppSettings } from "../lib/appSettings";

type Props = {
  go: (
    screen:
      | "record"
      | "recordHistory"
      | "recordAnalysis"
      | "weather"
      | "chat"
      | "settings",
  ) => void;

  /** 秘密入口（あれば使う） */
  goSecret?: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function appendAssetVersion(url: string, assetVersion: string) {
  const u = (url ?? "").trim();
  const av = (assetVersion ?? "").trim();
  if (!u || !av) return u;
  const encoded = encodeURIComponent(av);
  return u.includes("?") ? `${u}&av=${encoded}` : `${u}?av=${encoded}`;
}

type TimeTone = "morning" | "day" | "evening" | "night";

function getTimeTone(now = new Date()): TimeTone {
  const h = now.getHours();
  if (h >= 5 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

type TonePalette = {
  shellTop: string;
  shellBottom: string;
  border: string;
  textSub: string;
  chevron: string;
  iconTop: string;
  iconBottom: string;
  iconBorder: string;
  glow: string;
  sheen: string;
};

function getTonePalette(tone: TimeTone): TonePalette {
  switch (tone) {
    case "morning":
      return {
        shellTop: "rgba(255,255,255,0.22)",
        shellBottom: "rgba(180,220,255,0.10)",
        border: "rgba(255,255,255,0.32)",
        textSub: "rgba(255,255,255,0.82)",
        chevron: "rgba(255,255,255,0.82)",
        iconTop: "rgba(210,235,255,0.44)",
        iconBottom: "rgba(130,190,255,0.18)",
        iconBorder: "rgba(255,255,255,0.42)",
        glow: "rgba(170,215,255,0.22)",
        sheen: "rgba(255,255,255,0.28)",
      };

    case "day":
      return {
        shellTop: "rgba(255,255,255,0.18)",
        shellBottom: "rgba(155,210,255,0.08)",
        border: "rgba(255,255,255,0.28)",
        textSub: "rgba(255,255,255,0.76)",
        chevron: "rgba(255,255,255,0.78)",
        iconTop: "rgba(190,228,255,0.36)",
        iconBottom: "rgba(118,184,255,0.14)",
        iconBorder: "rgba(255,255,255,0.38)",
        glow: "rgba(145,205,255,0.18)",
        sheen: "rgba(255,255,255,0.24)",
      };

    case "evening":
      return {
        shellTop: "rgba(255,240,245,0.20)",
        shellBottom: "rgba(255,186,214,0.08)",
        border: "rgba(255,255,255,0.30)",
        textSub: "rgba(255,245,248,0.78)",
        chevron: "rgba(255,240,245,0.82)",
        iconTop: "rgba(255,215,232,0.38)",
        iconBottom: "rgba(255,162,196,0.14)",
        iconBorder: "rgba(255,240,245,0.40)",
        glow: "rgba(255,182,216,0.18)",
        sheen: "rgba(255,255,255,0.24)",
      };

    case "night":
    default:
      return {
        shellTop: "rgba(220,235,255,0.16)",
        shellBottom: "rgba(115,155,255,0.07)",
        border: "rgba(220,235,255,0.24)",
        textSub: "rgba(226,236,255,0.76)",
        chevron: "rgba(230,238,255,0.78)",
        iconTop: "rgba(170,205,255,0.28)",
        iconBottom: "rgba(110,138,255,0.14)",
        iconBorder: "rgba(225,236,255,0.34)",
        glow: "rgba(120,155,255,0.18)",
        sheen: "rgba(255,255,255,0.16)",
      };
  }
}

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
};

type SmartBtnProps = {
  src: string;
  alt: string;
  onClick: () => void;
  style?: CSSProperties;
  fallbackLabel: string;
  fallbackSub?: string;
  fallbackIcon?: string;
  disabled?: boolean;
};

function SmartButton({
  src,
  alt,
  onClick,
  style,
  fallbackLabel,
  fallbackSub,
  fallbackIcon,
  disabled,
}: SmartBtnProps) {
  const [failed, setFailed] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const rippleIdRef = useRef(1);

  const tone = useMemo(() => getTimeTone(), []);
  const palette = useMemo(() => getTonePalette(tone), [tone]);

  const btnBase: CSSProperties = {
    appearance: "none",
    border: 0,
    padding: 0,
    margin: 0,
    display: "inline-block",
    cursor: disabled ? "not-allowed" : "pointer",
    background: "transparent",
    lineHeight: 0,
    WebkitTapHighlightColor: "transparent",
    opacity: disabled ? 0.55 : 1,
    width: "100%",
    position: "relative",
    transform: pressed ? "scale(0.972)" : "scale(1)",
    filter: pressed ? "brightness(1.03)" : "brightness(1)",
    transition: "transform 110ms ease, filter 150ms ease, opacity 120ms ease",
  };

  const frameStyle: CSSProperties = {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  };

  const imageWrapStyle: CSSProperties = {
    width: "100%",
    padding: 6,
    boxSizing: "border-box",
  };

  const imageStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "auto",
    borderRadius: 14,
  };

  const fallbackStyle: CSSProperties = {
    width: "100%",
    minHeight: 82,
    borderRadius: 20,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    lineHeight: 1.2,
    userSelect: "none",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    isolation: "isolate",
    background: `linear-gradient(180deg, ${palette.shellTop}, ${palette.shellBottom})`,
    backdropFilter: "blur(16px) saturate(125%)",
    WebkitBackdropFilter: "blur(16px) saturate(125%)",
    border: `1px solid ${palette.border}`,
    boxShadow: `
      0 10px 24px rgba(0,0,0,0.14),
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 1px 0 rgba(255,255,255,0.18) inset
    `,
  };

  const shimmerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: 20,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: 0,
  };

  const shimmerMainStyle: CSSProperties = {
    position: "absolute",
    top: "-35%",
    left: "-18%",
    width: "78%",
    height: "130%",
    borderRadius: "50%",
    background: `radial-gradient(circle at 50% 50%, ${palette.sheen} 0%, rgba(255,255,255,0.10) 34%, rgba(255,255,255,0) 72%)`,
    filter: "blur(10px)",
    opacity: 0.9,
    animation: "homeWaterFloat 7.6s ease-in-out infinite",
  };

  const shimmerAccentStyle: CSSProperties = {
    position: "absolute",
    right: "-8%",
    top: "8%",
    width: "34%",
    height: "84%",
    borderRadius: "999px",
    background: `linear-gradient(180deg, ${palette.glow}, rgba(255,255,255,0))`,
    filter: "blur(12px)",
    opacity: 0.7,
    animation: "homeWaterFloat2 9.5s ease-in-out infinite",
  };

  const sheenLineStyle: CSSProperties = {
    position: "absolute",
    inset: "1px 1px auto 1px",
    height: "42%",
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04), rgba(255,255,255,0))",
    pointerEvents: "none",
    zIndex: 1,
  };

  const left: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    position: "relative",
    zIndex: 2,
  };

  const iconWrapStyle: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 999,
    position: "relative",
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    background: `linear-gradient(180deg, ${palette.iconTop}, ${palette.iconBottom})`,
    backdropFilter: "blur(12px) saturate(135%)",
    WebkitBackdropFilter: "blur(12px) saturate(135%)",
    border: `1px solid ${palette.iconBorder}`,
    boxShadow: `
      inset 0 2px 7px rgba(255,255,255,0.34),
      inset 0 -4px 8px rgba(255,255,255,0.04),
      0 4px 10px rgba(0,0,0,0.14)
    `,
  };

  const iconBubbleStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: 999,
    overflow: "hidden",
    pointerEvents: "none",
  };

  const iconBubble1Style: CSSProperties = {
    position: "absolute",
    width: 20,
    height: 20,
    left: 4,
    top: 3,
    borderRadius: 999,
    background:
      "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.55), rgba(255,255,255,0.10) 52%, rgba(255,255,255,0) 72%)",
    filter: "blur(1px)",
    opacity: 0.95,
    animation: "homeBubbleDrift 4.4s ease-in-out infinite",
  };

  const iconBubble2Style: CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    right: 7,
    bottom: 7,
    borderRadius: 999,
    background:
      "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.42), rgba(255,255,255,0.06) 58%, rgba(255,255,255,0) 76%)",
    filter: "blur(0.5px)",
    opacity: 0.8,
    animation: "homeBubbleDrift2 5.2s ease-in-out infinite",
  };

  const iconGlyphStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    fontSize: 18,
    lineHeight: 1,
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.16))",
  };

  const textWrap: CSSProperties = {
    display: "grid",
    gap: 4,
    minWidth: 0,
    padding: "2px 6px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.08)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  };

  const labelStyle: CSSProperties = {
    fontWeight: 900,
    letterSpacing: "0.02em",
    fontSize: 16,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.15,
    color: "rgba(250,253,255,0.95)",
    textShadow: `
      0 1px 2px rgba(0,0,0,0.35),
      0 0 6px rgba(0,0,0,0.25)
    `,
  };

  const subStyle: CSSProperties = {
    fontSize: 12,
    color: "rgba(240,248,255,0.82)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.1,
    textShadow: "0 1px 2px rgba(0,0,0,0.28)",
  };

  const chevron: CSSProperties = {
    flex: "0 0 auto",
    fontSize: 16,
    color: palette.chevron,
    paddingLeft: 8,
    position: "relative",
    zIndex: 2,
    textShadow: "0 1px 2px rgba(0,0,0,0.16)",
    transform: pressed ? "translateX(1px)" : "translateX(0)",
    transition: "transform 120ms ease",
  };

  const spawnRipple = (
    clientX: number,
    clientY: number,
    host?: HTMLElement | null,
  ) => {
    const target = host ?? btnRef.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 1.35;
    const id = rippleIdRef.current++;

    setRipples((prev) => [...prev, { id, x, y, size }]);

    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 760);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    setPressed(true);
    if (failed) {
      spawnRipple(e.clientX, e.clientY, e.currentTarget);
    }
  };

  const handlePointerUp = () => setPressed(false);
  const handlePointerLeave = () => setPressed(false);

  const handleMouseMove = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (!failed) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * 100;
    const ry = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${rx}%`);
    el.style.setProperty("--my", `${ry}%`);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={alt}
      onClick={() => !disabled && onClick()}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onMouseMove={handleMouseMove}
      style={{ ...btnBase, ...style }}
      className="home-smart-btn"
    >
      {failed ? (
        <div
          className={`glass home-fallback-btn home-fallback-btn--${tone}`}
          style={fallbackStyle}
        >
          <div style={shimmerStyle} aria-hidden="true">
            <div style={shimmerMainStyle} />
            <div style={shimmerAccentStyle} />
          </div>

          <div style={sheenLineStyle} aria-hidden="true" />

          {ripples.map((r) => (
            <span
              key={r.id}
              className="home-ripple"
              aria-hidden="true"
              style={{
                left: r.x,
                top: r.y,
                width: r.size,
                height: r.size,
              }}
            />
          ))}

          <div style={left}>
            <div style={iconWrapStyle} aria-hidden="true">
              <div style={iconBubbleStyle}>
                <div style={iconBubble1Style} />
                <div style={iconBubble2Style} />
              </div>
              <div style={iconGlyphStyle}>{fallbackIcon ?? "✨"}</div>
            </div>

            <div style={textWrap}>
              <div style={labelStyle}>{fallbackLabel}</div>
              {fallbackSub ? <div style={subStyle}>{fallbackSub}</div> : null}
            </div>
          </div>

          <div style={chevron} aria-hidden="true">
            ▶
          </div>
        </div>
      ) : (
        <div className="glass" style={frameStyle}>
          <div style={imageWrapStyle}>
            <img
              className="home-img-btn__img"
              src={src}
              alt={alt}
              draggable={false}
              onError={() => setFailed(true)}
              style={imageStyle}
            />
          </div>
        </div>
      )}
    </button>
  );
}

export default function Home({ go, goSecret }: Props) {
  const { settings } = useAppSettings();

  const assetVersion = String(settings.assetVersion ?? "").trim();

  const logoSrc = appendAssetVersion(
    "/assets/logo/logo-title.png",
    assetVersion,
  );
  const btnRecord = appendAssetVersion(
    "/assets/buttons/btn-record.png",
    assetVersion,
  );
  const btnHistory = appendAssetVersion(
    "/assets/buttons/btn-history.png",
    assetVersion,
  );
  const btnAnalysis = appendAssetVersion(
    "/assets/buttons/btn-analysis.png",
    assetVersion,
  );
  const btnWeather = appendAssetVersion(
    "/assets/buttons/btn-weather.png",
    assetVersion,
  );
  const btnChat = appendAssetVersion(
    "/assets/buttons/btn-chat.png",
    assetVersion,
  );
  const btnSettings = appendAssetVersion(
    "/assets/buttons/btn-settings.png",
    assetVersion,
  );

  const fitOuterRef = useRef<HTMLDivElement | null>(null);
  const fitInnerRef = useRef<HTMLDivElement | null>(null);

  const [fitScale, setFitScale] = useState<number>(1);
  const [fitReady, setFitReady] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    let raf = 0;

    const calc = () => {
      const outer = fitOuterRef.current;
      const inner = fitInnerRef.current;
      if (!outer || !inner) return;

      const aw = outer.clientWidth;
      const ah = outer.clientHeight;

      const cw = inner.scrollWidth || inner.getBoundingClientRect().width;
      const ch = inner.scrollHeight || inner.getBoundingClientRect().height;

      if (!aw || !ah || !cw || !ch) return;

      const sW = aw / cw;
      const sH = ah / ch;
      const next = clamp(Math.min(1, sW, sH), 0.55, 1);

      setFitScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
      setFitReady(true);
    };

    calc();

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(calc);
    };

    const ro = new ResizeObserver(() => schedule());
    if (fitOuterRef.current) ro.observe(fitOuterRef.current);
    if (fitInnerRef.current) ro.observe(fitInnerRef.current);

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("load", schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("load", schedule);
    };
  }, []);

  useEffect(() => {
    if (fitReady) return;

    const id = window.requestAnimationFrame(() => {
      setFitReady(true);
    });

    return () => window.cancelAnimationFrame(id);
  }, [fitReady]);

  return (
    <PageShell
      title={null}
      subtitle={null}
      maxWidth={1700}
      showBack={false}
      scrollY="hidden"
      contentPadding={0}
    >
      <style>
        {`
        .home-root{
          width:100%;
          height:100dvh;
          min-height:0;
          overflow:hidden;
        }
        @media (min-width: 821px){
          .home-root{
            height: calc(100dvh - var(--shell-header-h, 0px));
          }
        }

        .home-fit{
          height:100%;
          width:100%;
          min-height:0;
          min-width:0;
          overflow:hidden;
          display:grid;
          place-items:center;
          padding:
            max(4px, env(safe-area-inset-top))
            max(8px, env(safe-area-inset-right))
            max(8px, env(safe-area-inset-bottom))
            max(8px, env(safe-area-inset-left));
          box-sizing:border-box;
        }

        @media (max-width:720px){
          .home-fit{
            place-items:start center;
            --home-top-nudge:-10px;
            padding-top: calc(max(2px, env(safe-area-inset-top)) + var(--home-top-nudge));
          }
        }

        .home-fit-inner{
          width:100%;
          max-width:1700px;
          transform-origin:top center;
          will-change:transform;
          transition: opacity 120ms ease;
        }

        .home-inner{
          width:100%;
          min-width:0;
          padding:clamp(10px, 1.8vw, 16px);
          display:grid;
          grid-template-rows:auto minmax(0,1fr);
          gap:clamp(2px, 0.8vh, 8px);
          box-sizing:border-box;
        }

        .home-safe-logo{
          width:100%;
          padding-right:clamp(0px, 18vw, 430px);
          min-width:0;
        }
        @media (max-width:720px){
          .home-safe-logo{ padding-right:0; }
        }

        .home-logo-box{
          width:min(96vw, 1320px);
          height:clamp(140px, 28dvh, 300px);
          min-height:0;
          position:relative;
        }
        @media (max-width:720px){
          .home-logo-box{
            width:min(96vw, 820px);
            height:clamp(170px, 30dvh, 340px);
            margin:0 auto;
          }
        }

        .home-logo{
          width:100%;
          height:100%;
          object-fit:contain;
          display:block;
        }

        .home-actions{
          display:grid;
          align-items:center;
          min-height:0;
        }
        @media (max-width:720px){
          .home-actions{
            align-items:start;
          }
        }

        .home-safe-actions{
          width:100%;
          padding-right:clamp(0px, 18vw, 430px);
          min-width:0;
        }
        @media (max-width:720px){
          .home-safe-actions{ padding-right:50vw; }
        }

        .home-actions-scale{
          --btnw:clamp(210px, 22vw, 320px);
          --gapy:clamp(8px, 1.2vh, 14px);
          display:grid;
          gap:var(--gapy);
          justify-content:center;
          min-height:0;
        }

        .home-grid{
          display:grid;
          grid-template-columns:1fr;
          gap:var(--gapy);
          justify-items:center;
        }

        .home-settings{
          display:grid;
          justify-items:center;
          margin-top:2px;
        }

        @media (max-width:720px){
          .home-actions-scale{
            width:min(48vw, 320px);
            justify-content:center;
            padding-left:max(8px, env(safe-area-inset-left));
            padding-right:8px;
            transform:scale(0.92);
            transform-origin:top center;
            --gapy:clamp(4px, 0.65vh, 8px);
            --btnw:100%;
          }
          .home-grid{ justify-items:center; }
          .home-settings{ justify-items:center; }
        }

        .home-smart-btn{
          --mx:50%;
          --my:50%;
        }

        .home-smart-btn:focus-visible{
          outline:none;
        }

        .home-smart-btn:focus-visible .home-fallback-btn{
          box-shadow:
            0 10px 24px rgba(0,0,0,0.16),
            0 0 0 1px rgba(255,255,255,0.06) inset,
            0 1px 0 rgba(255,255,255,0.20) inset,
            0 0 0 2px rgba(255,255,255,0.34);
        }

        .home-fallback-btn{
          transition: transform 140ms ease, filter 160ms ease, box-shadow 160ms ease;
        }

        .home-fallback-btn::after{
          content:"";
          position:absolute;
          inset:-18%;
          pointer-events:none;
          z-index:1;
          border-radius:24px;
          background:
            radial-gradient(
              180px 120px at var(--mx) var(--my),
              rgba(255,255,255,0.16),
              rgba(255,255,255,0.06) 28%,
              rgba(255,255,255,0) 62%
            );
          opacity:.9;
          transition:opacity 140ms ease;
        }

        .home-smart-btn:hover .home-fallback-btn::after{
          opacity:1;
        }

        .home-smart-btn:hover .home-fallback-btn{
          transform:translateY(-1px);
          filter:brightness(1.04);
        }

        .home-ripple{
          position:absolute;
          pointer-events:none;
          z-index:1;
          border-radius:999px;
          transform:translate(-50%, -50%) scale(0.18);
          background:
            radial-gradient(circle,
              rgba(255,255,255,0.30) 0%,
              rgba(220,240,255,0.14) 28%,
              rgba(180,220,255,0.08) 44%,
              rgba(255,255,255,0.03) 58%,
              rgba(255,255,255,0) 72%
            );
          border:1px solid rgba(255,255,255,0.18);
          animation:homeRipple 760ms cubic-bezier(.12,.72,.2,1) forwards;
          mix-blend-mode:screen;
        }

        @keyframes homeRipple{
          0%{
            transform:translate(-50%, -50%) scale(0.18);
            opacity:.78;
          }
          55%{
            opacity:.34;
          }
          100%{
            transform:translate(-50%, -50%) scale(1);
            opacity:0;
          }
        }

        @keyframes homeWaterFloat{
          0%{
            transform:translate3d(0px, 0px, 0) scale(1) rotate(0deg);
          }
          25%{
            transform:translate3d(4px, -2px, 0) scale(1.03) rotate(0.4deg);
          }
          50%{
            transform:translate3d(0px, 3px, 0) scale(1.01) rotate(-0.4deg);
          }
          75%{
            transform:translate3d(-4px, -1px, 0) scale(1.04) rotate(0.2deg);
          }
          100%{
            transform:translate3d(0px, 0px, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes homeWaterFloat2{
          0%{
            transform:translate3d(0px, 0px, 0) scale(1);
            opacity:.52;
          }
          33%{
            transform:translate3d(-5px, 4px, 0) scale(1.05);
            opacity:.68;
          }
          66%{
            transform:translate3d(4px, -3px, 0) scale(0.98);
            opacity:.58;
          }
          100%{
            transform:translate3d(0px, 0px, 0) scale(1);
            opacity:.52;
          }
        }

        @keyframes homeBubbleDrift{
          0%{
            transform:translate3d(0px, 0px, 0) scale(1);
            opacity:.92;
          }
          50%{
            transform:translate3d(1px, -2px, 0) scale(1.06);
            opacity:1;
          }
          100%{
            transform:translate3d(0px, 0px, 0) scale(1);
            opacity:.92;
          }
        }

        @keyframes homeBubbleDrift2{
          0%{
            transform:translate3d(0px, 0px, 0) scale(1);
            opacity:.72;
          }
          50%{
            transform:translate3d(-1px, 2px, 0) scale(1.08);
            opacity:.88;
          }
          100%{
            transform:translate3d(0px, 0px, 0) scale(1);
            opacity:.72;
          }
        }

        @media (prefers-reduced-motion: reduce){
          .home-smart-btn,
          .home-smart-btn:hover .home-fallback-btn,
          .home-ripple,
          .home-fallback-btn::after{
            transition:none !important;
            animation:none !important;
          }
        }
        `}
      </style>

      <div className="home-root">
        <div className="home-fit" ref={fitOuterRef}>
          <div
            className="home-fit-inner"
            ref={fitInnerRef}
            style={{
              transform: `scale(${fitScale})`,
              opacity: fitReady ? 1 : 0,
            }}
          >
            <div className="home-inner">
              <div className="home-safe-logo">
                <div className="home-logo-box">
                  <img
                    className="home-logo"
                    src={logoSrc}
                    alt="釣嫁ぷろじぇくと"
                  />

                  {typeof goSecret === "function" && (
                    <SecretPortalHotspot
                      onUnlock={goSecret}
                      style={{
                        position: "absolute",
                        inset: 0,
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="home-actions">
                <div className="home-safe-actions">
                  <div className="home-actions-scale">
                    <div className="home-grid">
                      <SmartButton
                        src={btnRecord}
                        alt="記録する"
                        onClick={() => go("record")}
                        style={{ width: "var(--btnw)" }}
                        fallbackLabel="記録する"
                        fallbackSub="写真/潮を保存"
                        fallbackIcon="📸"
                      />

                      <SmartButton
                        src={btnHistory}
                        alt="履歴をみる"
                        onClick={() => go("recordHistory")}
                        style={{ width: "var(--btnw)" }}
                        fallbackLabel="履歴をみる"
                        fallbackSub="過去ログを確認"
                        fallbackIcon="🗃"
                      />

                      <SmartButton
                        src={btnAnalysis}
                        alt="釣行分析"
                        onClick={() => go("recordAnalysis")}
                        style={{ width: "var(--btnw)" }}
                        fallbackLabel="釣行分析"
                        fallbackSub="相関/時間帯を掘る"
                        fallbackIcon="📊"
                      />

                      <SmartButton
                        src={btnWeather}
                        alt="天気・潮をみる"
                        onClick={() => go("weather")}
                        style={{ width: "var(--btnw)" }}
                        fallbackLabel="天気・潮をみる"
                        fallbackSub="予報/タイド"
                        fallbackIcon="🌦"
                      />

                      <SmartButton
                        src={btnChat}
                        alt="話す"
                        onClick={() => go("chat")}
                        style={{ width: "var(--btnw)" }}
                        fallbackLabel="話す"
                        fallbackSub="つづりと作戦会議"
                        fallbackIcon="💬"
                      />
                    </div>

                    <div className="home-settings">
                      <SmartButton
                        src={btnSettings}
                        alt="設定"
                        onClick={() => go("settings")}
                        style={{ width: "var(--btnw)" }}
                        fallbackLabel="設定"
                        fallbackSub="表示/背景/ガラス"
                        fallbackIcon="⚙️"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
