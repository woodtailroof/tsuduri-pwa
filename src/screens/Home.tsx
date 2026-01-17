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
  const isPortrait = useMatchMedia("(orientation: portrait)");
  const isNarrow = useMatchMedia("(max-width: 520px)");
  const isWidePC = useMatchMedia("(min-width: 980px)");

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
    // ボタンは全部同じ幅で統一（設定も同じ扱い）
    const btnW = isPortrait
      ? "clamp(150px, 40vw, 230px)"
      : "clamp(170px, 16vw, 250px)";

    // ロゴ
    const logoW = isPortrait
      ? "min(760px, 86vw)"
      : "min(640px, 38vw)";

    const logoMaxH = isPortrait ? "16dvh" : "18dvh";

    // 余白
    const pad = isPortrait
      ? "clamp(12px, 3.2vw, 16px)"
      : "clamp(18px, 2.2vw, 26px)";

    // 間隔（1画面に収めるため、縦は d vh で締める）
    const gap = isPortrait
      ? "clamp(10px, 1.8dvh, 14px)"
      : "clamp(12px, 2.2dvh, 16px)";

    // スマホは「キャラ右下」の被りを避けて、ボタン群を左寄りにする
    const mobileLeftShift = isNarrow ? 8 : 16;

    // PCは横長の余白を活かして、左側に“操作パネル”を置く
    const panelMax = isWidePC ? 560 : 720;

    return {
      btnW,
      logoW,
      logoMaxH,
      pad,
      gap,
      mobileLeftShift,
      panelMax,
    };
  }, [isPortrait, isNarrow, isWidePC]);

  return (
    <PageShell
      showBack={false}
      maxWidth={1500}
      scrollY="hidden"
      contentPadding={ui.pad}
      title={null}
      subtitle={null}
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

      {/* ✅ 1画面固定レイアウト */}
      <div
        style={{
          height: "calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
          display: "grid",
          alignItems: "center",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        {/* PC: 左パネル + 右余白（キャラの見せ場） / スマホ: 左寄せ縦構成 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isWidePC ? "minmax(360px, 560px) 1fr" : "1fr",
            alignItems: "center",
            columnGap: isWidePC ? "clamp(16px, 3vw, 48px)" : 0,
            height: "100%",
          }}
        >
          {/* 操作パネル（ロゴ + 文言 + ボタン群） */}
          <div
            style={{
              justifySelf: "start",
              alignSelf: "center",
              width: "100%",
              maxWidth: ui.panelMax,
              // スマホはキャラ右下との被り回避で少し左寄せ＆上寄せ気味に
              marginLeft: isWidePC ? 0 : ui.mobileLeftShift,
              paddingRight: isWidePC ? 0 : 16,
            }}
          >
            {/* ロゴ（PCは左寄せ、スマホは少し中央寄せ） */}
            <div
              style={{
                display: "flex",
                justifyContent: isWidePC ? "flex-start" : "flex-start",
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

            <div
              style={{
                marginTop: "clamp(6px, 1.4dvh, 10px)",
                marginBottom: "clamp(8px, 2.0dvh, 14px)",
                color: "rgba(255,255,255,0.85)",
                fontSize: "clamp(12px, 1.2vw, 14px)",
                lineHeight: 1.5,
              }}
            >
              ひろっちの釣りライフ、今日も一投いこ？
            </div>

            {/* ボタン群：スマホもPCも「5つ全部同サイズ」 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, max-content)",
                gap: ui.gap,
                alignItems: "center",
                justifyItems: "start",
                // PCは少しだけ詰めて「1画面にキュッ」っと
                marginTop: "clamp(6px, 1.2dvh, 10px)",
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

              {/* 設定：同サイズで“5個目”として整列（2列なので左下に来るのが自然） */}
              <ImgButton
                src="/assets/buttons/btn-settings.png"
                alt="設定"
                onClick={() => go("settings")}
                width={ui.btnW}
              />
            </div>

            {/* スマホは下に余裕を作る（キャラが下にいるので、視覚的な被り回避） */}
            <div style={{ height: isPortrait ? "clamp(8px, 8dvh, 56px)" : "clamp(8px, 4dvh, 24px)" }} />
          </div>

          {/* PCの右側は“空間”として確保（キャラの見せ場） */}
          {isWidePC && <div aria-hidden="true" />}
        </div>
      </div>
    </PageShell>
  );
}
