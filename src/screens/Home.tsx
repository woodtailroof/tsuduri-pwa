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
            gap: clamp(8px, 1.4vh, 14px);
            align-items: start;
          }

          /* PCは右下キャラと喧嘩しないよう右側に安全余白 */
          .home-safe{
            width: 100%;
            padding-right: clamp(0px, 18vw, 430px);
          }

          /* ✅ スマホは“右半分＝キャラ領域”を確保 */
          @media (max-width: 720px){
            .home-safe{
              padding-right: 50vw;
            }
          }

          /* ===== ロゴ：小さくしない（ここが最重要） ===== */
          .home-logo-box{
            width: min(96vw, 1320px);
            height: clamp(130px, 28svh, 280px);
            margin: 0;
          }
          @media (max-width: 720px){
            .home-logo-box{
              width: min(96vw, 720px);
              height: clamp(130px, 24svh, 240px); /* ✅ スマホでも主役サイズ */
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

          /* ===== ボタン段：PCは中央、スマホは左カラム ===== */
          .home-actions{
            min-height: 0;
            display: grid;
            align-items: center;  /* PCは中央で気持ちいい */
          }
          @media (max-width: 720px){
            .home-actions{
              align-items: start;  /* スマホは上詰め（落下防止） */
              padding-top: clamp(6px, 1.2vh, 10px);
            }
          }

          .home-actions-scale{
            --gapy: clamp(8px, 1.5vh, 14px);
            width: 100%;
            display: grid;
            gap: var(--gapy);
          }

          /* ✅ PC：縦1列、中央揃え */
          .home-actions-scale{
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
            margin-top: clamp(2px, 0.8vh, 8px);
          }

          /* ✅ ボタン幅（PC） */
          .home-actions-scale{
            --btnw: clamp(210px, 22vw, 320px);
          }
          .home-btn{ width: var(--btnw); }

          /* ===== スマホ：左寄せ＆左半分カラム固定＆縦1列で必ず収める ===== */
          @media (max-width: 720px){
            .home-actions-scale{
              /* 左カラムを固定化：この箱の中でボタンが完結する */
              width: min(48vw, 320px);
              justify-content: start;
              transform-origin: left top;

              /* ここで確実に間隔を詰める */
              --gapy: clamp(4px, 0.9vh, 10px);

              /* ボタン自体は箱いっぱいを使う（= 箱幅 = 左半分） */
              --btnw: 100%;
              padding-left: max(12px, env(safe-area-inset-left));
            }

            .home-grid{
              justify-items: start;
            }
            .home-settings{
              justify-items: start;
              margin-top: clamp(2px, 0.5vh, 6px);
            }
          }

          /* ===== スクロール禁止のための“収める保険”
             スマホは高さが普通でも発動させて、設定ボタン落下を根絶する
          */
          @media (max-width: 720px){
            .home-actions-scale{ transform: scale(0.96); }
          }
          @media (max-width: 720px) and (max-height: 820px){
            .home-actions-scale{ transform: scale(0.92); }
          }
          @media (max-width: 720px) and (max-height: 760px){
            .home-actions-scale{ transform: scale(0.88); }
          }
          @media (max-width: 720px) and (max-height: 700px){
            .home-actions-scale{ transform: scale(0.84); }
          }
          @media (max-width: 720px) and (max-height: 640px){
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
