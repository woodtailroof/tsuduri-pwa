// src/screens/Home.tsx
import { useEffect, useMemo, useState } from "react";
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

  const btnBase: React.CSSProperties = {
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
  };

  const btnImg: React.CSSProperties = {
    width: "clamp(220px, 36vw, 360px)",
    height: "auto",
    display: "block",
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.18))",
    transition: "transform 120ms ease, filter 120ms ease",
  };

  return (
    <PageShell
      showBack={false}
      // ✅ タイトルは“画像で大きく”
      title={
        <div
          style={{
            display: "grid",
            placeItems: "center",
            marginTop: "clamp(6px, 1.6vh, 16px)",
            marginBottom: "clamp(10px, 2.2vh, 22px)",
          }}
        >
          <img
            src="/assets/logo/logo-title.png"
            alt="釣嫁ぷろじぇくと"
            draggable={false}
            style={{
              width: "min(860px, 92vw)", // ← PCでも存在感が出るように拡大
              maxWidth: "100%",
              height: "auto",
              display: "block",
              filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.22))",
            }}
          />
        </div>
      }
      // ✅ 一言は消す（subtitle無し）
      subtitle={null}
      maxWidth={1200}
      // ✅ キャラ右下を“ピッタリ”合わせ（Homeだけで調整）
      testCharacterOffset={{ right: 0, bottom: 0 }}
    >
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

      {/* ✅ ボタンは現状のまま（画像ボタン） */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "clamp(14px, 3.2vh, 26px) clamp(16px, 3vw, 34px)",
          alignItems: "center",
          justifyItems: "center",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        <button
          type="button"
          onClick={() => go("record")}
          style={btnBase}
          aria-label="釣果を記録する"
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <img src="/assets/buttons/btn-record.png" alt="" style={btnImg} />
        </button>

        <button
          type="button"
          onClick={() => go("archive")}
          style={btnBase}
          aria-label="全履歴を見る"
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <img src="/assets/buttons/btn-history.png" alt="" style={btnImg} />
        </button>

        <button
          type="button"
          onClick={() => go("weather")}
          style={btnBase}
          aria-label="天気・潮を見る"
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <img src="/assets/buttons/btn-weather.png" alt="" style={btnImg} />
        </button>

        <button
          type="button"
          onClick={() => go("chat")}
          style={btnBase}
          aria-label="話す"
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <img src="/assets/buttons/btn-chat.png" alt="" style={btnImg} />
        </button>

        {/* 設定（下段左に置いてるならそのまま） */}
        <div style={{ gridColumn: "1 / span 2", display: "grid", placeItems: "center" }}>
          <button
            type="button"
            onClick={() => go("settings")}
            style={btnBase}
            aria-label="設定"
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <img
              src="/assets/buttons/btn-settings.png"
              alt=""
              style={{
                ...btnImg,
                width: "clamp(240px, 40vw, 380px)", // 画像が元から大きめなら少しだけ抑える
              }}
            />
          </button>
        </div>
      </div>
    </PageShell>
  );
}
