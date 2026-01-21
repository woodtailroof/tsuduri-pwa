// src/screens/Home.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  } catch {}
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

export default function Home({ go }: Props) {
  const [unlocked, setUnlockedState] = useState<boolean>(() => isUnlocked());
  const [pass, setPass] = useState<string>(() => loadSavedPass());
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setUnlockedState(isUnlocked());
  }, []);

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

  return (
    <PageShell
      title={null}
      subtitle={null}
      maxWidth={1700}
      showBack={false}
      scrollY="hidden"
      contentPadding={"clamp(10px, 1.8vw, 16px)"}
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

        .home-root{
          height:100svh;
          display:grid;
          grid-template-rows:auto minmax(0,1fr);
          gap:clamp(2px,0.8vh,8px);
        }

        /* ===== ロゴ ===== */
        .home-safe-logo{
          width:100%;
          padding-right:clamp(0px,18vw,430px);
        }
        @media (max-width:720px){
          .home-safe-logo{ padding-right:0; }
        }

        .home-logo-box{
          width:min(96vw,1320px);
          height:clamp(140px,30svh,300px);
        }
        @media (max-width:720px){
          .home-logo-box{
            width:min(96vw,820px);
            height:clamp(170px,32svh,340px);
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
        }
        @media (max-width:720px){
          .home-actions{
            align-items:start;
          }
        }

        .home-safe-actions{
          width:100%;
          padding-right:clamp(0px,18vw,430px);
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
            justify-content:center;      /* ★ここが今回の修正点 */
            padding-left:max(8px,env(safe-area-inset-left));
            padding-right:8px;
            transform:scale(0.92);
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
              <button onClick={unlockNow}>解錠</button>
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
        <div className="home-safe-logo">
          <div className="home-logo-box">
            <img className="home-logo" src={logoSrc} alt="釣嫁ぷろじぇくと" />
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
    </PageShell>
  );
}
