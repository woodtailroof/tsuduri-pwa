// src/screens/Home.tsx
import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";

type Props = {
  go: (screen: "record" | "archive" | "weather" | "chat" | "settings") => void;
};

const APP_LOCK_PASS_KEY = "tsuduri_app_pass_v1";
const APP_LOCK_UNLOCKED_KEY = "tsuduri_app_unlocked_v1";

/* ===== 既存ロック処理（変更なし） ===== */
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

/* ===== 画像ボタン ===== */
function ImageButton({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "clamp(160px, 22vw, 240px)",
          transition: "transform .15s ease, filter .15s ease",
        }}
        onPointerDown={(e) => {
          const el = e.currentTarget;
          el.style.transform = "scale(.96)";
          el.style.filter = "brightness(.95)";
        }}
        onPointerUp={(e) => {
          const el = e.currentTarget;
          el.style.transform = "scale(1)";
          el.style.filter = "none";
        }}
        onPointerLeave={(e) => {
          const el = e.currentTarget;
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

  useEffect(() => setUnlockedState(isUnlocked()), []);
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
        <img
          src="/assets/logo/logo-title.png"
          alt="釣嫁ぷろじぇくと"
          style={{
            width: "min(680px, 90%)",
            margin: "0 auto",
            display: "block",
          }}
        />
      }
      subtitle={
        <p style={{ textAlign: "center", marginTop: 8 }}>
          ひろっちの釣りライフ、今日も一投いこ？
        </p>
      }
      maxWidth={900}
    >
      {/* ===== ボタンエリア ===== */}
      <div
        style={{
          marginTop: 24,
          display: "grid",
          gap: "clamp(12px, 4vw, 24px)",
          opacity: canUse ? 1 : 0.3,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "clamp(12px, 4vw, 28px)",
            justifyItems: "center",
            maxWidth: 720,
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

        <div style={{ display: "grid", placeItems: "center", marginTop: 8 }}>
          <img
            src="/assets/buttons/btn-settings.png"
            alt="設定"
            style={{
              width: "clamp(200px, 30vw, 320px)",
              cursor: "pointer",
            }}
            onClick={() => go("settings")}
          />
        </div>
      </div>

      {/* 🔒 ロックUI（省略：そのまま） */}
      {!canUse && /* ← ここは元のまま */ null}
    </PageShell>
  );
}
