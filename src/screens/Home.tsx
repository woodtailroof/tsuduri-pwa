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
  } catch {
    // ignore
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
      // ✅ スマホで「右半分にキャラ」を成立させるための保険（必要なら数値だけ微調整）
      testCharacterHeight="62vh"
      testCharacterOffset={{ right: 0, bottom: 0 }}
    >
      <style>
        {`
          /* ===== 画像ボタン：当たり判定ズレを潰す ===== */
          .home-img-btn{
            appearance: none;
            -webkit-appearance: none;
            border: 0;
            background: transparent;
            padding: 0;
            margin: 0;
            display: inline-block;
            line-height: 0;
            width: fit-content;
            height: fit-content;
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
          }
          .home-img-btn:focus{ outline: none; }
          .home-img-btn__img{
            display: block;
            width: 100%;
            height: auto;
          }

          /* ===== レイアウト方針 =====
             - 縦2段：上がロゴ、下がボタン
             - 下段は「残り高さ」に合わせて自動で縮める
          */
          .home-root{
            height: 100svh;
            width: 100%;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            gap: clamp(8px, 1.6vh, 14px);
            align-items: start;
          }

          /* PCは右下キャラと喧嘩しないよう右側に安全余白 */
          .home-safe{
            width: 100%;
            padding-right: clamp(0px, 18vw, 430px);
          }
          @media (max-width: 720px){
            .home-safe{ padding-right: 0px; }
          }

          /* ===== ロゴ：余白トリム済み素材を活かして主役サイズ ===== */
          .home-logo-box{
            width: min(96vw, 1320px);
            height: clamp(120px, 26svh, 260px);
            margin: 0;
          }
          @media (max-width: 720px){
            .home-logo-box{
              width: min(96vw, 760px);
              height: clamp(120px, 22svh, 220px);
              margin: 0 auto;
            }
          }
          .home-logo{
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            display: block;
            filter: drop-shadow(0 10px 28px rgba(0,0,0,0.25));
            pointer-events: none;
            user-select: none;
          }

          /* ===== ボタン段：残り高さに合わせて縮む ===== */
          .home-actions{
            min-height: 0;
            display: grid;
            align-items: center;
          }

          .home-actions-scale{
            --btnw: clamp(180px, 22vw, 300px);
            --gapy: clamp(10px, 2.2vh, 18px);

            width: 100%;
            display: grid;
            justify-content: start;
            gap: var(--gapy);
            transform-origin: left center;
          }

          /* ✅ PCも“縦1列”に統一（余白トリム済み素材で成立） */
          .home-grid{
            display: grid;
            grid-template-columns: 1fr;
            gap: var(--gapy);
            align-items: center;
            justify-content: start;
          }

          .home-settings{
            display: grid;
            justify-content: start;
            margin-top: clamp(6px, 1.2vh, 10px);
          }

          /* ===== スマホ：左寄せ＆画面半分まで＆縦1列 ===== */
          @media (max-width: 720px){
            .home-actions-scale{
              justify-content: start;
              transform-origin: left center;
              padding-left: max(12px, env(safe-area-inset-left));

              /* ✅ 左エリアに収める：最大で画面の約半分 */
              --btnw: min(48vw, 300px);
              --gapy: clamp(10px, 2.0vh, 16px);
            }

            .home-grid{
              grid-template-columns: 1fr;
              justify-content: start;
            }

            .home-settings{
              justify-content: start;
            }
          }

          /* 低い画面は縮める（Homeはスクロール禁止なので保険必須） */
          @media (max-height: 760px){
            .home-actions-scale{ transform: scale(0.92); }
          }
          @media (max-height: 690px){
            .home-actions-scale{ transform: scale(0.86); }
          }
          @media (max-height: 620px){
            .home-actions-scale{ transform: scale(0.80); }
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
              width: "min(520px, 96vw)",
              borderRadius: 14,
              border: "1px solid #333",
              background: "#0f0f0f",
              color: "#ddd",
              padding: 14,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
              🔒 合言葉を入力
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center",
              }}
            >
              <input
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  setError("");
                }}
                type="password"
                placeholder="合言葉"
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "#111",
                  color: "#fff",
                  minWidth: 0,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") unlockNow();
                }}
              />
              <button
                type="button"
                onClick={unlockNow}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "#1b1b1b",
                  color: "#fff",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                解錠
              </button>
            </div>

            {!!error && (
              <div style={{ marginTop: 10, color: "#ffb3c1", fontSize: 12 }}>
                {error}
              </div>
            )}
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
        <div className="home-safe">
          <div className="home-logo-box">
            <img className="home-logo" src={logoSrc} alt="釣嫁ぷろじぇくと" />
          </div>
        </div>

        <div className="home-actions">
          <div className="home-safe">
            <div className="home-actions-scale">
              <div className="home-grid">
                <ImgButton
                  src={btnRecord}
                  alt="記録する"
                  onClick={() => go("record")}
                  style={{ width: "var(--btnw)" } as CSSProperties}
                />
                <ImgButton
                  src={btnHistory}
                  alt="履歴をみる"
                  onClick={() => go("recordHistory")}
                  style={{ width: "var(--btnw)" } as CSSProperties}
                />
                <ImgButton
                  src={btnWeather}
                  alt="天気・潮をみる"
                  onClick={() => go("weather")}
                  style={{ width: "var(--btnw)" } as CSSProperties}
                />
                <ImgButton
                  src={btnChat}
                  alt="話す"
                  onClick={() => go("chat")}
                  style={{ width: "var(--btnw)" } as CSSProperties}
                />
              </div>

              <div className="home-settings">
                <ImgButton
                  src={btnSettings}
                  alt="設定"
                  onClick={() => go("settings")}
                  style={{ width: "var(--btnw)" } as CSSProperties}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
