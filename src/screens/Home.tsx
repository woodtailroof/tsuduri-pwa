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

function useMatchMedia(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.(query)?.matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();

    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, [query]);

  return matches;
}

function ImgButton({
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
        touchAction: "manipulation",
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          width,
          height: "auto",
          display: "block",
          filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.16))",
          transition: "transform 120ms ease, filter 120ms ease",
        }}
        onPointerDown={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.transform = "scale(0.97)";
          el.style.filter = "brightness(0.96)";
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
  const isWide = useMatchMedia("(min-width: 900px)");
  const isLandscape = useMatchMedia("(orientation: landscape)");
  const isPhonePortrait = !isWide && !isLandscape;

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

  const ui = useMemo(() => {
    // ===== ロゴ（見栄え優先 / ただし高さ上限で押し出し防止） =====
    const logoW = isWide ? "min(920px, 56vw)" : "min(980px, 92vw)";
    const logoMaxH = isWide ? "28svh" : "22svh";
    const titleBottom = isWide
      ? "clamp(6px, 1.2svh, 14px)"
      : "clamp(6px, 1.0svh, 12px)";

    // ===== ボタンサイズ（画面内に収める） =====
    const btnW = isWide
      ? "clamp(220px, 18vw, 320px)"
      : "clamp(170px, 42vw, 250px)";

    const gapY = isWide
      ? "clamp(10px, 1.8svh, 18px)"
      : "clamp(8px, 1.6svh, 14px)";
    const gapX = isWide ? "clamp(18px, 2.2vw, 34px)" : "clamp(14px, 4vw, 26px)";

    // ===== “キャラの居場所”を確保する安全余白 =====
    // PC：右側にしっかり領域確保（巨大キャラでも壊れない）
    const safeRightPad = isWide
      ? "min(42vw, 620px)"
      : isPhonePortrait
        ? "min(42vw, 230px)"
        : "0px";

    // スマホ縦：キャラの胴体に被りやすいので、ボタンを上へ逃がす
    const liftButtonsY = isPhonePortrait ? "-10svh" : "0svh";

    // キャラ高さ（Homeでの見た目）※キャラが巨大でも“右側に逃がす”ので壊れにくい
    const characterHeight = isWide
      ? "clamp(420px, 74svh, 860px)"
      : "clamp(320px, 56svh, 620px)";

    return {
      logoW,
      logoMaxH,
      btnW,
      gapY,
      gapX,
      titleBottom,
      safeRightPad,
      liftButtonsY,
      characterHeight,
    };
  }, [isWide, isPhonePortrait]);

  return (
    <PageShell
      showBack={false}
      title={null}
      subtitle={null}
      maxWidth={1600}
      testCharacterHeight={ui.characterHeight}
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

      {/* ✅ Homeはスクロール不要：100svh内で完結 */}
      <div
        style={{
          height: "100svh",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          overflow: "hidden",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
          paddingBottom: `max(8px, env(safe-area-inset-bottom))`,
        }}
      >
        {/* タイトル */}
        <div
          style={{
            display: "grid",
            justifyItems: isWide ? "start" : "center",
            alignItems: "center",
            marginTop: "clamp(6px, 1.6svh, 16px)",
            marginBottom: ui.titleBottom,
            paddingRight: ui.safeRightPad,
            paddingLeft: isWide ? "clamp(18px, 3vw, 56px)" : 0,
          }}
        >
          <img
            src="/assets/logo/logo-title.png"
            alt="釣嫁ぷろじぇくと"
            draggable={false}
            style={{
              width: ui.logoW,
              maxHeight: ui.logoMaxH,
              height: "auto",
              display: "block",
              objectFit: "contain",
              filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.20))",
            }}
          />
        </div>

        {/* ボタン（PCは左寄せ寄り / スマホ縦は上へ持ち上げ） */}
        <div
          style={{
            display: "grid",
            alignItems: "center",
            overflow: "hidden",
            paddingRight: ui.safeRightPad,
            paddingLeft: isWide ? "clamp(18px, 3vw, 56px)" : 0,
            transform: `translateY(${ui.liftButtonsY})`,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, max-content)",
              columnGap: ui.gapX,
              rowGap: ui.gapY,
              justifyContent: isWide ? "start" : "center",
              alignContent: "center",
            }}
          >
            <ImgButton
              src="/assets/buttons/btn-record.png"
              alt="記録する"
              onClick={() => go("record")}
              width={ui.btnW}
            />
            <ImgButton
              src="/assets/buttons/btn-history.png"
              alt="履歴をみる"
              onClick={() => go("archive")}
              width={ui.btnW}
            />
            <ImgButton
              src="/assets/buttons/btn-weather.png"
              alt="天気・潮をみる"
              onClick={() => go("weather")}
              width={ui.btnW}
            />
            <ImgButton
              src="/assets/buttons/btn-chat.png"
              alt="話す"
              onClick={() => go("chat")}
              width={ui.btnW}
            />

            <div
              style={{
                gridColumn: "1 / span 2",
                display: "grid",
                placeItems: isWide ? "start" : "center",
              }}
            >
              <ImgButton
                src="/assets/buttons/btn-settings.png"
                alt="設定"
                onClick={() => go("settings")}
                width={ui.btnW}
              />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
