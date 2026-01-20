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

          /* ===== Home全体：ロゴ + ボタン ===== */
          .home-root{
            height: 100svh;
            width: 100%;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            gap: clamp(4px, 1.0vh, 10px); /* ✅ 全体の縦間隔を詰める */
            align-items: start;
          }

          /* ===== ロゴ領域（スマホでも全幅を使う） ===== */
          .home-safe-logo{
            width: 100%;
            padding-right: clamp(0px, 18vw, 430px); /* PCは右キャラと喧嘩しない余白 */
          }
          @media (max-width: 720px){
            .home-safe-logo{
              padding-right: 0px; /* ✅ スマホはロゴを全幅に戻す */
            }
          }

          /* ===== ボタン領域（スマホだけ右半分を空ける） ===== */
          .home-safe-actions{
            width: 100%;
            padding-right: clamp(0px, 18vw, 430px); /* PC */
          }
          @media (max-width: 720px){
            .home-safe-actions{
              padding-right: 50vw; /* ✅ スマホは右半分をキャラ領域に */
            }
          }

          /* ===== ロゴ：スマホでも小さくしない ===== */
          .home-logo-box{
            width: min(96vw, 1320px);
            height: clamp(120px, 26svh, 260px);
            margin: 0;
          }
          @media (max-width: 720px){
            .home-logo-box{
              width: min(96vw, 760px);
              height: clamp(120px, 24svh, 240px); /* ✅ 主役サイズ維持 */
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

          /* ===== ボタン段 ===== */
          .home-actions{
            min-height: 0;
            display: grid;
            align-items: center; /* PCは中央が綺麗 */
          }
          @media (max-width: 720px){
            .home-actions{
              align-items: start; /* スマホは上詰めで落下防止 */
              padding-top: clamp(2px, 0.8vh, 8px);
            }
          }

          .home-actions-scale{
            width: 100%;
            display: grid;
            gap: var(--gapy);
          }

          /* ✅ PC：中央に縦1列 */
          .home-actions-scale{
            --btnw: clamp(210px, 22vw, 320px);
            --gapy: clamp(6px, 1.2vh, 12px);
            justify-content: center;
            transform-origin: center center;
          }
          .home-grid{
            display: grid;
            grid-template-columns: 1fr;
            gap: var(--gapy);
            justify-items: center;
          }
          .home-settings{
            display: grid;
            justify-items: center;
            margin-top: clamp(2px, 0.5vh, 6px);
          }

          /* ✅ スマホ：左半分カラム固定＆縦1列で必ず収める */
          @media (max-width: 720px){
            .home-actions-scale{
              width: min(48vw, 320px);
              justify-content: start;
              transform-origin: left top;

              /* ✅ 隙間をさらに詰める */
              --gapy: clamp(2px, 0.55vh, 8px);

              --btnw: 100%;
              padding-left: max(12px, env(safe-area-inset-left));
            }

            .home-grid{
              justify-items: start;
            }
            .home-settings{
              justify-items: start;
              margin-top: clamp(1px, 0.4vh, 5px);
            }
          }

          /* ===== 収める保険（スマホは常時ちょい縮めて“落下”を根絶） ===== */
          @media (max-width: 720px){
            .home-actions-scale{ transform: scale(0.92); }
          }
          @media (max-width: 720px) and (max-height: 820px){
            .home-actions-scale{ transform: scale(0.88); }
          }
          @media (max-width: 720px) and (max-height: 740px){
            .home-actions-scale{ transform: scale(0.84); }
          }
          @media (max-width: 720px) and (max-height: 660px){
            .home-actions-scale{ transform: scale(0.80); }
          }

          /* PC側も低い画面は少し縮める（保険） */
          @media (min-width: 721px) and (max-height: 760px){
            .home-actions-scale{ transform: scale(0.92); transform-origin: center center; }
          }
          @media (min-width: 721px) and (max-height: 690px){
            .home-actions-scale{ transform: scale(0.86); transform-origin: center center; }
          }
          @media (min-width: 721px) and (max-height: 620px){
            .home-actions-scale{ transform: scale(0.80); transform-origin: center center; }
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
        {/* ✅ ロゴは全幅 */}
        <div className="home-safe-logo">
          <div className="home-logo-box">
            <img className="home-logo" src={logoSrc} alt="釣嫁ぷろじぇくと" />
          </div>
        </div>

        {/* ✅ ボタンはPC/スマホで領域を分ける */}
        <div className="home-actions">
          <div className="home-safe-actions">
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
