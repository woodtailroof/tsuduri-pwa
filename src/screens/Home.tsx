// src/screens/Home.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import PageShell from "../components/PageShell";
import SecretPortalHotspot from "../components/SecretPortalHotspot";

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

const APP_LOCK_PASS_KEY = "tsuduri_app_pass_v1";
const APP_LOCK_UNLOCKED_KEY = "tsuduri_app_unlocked_v1";

function loadSavedPass() {
  try {
    return localStorage.getItem(APP_LOCK_PASS_KEY) ?? "";
  } catch {
    return "";
  }
}

function isUnlocked() {
  try {
    return localStorage.getItem(APP_LOCK_UNLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

function setUnlocked(pass: string) {
  try {
    localStorage.setItem(APP_LOCK_PASS_KEY, pass);
    localStorage.setItem(APP_LOCK_UNLOCKED_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type SmartBtnProps = {
  src: string;
  alt: string;
  onClick: () => void;
  style?: CSSProperties;

  /** 画像が無い/壊れてる時に出す代替 */
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
  };

  const fallbackStyle: CSSProperties = {
    width: "100%",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(0,0,0,0.14)",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
    color: "rgba(255,255,255,0.92)",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    lineHeight: 1.2,
    userSelect: "none",
  };

  const left: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  };

  const iconStyle: CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.14)",
    flex: "0 0 auto",
    fontSize: 18,
  };

  const textWrap: CSSProperties = {
    display: "grid",
    gap: 4,
    minWidth: 0,
  };

  const labelStyle: CSSProperties = {
    fontWeight: 900,
    letterSpacing: "0.02em",
    fontSize: 16,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const subStyle: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.68)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const chevron: CSSProperties = {
    flex: "0 0 auto",
    fontSize: 16,
    color: "rgba(255,255,255,0.72)",
    paddingLeft: 8,
  };

  const showFallback = failed;

  return (
    <button
      type="button"
      aria-label={alt}
      onClick={() => !disabled && onClick()}
      style={{ ...btnBase, ...style }}
      className="home-smart-btn"
    >
      {showFallback ? (
        <div className="glass" style={fallbackStyle}>
          <div style={left}>
            <div style={iconStyle} aria-hidden="true">
              {fallbackIcon ?? "✨"}
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
        <img
          className="home-img-btn__img"
          src={src}
          alt={alt}
          draggable={false}
          onError={() => setFailed(true)}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      )}
    </button>
  );
}

export default function Home({ go, goSecret }: Props) {
  const [unlocked, setUnlockedState] = useState<boolean>(() => isUnlocked());
  const [pass, setPass] = useState<string>(() => loadSavedPass());
  const [error, setError] = useState<string>("");

  const canUse = useMemo(() => unlocked, [unlocked]);

  function unlockNow() {
    const p = pass.trim();
    if (!p) {
      setError("合言葉を入れてね");
      return;
    }
    setUnlocked(p);
    setUnlockedState(true);
    setError("");
  }

  // ===== assets =====
  const logoSrc = "/assets/logo/logo-title.png";
  const btnRecord = "/assets/buttons/btn-record.png";
  const btnHistory = "/assets/buttons/btn-history.png";
  const btnAnalysis = "/assets/buttons/btn-analysis.png"; // ✅ 無くてもOK（fallback表示）
  const btnWeather = "/assets/buttons/btn-weather.png";
  const btnChat = "/assets/buttons/btn-chat.png";
  const btnSettings = "/assets/buttons/btn-settings.png";

  // ===== ✅ 画面内フィット（はみ出す時だけ全体を縮小） =====
  const fitOuterRef = useRef<HTMLDivElement | null>(null);
  const fitInnerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState<number>(1);

  useEffect(() => {
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
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(calc);
    };

    schedule();

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
            height: calc(100dvh - var(--shell-header-h));
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
            place-items: start center;
            --home-top-nudge: -10px;
            padding-top: calc(max(2px, env(safe-area-inset-top)) + var(--home-top-nudge));
          }
        }

        .home-fit-inner{
          width:100%;
          max-width:1700px;
          transform-origin: top center;
          will-change: transform;
        }

        .home-inner{
          width:100%;
          min-width:0;
          padding: clamp(10px, 1.8vw, 16px);
          display:grid;
          grid-template-rows:auto minmax(0,1fr);
          gap: clamp(2px, 0.8vh, 8px);
          box-sizing:border-box;
        }

        .home-safe-logo{
          width:100%;
          padding-right:clamp(0px,18vw,430px);
          min-width:0;
        }
        @media (max-width:720px){
          .home-safe-logo{ padding-right:0; }
        }

        .home-logo-box{
          width:min(96vw,1320px);
          height:clamp(140px,28dvh,300px);
          min-height:0;
          position:relative; /* ✅ ここに秘密入口を重ねる */
        }
        @media (max-width:720px){
          .home-logo-box{
            width:min(96vw,820px);
            height:clamp(170px,30dvh,340px);
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
          padding-right:clamp(0px,18vw,430px);
          min-width:0;
        }
        @media (max-width:720px){
          .home-safe-actions{ padding-right:50vw; }
        }

        .home-actions-scale{
          --btnw:clamp(210px,22vw,320px);
          --gapy:clamp(6px,1.1vh,12px);
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
            width:min(48vw,320px);
            justify-content:center;
            padding-left:max(8px,env(safe-area-inset-left));
            padding-right:8px;
            transform:scale(0.92);
            transform-origin: top center;
            --gapy:clamp(2px,0.45vh,7px);
            --btnw:100%;
          }
          .home-grid{ justify-items:center; }
          .home-settings{ justify-items:center; }
        }
        `}
      </style>

      {!canUse && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px,96vw)",
              borderRadius: 14,
              background: "#0f0f0f",
              color: "#ddd",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              🔒 合言葉を入力
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  setError("");
                }}
                type="password"
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === "Enter" && unlockNow()}
              />
              <button type="button" onClick={unlockNow}>
                解錠
              </button>
            </div>
            {error && <div style={{ color: "#ffb3c1" }}>{error}</div>}
          </div>
        </div>
      )}

      <div
        className="home-root"
        style={{
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        <div className="home-fit" ref={fitOuterRef}>
          <div
            className="home-fit-inner"
            ref={fitInnerRef}
            style={{
              transform: `scale(${fitScale})`,
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

                  {/* ✅ 秘密入口: ロゴの上にだけ当たり判定を重ねる */}
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

                      {/* ✅ 追加：釣行分析（画像が無いならガラスボタンが出る） */}
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
            {/* /home-inner */}
          </div>
          {/* /home-fit-inner */}
        </div>
        {/* /home-fit */}
      </div>
    </PageShell>
  );
}
