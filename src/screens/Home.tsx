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
    <PageShell
      // Homeはタイトル/サブタイトルは自前で描画（ひと言は消す）
      title={null}
      subtitle={null}
      maxWidth={1400}
    >
      {/* Home専用CSS（当たり判定を画像に寄せる・レイアウト固定） */}
      <style>
        {`
          /* 画像ボタン：当たり判定 = 画像サイズ（余計なpadding等を完全排除） */
          .home-img-btn{
            appearance: none;
            -webkit-appearance: none;
            border: 0;
            background: transparent;
            padding: 0;
            margin: 0;
            display: inline-block;
            line-height: 0;               /* ← これ重要：行ボックスの余白を消す */
            width: fit-content;
            height: fit-content;
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
          }
          .home-img-btn:focus{
            outline: none;
          }
          .home-img-btn__img{
            display: block;               /* ← これ重要：img下の謎余白を消す */
            width: var(--home-btn-w);
            max-width: 100%;
            height: auto;
          }

          /* 画面内に収めるための基準幅（PC/スマホで可変） */
          :root{
            --home-btn-w: clamp(210px, 26vw, 320px);
          }
          @media (max-width: 480px){
            :root{
              --home-btn-w: clamp(170px, 44vw, 240px);
            }
          }

          /* ロゴを“映える”サイズに（高さじゃなく横幅基準に寄せる） */
          .home-logo{
            width: min(86vw, 980px);
            max-width: 980px;
            height: auto;
            display: block;
            margin: 0 auto;
            filter: drop-shadow(0 10px 28px rgba(0,0,0,0.25));
          }
          @media (max-width: 480px){
            .home-logo{
              width: min(92vw, 520px);
            }
          }

          /* Home全体：1画面固定 */
          .home-wrap{
            min-height: calc(100svh - 48px); /* PageShell padding分のざっくり調整 */
            display: grid;
            place-items: center;
          }

          /* 右下キャラと喧嘩しないように、右側に“安全余白”を確保（PCだけ強め） */
          .home-stage{
            width: 100%;
            display: grid;
            justify-items: start;
            gap: clamp(10px, 1.8vh, 18px);
            padding-right: clamp(0px, 18vw, 420px);
          }
          @media (max-width: 720px){
            .home-stage{
              padding-right: 0px;
              justify-items: center;
            }
          }

          /* ボタン配置：2x2 + 設定（中央寄せ） */
          .home-grid{
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, max-content);
            justify-content: start;
            gap: clamp(12px, 2.4vh, 22px) clamp(14px, 2.6vw, 30px);
            align-items: center;
          }
          @media (max-width: 720px){
            .home-grid{
              justify-content: center;
            }
          }

          .home-settings{
            grid-column: 1 / -1;
            justify-self: start;
          }
          @media (max-width: 720px){
            .home-settings{
              justify-self: center;
            }
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
            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
              ※ これは「自分だけプレ運用」用の簡易ロックだよ。
              <br />
              チャットAPI側でもチェックするから、合言葉がないと会話は動かないようにしてある。
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
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

            <div style={{ marginTop: 10, fontSize: 11, color: "#777" }}>
              ヒント：合言葉は端末内に保存されるよ（localStorage）
            </div>
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
          {/* ロゴ */}
          <img className="home-logo" src={logoSrc} alt="釣嫁ぷろじぇくと" />

          {/* ボタン群 */}
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

            {/* 設定 */}
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
