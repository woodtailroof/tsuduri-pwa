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

function useViewport() {
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
  }));

  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return vp;
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

  const { w, h } = useViewport();

  // ざっくり端末判定（Home専用のレイアウト最適化用）
  const isNarrow = w <= 820;
  const isShort = h <= 700;

  // タイトル（ロゴ）を「もっと大きく映える」方向へ
  // - PC: 大きめ
  // - スマホ縦: 上を食いすぎない範囲で最大化
  const logoHeight = isNarrow
    ? "clamp(96px, 16svh, 150px)"
    : "clamp(120px, 18svh, 220px)";

  // ボタンサイズ：画像に合わせて押し判定もぴったりにする
  // ※「ボタンが1画面に収まる」最優先で、高さが短い時は少しだけ小さく
  const btnW = isNarrow
    ? isShort
      ? "clamp(140px, 36vw, 220px)"
      : "clamp(150px, 38vw, 240px)"
    : isShort
      ? "clamp(190px, 18vw, 260px)"
      : "clamp(210px, 20vw, 300px)";

  const gap = isNarrow
    ? "clamp(10px, 2.4svh, 18px)"
    : "clamp(12px, 2.2svh, 22px)";

  // アセット（必要ならパスだけ合わせてね）
  const logoSrc = "/assets/logo/logo-title.png";

  const btnRecord = "/assets/buttons/btn-record.png";
  const btnHistory = "/assets/buttons/btn-history.png";
  const btnWeather = "/assets/buttons/btn-weather.png";
  const btnChat = "/assets/buttons/btn-chat.png";
  const btnSettings = "/assets/buttons/btn-settings.png";

  // “画像ぴったり”のクリック範囲にするための共通スタイル
  const imageButtonStyle: React.CSSProperties = {
    appearance: "none",
    border: "none",
    padding: 0, // ✅ 余白クリックを消す
    margin: 0,
    background: "transparent",
    cursor: "pointer",
    lineHeight: 0, // ✅ 画像下の謎の余白対策
    display: "inline-block",
    width: btnW,
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    userSelect: "none",
  };

  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "auto",
    display: "block", // ✅ 画像の下に余白が出るのを防止
    filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.22))",
  };

  return (
    <PageShell
      // Homeは戻るボタン不要なら false に（必要なら消してOK）
      showBack={false}
      maxWidth={1400}
      // title/subtitleのテキストは使わず、Home内で“1画面設計”を完結させる
      title={null}
      subtitle={null}
    >
      {/* 画面スクロールを出さないため、Home内で1画面レイアウトを組む */}
      <div
        style={{
          // PageShell内側のpadding分を見込んで、余裕を持たせつつ「1画面」に収める
          minHeight: "calc(100svh - 48px)",
          display: "grid",
          gridTemplateColumns: isNarrow
            ? "1fr"
            : "minmax(520px, 1fr) minmax(320px, 1fr)",
          alignItems: "center",
          columnGap: isNarrow ? 0 : "clamp(18px, 3vw, 36px)",
          rowGap: "clamp(10px, 2svh, 18px)",
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? "auto" : "none",
        }}
      >
        {/* 左：ロゴ＋ボタン群 */}
        <div
          style={{
            display: "grid",
            justifyItems: isNarrow ? "center" : "start",
            alignContent: "center",
            gap,
            minWidth: 0,
          }}
        >
          {/* ロゴ（大きく映える） */}
          <div
            style={{
              width: isNarrow ? "min(92vw, 760px)" : "min(58vw, 820px)",
              maxWidth: "100%",
            }}
          >
            <img
              src={logoSrc}
              alt="釣嫁つづり"
              style={{
                height: logoHeight,
                width: "100%",
                objectFit: "contain",
                display: "block",
                filter: "drop-shadow(0 16px 30px rgba(0,0,0,0.25))",
              }}
            />
          </div>

          {/* ボタン：2×2 + 設定（1画面に収める） */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap,
              justifyItems: "center",
              alignItems: "center",
              width: isNarrow ? "min(92vw, 520px)" : "min(52vw, 720px)",
              maxWidth: "100%",
            }}
          >
            <button
              type="button"
              onClick={() => go("record")}
              style={imageButtonStyle}
              aria-label="釣果を記録する"
            >
              <img
                src={btnRecord}
                alt=""
                style={imageStyle}
                draggable={false}
              />
            </button>

            <button
              type="button"
              onClick={() => go("archive")}
              style={imageButtonStyle}
              aria-label="全履歴を見る"
            >
              <img
                src={btnHistory}
                alt=""
                style={imageStyle}
                draggable={false}
              />
            </button>

            <button
              type="button"
              onClick={() => go("weather")}
              style={imageButtonStyle}
              aria-label="天気・潮を見る"
            >
              <img
                src={btnWeather}
                alt=""
                style={imageStyle}
                draggable={false}
              />
            </button>

            <button
              type="button"
              onClick={() => go("chat")}
              style={imageButtonStyle}
              aria-label="話す"
            >
              <img src={btnChat} alt="" style={imageStyle} draggable={false} />
            </button>

            {/* 設定：幅を他と揃えて“押し判定も画像ぴったり” */}
            <div
              style={{
                gridColumn: "1 / -1",
                display: "grid",
                justifyItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => go("settings")}
                style={imageButtonStyle}
                aria-label="設定"
              >
                <img
                  src={btnSettings}
                  alt=""
                  style={imageStyle}
                  draggable={false}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 右：空き（PC時はキャラが右下なので、ここは余白として生かす）
            スマホ時は1カラムなので表示されない */}
        {!isNarrow && <div aria-hidden="true" style={{ minHeight: 1 }} />}
      </div>

      {/* ロックUI（最前面。Home設計を崩さないように最後に置く） */}
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
    </PageShell>
  );
}
