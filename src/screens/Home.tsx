// src/screens/Home.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import PageShell from "../components/PageShell";

type Props = {
  go: (
    screen: "record" | "recordHistory" | "weather" | "chat" | "settings",
  ) => void;
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

type ImgBtnProps = {
  src: string;
  alt: string;
  onClick: () => void;
  style?: CSSProperties;
};

function ImgButton({ src, alt, onClick, style }: ImgBtnProps) {
  return (
    <button
      type="button"
      className="home-img-btn"
      onClick={onClick}
      aria-label={alt}
      style={style}
    >
      <img
        className="home-img-btn__img"
        src={src}
        alt={alt}
        draggable={false}
      />
    </button>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Home({ go }: Props) {
  // ✅ 初期値で確定できるので、effectでのsetState不要
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

      // available（表示可能領域）
      const aw = outer.clientWidth;
      const ah = outer.clientHeight;

      // content（実サイズ）
      // scrollWidth/Height は transform の影響を受けにくいので、計測に向く
      const cw = inner.scrollWidth || inner.getBoundingClientRect().width;
      const ch = inner.scrollHeight || inner.getBoundingClientRect().height;

      if (!aw || !ah || !cw || !ch) return;

      const sW = aw / cw;
      const sH = ah / ch;
      const next = clamp(Math.min(1, sW, sH), 0.55, 1); // 小さすぎ防止（必要なら下限は調整可）
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
      // ✅ PageShell側のpaddingを0にして、Home側で高さ計算を安定させる
      contentPadding={0}
    >
      <style>
        {`
        .home-img-btn{
          appearance:none;
          border:0;
          background:transparent;
          padding:0;
          margin:0;
          display:inline-block;
          line-height:0;
          cursor:pointer;
        }
        .home-img-btn__img{
          display:block;
          width:100%;
          height:auto;
        }

        /* ✅ Homeの本文領域：常にviewport内へ（モバイルも含めて固定） */
        .home-root{
          width:100%;
          height:100dvh;
          min-height:0;
          overflow:hidden; /* ←スクロール禁止の本丸 */
        }
        @media (min-width: 821px){
          .home-root{
            height: calc(100dvh - var(--shell-header-h));
          }
        }

        /* ✅ フィット外枠（ここが available領域） */
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

        /* ✅ スマホ：タイトル（ロゴ）だけ、ほんの少し上へ */
        @media (max-width:720px){
          .home-fit{
            /* 上だけ気持ち薄く（クリップ回避で 0 にはしない） */
            padding-top: max(2px, env(safe-area-inset-top));
          }
        }

        /* ✅ フィット内側（はみ出す時だけ scale される） */
        .home-fit-inner{
          width:100%;
          max-width:1700px;
          transform-origin: top center;
          will-change: transform;
        }

        /* ✅ Homeの内側余白（PageShellのcontentPaddingの代替） */
        .home-inner{
          width:100%;
          min-width:0;
          padding: clamp(10px, 1.8vw, 16px);
          display:grid;
          grid-template-rows:auto minmax(0,1fr);
          gap: clamp(2px, 0.8vh, 8px);
          box-sizing:border-box;
        }

        /* ===== ロゴ ===== */
        .home-safe-logo{
          width:100%;
          padding-right:clamp(0px,18vw,430px);
          min-width:0;
        }
        @media (max-width:720px){
          .home-safe-logo{
            padding-right:0;

            /* ✅ ここがメイン：ロゴ塊を少し上へ */
            margin-top: clamp(-14px, -1.6dvh, -8px);
          }
        }

        /* ✅ dvh 寄りに */
        .home-logo-box{
          width:min(96vw,1320px);
          height:clamp(140px,28dvh,300px);
          min-height:0;
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

        /* ===== ボタン ===== */
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

        /* ===== スマホ：左半分カラム内で中央揃え ===== */
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
        {/* ✅ ここが「画面内に収める」フィット機構 */}
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
                </div>
              </div>

              <div className="home-actions">
                <div className="home-safe-actions">
                  <div className="home-actions-scale">
                    <div className="home-grid">
                      <ImgButton
                        src={btnRecord}
                        alt="記録する"
                        onClick={() => go("record")}
                        style={{ width: "var(--btnw)" }}
                      />
                      <ImgButton
                        src={btnHistory}
                        alt="履歴をみる"
                        onClick={() => go("recordHistory")}
                        style={{ width: "var(--btnw)" }}
                      />
                      <ImgButton
                        src={btnWeather}
                        alt="天気・潮をみる"
                        onClick={() => go("weather")}
                        style={{ width: "var(--btnw)" }}
                      />
                      <ImgButton
                        src={btnChat}
                        alt="話す"
                        onClick={() => go("chat")}
                        style={{ width: "var(--btnw)" }}
                      />
                    </div>
                    <div className="home-settings">
                      <ImgButton
                        src={btnSettings}
                        alt="設定"
                        onClick={() => go("settings")}
                        style={{ width: "var(--btnw)" }}
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
