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
        touchAction: "manipulation",
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
  const isWide = useMatchMedia("(min-width: 900px)");
  const isLandscape = useMatchMedia("(orientation: landscape)");
  const isMobileLike = !isWide && !isLandscape;

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
    // ボタン：そのまま
    const btnW = isWide
      ? "clamp(220px, 18vw, 300px)"
      : "clamp(160px, 44vw, 240px)";

    // ✅ タイトル：見栄え優先で大きく
    // スマホは横幅を優先してドンと見せる / PCは左パネル内で存在感アップ
    const logoW = isWide ? "min(780px, 56vw)" : "min(980px, 92vw)";
    const logoMaxH = isWide ? "22svh" : "20svh";

    const leftPanelW = isWide ? "clamp(380px, 44vw, 700px)" : "100%";

    // スマホ：右下キャラに被らない安全地帯（ボタンはそのまま活かす）
    const safeRightPad = isMobileLike ? "min(40vw, 210px)" : "0px";

    const topGap = "clamp(8px, 1.8svh, 16px)";
    const gridGap = isWide
      ? "clamp(10px, 2svh, 16px)"
      : "clamp(10px, 2svh, 14px)";

    // キャラ：Homeでは右下ピッタリ（0,0）
    const characterHeight = isWide
      ? "clamp(420px, 72svh, 760px)"
      : "clamp(320px, 52svh, 520px)";

    return {
      btnW,
      logoW,
      logoMaxH,
      leftPanelW,
      safeRightPad,
      topGap,
      gridGap,
      characterHeight,
    };
  }, [isWide, isMobileLike]);

  const btns = useMemo(
    () => [
      {
        src: "/assets/buttons/btn-record.png",
        alt: "記録する",
        onClick: () => go("record"),
      },
      {
        src: "/assets/buttons/btn-history.png",
        alt: "履歴をみる",
        onClick: () => go("archive"),
      },
      {
        src: "/assets/buttons/btn-weather.png",
        alt: "天気・潮をみる",
        onClick: () => go("weather"),
      },
      {
        src: "/assets/buttons/btn-chat.png",
        alt: "話す",
        onClick: () => go("chat"),
      },
      {
        src: "/assets/buttons/btn-settings.png",
        alt: "設定",
        onClick: () => go("settings"),
      },
    ],
    [go],
  );

  return (
    <PageShell
      showBack={false}
      maxWidth={1400}
      title={null}
      subtitle={null}
      testCharacterHeight={ui.characterHeight}
      // ✅ 右下ぴったり
      testCharacterOffset={{ right: 0, bottom: 0 }}
      testCharacterOpacity={1}
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

      <div
        style={{
          minHeight: "calc(100svh - 16px)",
          display: "grid",
          alignItems: "center",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
          paddingBottom: `max(10px, env(safe-area-inset-bottom))`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isWide ? `${ui.leftPanelW} 1fr` : "1fr",
            alignItems: "center",
            columnGap: isWide ? "clamp(16px, 3vw, 40px)" : 0,
            width: "100%",
          }}
        >
          <div
            style={{
              width: "100%",
              paddingTop: ui.topGap,
              paddingBottom: ui.topGap,
              paddingRight: ui.safeRightPad,
            }}
          >
            {/* ✅ タイトル大きく */}
            <div
              style={{
                display: "grid",
                justifyItems: isWide ? "start" : "center",
                marginBottom: "clamp(10px, 2.4svh, 18px)",
              }}
            >
              <img
                src="/assets/logo/logo-title.png"
                alt="釣嫁ぷろじぇくと"
                style={{
                  width: ui.logoW,
                  maxHeight: ui.logoMaxH,
                  height: "auto",
                  display: "block",
                  objectFit: "contain",
                }}
              />
            </div>

            {/* ✅ 一言は削除 */}

            {/* ボタンはそのまま */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, max-content))",
                justifyContent: isWide ? "start" : "center",
                justifyItems: "center",
                gap: ui.gridGap,
                rowGap: ui.gridGap,
              }}
            >
              <ImageButton
                src={btns[0].src}
                alt={btns[0].alt}
                onClick={btns[0].onClick}
                width={ui.btnW}
              />
              <ImageButton
                src={btns[1].src}
                alt={btns[1].alt}
                onClick={btns[1].onClick}
                width={ui.btnW}
              />
              <ImageButton
                src={btns[2].src}
                alt={btns[2].alt}
                onClick={btns[2].onClick}
                width={ui.btnW}
              />
              <ImageButton
                src={btns[3].src}
                alt={btns[3].alt}
                onClick={btns[3].onClick}
                width={ui.btnW}
              />

              <div
                style={{
                  gridColumn: "1 / span 2",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ImageButton
                  src={btns[4].src}
                  alt={btns[4].alt}
                  onClick={btns[4].onClick}
                  width={ui.btnW}
                />
              </div>
            </div>
          </div>

          {isWide && <div aria-hidden="true" style={{ minHeight: "1px" }} />}
        </div>
      </div>
    </PageShell>
  );
}
