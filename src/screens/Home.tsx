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

function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(orientation: landscape)")?.matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return isLandscape;
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
  width: string;
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
          width,
          height: "auto",
          display: "block",
          transition: "transform 0.15s ease, filter 0.15s ease",
          touchAction: "manipulation",
        }}
        onPointerDown={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.transform = "scale(0.965)";
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
  const isLandscape = useOrientation();

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

  // ✅ 1画面に収めるためのスケール（縦横で強めに切り替え）
  const ui = useMemo(() => {
    // ロゴは「高さ制限」が効くと一気に安定する
    const logoMaxH = isLandscape ? "22dvh" : "18dvh";

    // ボタンは dvh を混ぜて「縦が足りない端末」で縮むようにする
    const btnW = isLandscape
      ? "clamp(170px, 18vw, 250px)"
      : "clamp(150px, 40vw, 230px)";

    const gap = isLandscape
      ? "clamp(8px, 1.8dvh, 14px)"
      : "clamp(10px, 2.2dvh, 16px)";

    const settingsW = isLandscape
      ? "clamp(220px, 26vw, 340px)"
      : "clamp(210px, 68vw, 320px)";

    const subtitleSize = isLandscape ? 13 : 14;

    return {
      logoMaxH,
      btnW,
      gap,
      settingsW,
      subtitleSize,
      gridMax: isLandscape ? 720 : 560,
    };
  }, [isLandscape]);

  return (
    <PageShell
      // ✅ Homeは戻る不要（高さを稼ぐ）
      showBack={false}
      // ✅ Homeはスクロール禁止（1画面固定）
      scrollable={false}
      // ✅ Homeは縦余白を詰める（これが超効く）
      contentPadding={"clamp(10px, 2.2vw, 16px)"}
      title={
        <div style={{ display: "grid", placeItems: "center" }}>
          <img
            src="/assets/logo/logo-title.png"
            alt="釣嫁ぷろじぇくと"
            style={{
              width: isLandscape ? "min(640px, 56vw)" : "min(720px, 92vw)",
              maxHeight: ui.logoMaxH,
              height: "auto",
              display: "block",
              objectFit: "contain",
            }}
          />
        </div>
      }
      subtitle={
        <p
          style={{
            marginTop: "clamp(6px, 1.2dvh, 10px)",
            marginBottom: "clamp(10px, 2.0dvh, 14px)",
            textAlign: "center",
            fontSize: ui.subtitleSize,
          }}
        >
          ひろっちの釣りライフ、今日も一投いこ？
        </p>
      }
      maxWidth={980}
    >
      {/* 🔒 ロックオーバーレイ（元仕様） */}
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

      {/* ✅ Home UI（1画面固定） */}
      <div
        style={{
          height: "calc(100dvh - 120px)",
          maxHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ width: "100%" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: ui.gap,
              justifyItems: "center",
              alignItems: "center",
              maxWidth: ui.gridMax,
              margin: "0 auto",
            }}
          >
            <ImageButton
              src="/assets/buttons/btn-record.png"
              alt="記録する"
              onClick={() => go("record")}
              width={ui.btnW}
            />
            <ImageButton
              src="/assets/buttons/btn-history.png"
              alt="履歴をみる"
              onClick={() => go("archive")}
              width={ui.btnW}
            />
            <ImageButton
              src="/assets/buttons/btn-weather.png"
              alt="天気・潮をみる"
              onClick={() => go("weather")}
              width={ui.btnW}
            />
            <ImageButton
              src="/assets/buttons/btn-chat.png"
              alt="話す"
              onClick={() => go("chat")}
              width={ui.btnW}
            />
          </div>

          <div
            style={{
              display: "grid",
              placeItems: "center",
              marginTop: "clamp(8px, 1.6dvh, 12px)",
            }}
          >
            <ImageButton
              src="/assets/buttons/btn-settings.png"
              alt="設定"
              onClick={() => go("settings")}
              width={ui.settingsW}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
