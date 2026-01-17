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

function ImageButton({
  src,
  alt,
  onClick,
  width,
}: {
  src: string;
  alt: string;
  onClick: () => void;
  /** 任意で上書き（設定ボタンなど） */
  width?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={alt}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        lineHeight: 0,
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          width: width ?? "clamp(170px, 22vw, 250px)",
          height: "auto",
          display: "block",
          transition: "transform 0.15s ease, filter 0.15s ease",
          touchAction: "manipulation",
        }}
        onPointerDown={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.transform = "scale(0.96)";
          el.style.filter = "brightness(0.95)";
        }}
        onPointerUp={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.transform = "scale(1)";
          el.style.filter = "none";
        }}
        onPointerLeave={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.transform = "scale(1)";
          el.style.filter = "none";
        }}
        onPointerCancel={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.transform = "scale(1)";
          el.style.filter = "none";
        }}
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

  return (
    <PageShell
      title={
        <div style={{ display: "grid", placeItems: "center" }}>
          <img
            src="/assets/logo/logo-title.png"
            alt="釣嫁ぷろじぇくと"
            style={{
              width: "min(720px, 92%)",
              maxWidth: 720,
              height: "auto",
              display: "block",
            }}
          />
        </div>
      }
      subtitle={
        <p style={{ marginTop: 10, textAlign: "center" }}>
          ひろっちの釣りライフ、今日も一投いこ？
        </p>
      }
      maxWidth={980}
    >
      {/* 🔒 ロックオーバーレイ（元仕様そのまま） */}
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

      {/* 🎣 ホームボタンエリア（PC/スマホ両対応で密度調整） */}
      <div
        style={{
          marginTop: "clamp(14px, 2.4vw, 26px)",
          display: "grid",
          gap: "clamp(14px, 2.6vw, 24px)",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        {/* 2列グリッド：中央寄せ＋最大幅制限でPCの間延び解消 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "clamp(14px, 3vw, 30px)",
            justifyItems: "center",
            alignItems: "center",
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          <ImageButton
            src="/assets/buttons/btn-record.png"
            alt="記録する"
            onClick={() => go("record")}
          />
          <ImageButton
            src="/assets/buttons/btn-archive.png"
            alt="履歴をみる"
            onClick={() => go("archive")}
          />
          <ImageButton
            src="/assets/buttons/btn-weather.png"
            alt="天気・潮をみる"
            onClick={() => go("weather")}
          />
          <ImageButton
            src="/assets/buttons/btn-chat.png"
            alt="話す"
            onClick={() => go("chat")}
          />
        </div>

        {/* 設定：下に単独、スマホでも押しやすく */}
        <div style={{ display: "grid", placeItems: "center", marginTop: 4 }}>
          <ImageButton
            src="/assets/buttons/btn-settings.png"
            alt="設定"
            onClick={() => go("settings")}
            width="clamp(240px, 40vw, 360px)"
          />
        </div>
      </div>
    </PageShell>
  );
}
