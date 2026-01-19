// src/screens/Home.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import PageShell from "../components/PageShell";

type Props = {
  go: (screen: "record" | "archive" | "weather" | "chat" | "settings") => void;
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
    <PageShell title={null} subtitle={null} maxWidth={1600}>
      <style>
        {`
          /* ✅ Homeだけ「絶対スクロールさせない」 */
          .page-shell-scroll{
            overflow: hidden !important;
            height: 100svh !important;
          }
          /* PageShellの内側paddingが効きすぎると超えやすいのでHomeだけ少し圧縮 */
          .page-shell-inner{
            padding: clamp(10px, 2vw, 18px) !important;
          }

          /* ===== 画像ボタン：当たり判定を画像に寄せる ===== */
          .home-img-btn{
            appearance: none;
            -webkit-appearance: none;
            border: 0;
            background: transparent;
            padding: 0;
            margin: 0;
            display: inline-block;
            line-height: 0;               /* 行ボックス由来の余白を消す */
            width: fit-content;
            height: fit-content;
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
          }
          .home-img-btn:focus{ outline: none; }
          .home-img-btn__img{
            display: block;               /* img下の謎余白を消す */
            width: var(--home-btn-w);
            max-width: 100%;
            height: auto;
          }

          /* ===== サイズスケール（高さが低い環境ほど縮む） ===== */
          :root{
            --home-btn-w: clamp(190px, 22vw, 300px);
            --home-gap-y: clamp(10px, 2.2vh, 18px);
            --home-gap-x: clamp(14px, 2.6vw, 30px);
            --home-logo-w: min(92vw, 1040px);
            --home-logo-maxh: 34svh; /* 高さがキツい端末でここが効く */
          }

          @media (max-width: 720px){
            :root{
              --home-btn-w: clamp(170px, 44vw, 240px);
              --home-logo-w: min(92vw, 560px);
              --home-logo-maxh: 28svh;
            }
          }

          /* “高さが低い”環境（PC横長・ズーム・スマホ横向き）対策 */
          @media (max-height: 760px){
            :root{
              --home-btn-w: clamp(165px, 20vw, 260px);
              --home-gap-y: clamp(8px, 1.6vh, 14px);
              --home-logo-maxh: 26svh;
            }
          }

          .home-wrap{
            height: 100svh;
            width: 100%;
            display: grid;
            align-items: center;
          }

          /* PCは右下キャラと喧嘩しないように右側に安全余白を確保 */
          .home-stage{
            width: 100%;
            display: grid;
            justify-items: start;
            gap: var(--home-gap-y);
            padding-right: clamp(0px, 18vw, 420px);
          }
          @media (max-width: 720px){
            .home-stage{
              justify-items: center;
              padding-right: 0px;
            }
          }

          .home-logo{
            width: var(--home-logo-w);
            height: auto;
            max-height: var(--home-logo-maxh);
            display: block;
            margin: 0;
            filter: drop-shadow(0 10px 28px rgba(0,0,0,0.25));
          }
          @media (max-width: 720px){
            .home-logo{ margin: 0 auto; }
          }

          /* ボタン：2x2 + 設定（中央寄せ） */
          .home-grid{
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, max-content);
            justify-content: start;
            align-items: center;
            gap: var(--home-gap-y) var(--home-gap-x);
          }
          @media (max-width: 720px){
            .home-grid{ justify-content: center; }
          }

          .home-settings{
            grid-column: 1 / -1;
            justify-self: start;
          }
          @media (max-width: 720px){
            .home-settings{ justify-self: center; }
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
        className="home-wrap"
        style={{
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        <div className="home-stage">
          <img className="home-logo" src={logoSrc} alt="釣嫁ぷろじぇくと" />

          <div className="home-grid">
            <ImgButton
              src={btnRecord}
              alt="記録する"
              onClick={() => go("record")}
            />
            <ImgButton
              src={btnHistory}
              alt="履歴をみる"
              onClick={() => go("archive")}
            />
            <ImgButton
              src={btnWeather}
              alt="天気・潮をみる"
              onClick={() => go("weather")}
            />
            <ImgButton src={btnChat} alt="話す" onClick={() => go("chat")} />

            <div className="home-settings">
              <ImgButton
                src={btnSettings}
                alt="設定"
                onClick={() => go("settings")}
              />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
