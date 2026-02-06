// src/screens/Home.tsx
import { useMemo } from "react";
import PageShell from "../components/PageShell";

type Props = {
  go: (s: "record" | "recordHistory" | "weather" | "chat" | "settings") => void;
};

type HomeItem = {
  key: "record" | "recordHistory" | "weather" | "chat" | "settings";
  label: string;
  // 画像ボタンを使ってる場合に備えて optional
  imgSrc?: string;
  alt?: string;
};

export default function Home({ go }: Props) {
  // 既存のボタン画像があるならここに合わせて差し替えてOK
  // imgSrc が未指定でも、普通の“ガラスボタン”で表示されるようにしてある
  const items = useMemo<HomeItem[]>(
    () => [
      {
        key: "record",
        label: "記録する",
        imgSrc: "/assets/ui/btn_record.png",
        alt: "記録する",
      },
      {
        key: "recordHistory",
        label: "履歴をみる",
        imgSrc: "/assets/ui/btn_history.png",
        alt: "履歴をみる",
      },
      {
        key: "weather",
        label: "天気・潮をみる",
        imgSrc: "/assets/ui/btn_weather.png",
        alt: "天気・潮をみる",
      },
      {
        key: "chat",
        label: "話す",
        imgSrc: "/assets/ui/btn_chat.png",
        alt: "話す",
      },
      {
        key: "settings",
        label: "設定",
        imgSrc: "/assets/ui/btn_settings.png",
        alt: "設定",
      },
    ],
    [],
  );

  // 画像が無い環境でも壊れないように “存在チェック” はせず、表示だけフォールバックする
  const wrapStyle: React.CSSProperties = {
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(10px, 2.2vh, 18px)",
    padding: "clamp(8px, 2.0vh, 18px) 0",
    overflow: "hidden", // ✅ Homeは絶対スクロール禁止
  };

  // ロゴの“縦食い”を抑える（画面が低いほど縮む）
  const logoStyle: React.CSSProperties = {
    width: "min(680px, 92vw)",
    maxWidth: "92vw",
    height: "auto",
    maxHeight: "clamp(110px, 22vh, 210px)", // ✅ ここが効く（高さに追従）
    objectFit: "contain",
    filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.35))",
    userSelect: "none",
    pointerEvents: "none",
  };

  // ボタン群は「残り高さの中で収める」ゾーン
  const buttonsArea: React.CSSProperties = {
    width: "min(520px, 92vw)",
    maxWidth: "92vw",
    flex: "1 1 auto",
    minHeight: 0,
    display: "grid",
    gridTemplateRows: `repeat(${items.length}, minmax(0, 1fr))`, // ✅ 余ったら均等、足りなければ圧縮
    gap: "clamp(10px, 2.0vh, 16px)",
    alignContent: "stretch",
    overflow: "hidden",
  };

  // 画像ボタンがある場合、ボタンの中で画像が“はみ出さない”ように
  const imgBtnStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
  };

  const fallbackBtnStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.20)",
    color: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(var(--glass-blur, 10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur, 10px))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    letterSpacing: "0.02em",
    boxShadow: "0 10px 22px rgba(0,0,0,0.25)",
  };

  const btnImageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.25))",
    userSelect: "none",
  };

  return (
    <PageShell
      // Homeは “タイトルなし” でOK（ロゴを主役にする）
      title={null}
      subtitle={null}
      maxWidth={980}
      showBack={false}
      scrollY="hidden" // ✅ PC側：Shell本文スクロールを殺す
      contentPadding="0 18px 18px"
    >
      <div style={wrapStyle}>
        {/* ロゴ（あるなら差し替え） */}
        <img
          src="/assets/ui/home_logo.png"
          alt="釣嫁ぷろじぇくと"
          style={logoStyle}
          draggable={false}
          onError={(e) => {
            // ロゴ画像が無い環境でもレイアウト崩れを防ぐ（非表示にする）
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />

        <div style={buttonsArea}>
          {items.map((it) => {
            const onClick = () => go(it.key);

            // 画像ボタンが存在しない場合はフォールバックのガラスボタンを表示
            if (!it.imgSrc) {
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={onClick}
                  style={fallbackBtnStyle}
                >
                  {it.label}
                </button>
              );
            }

            return (
              <button
                key={it.key}
                type="button"
                onClick={onClick}
                style={imgBtnStyle}
                aria-label={it.label}
              >
                <img
                  src={it.imgSrc}
                  alt={it.alt ?? it.label}
                  style={btnImageStyle}
                  draggable={false}
                  onError={(e) => {
                    // 画像が無い場合は “文字ボタン” に差し替え（1ボタンだけ壊れない）
                    const img = e.currentTarget as HTMLImageElement;
                    const parent =
                      img.parentElement as HTMLButtonElement | null;
                    if (parent) {
                      parent.style.border = fallbackBtnStyle.border as string;
                      parent.style.borderRadius = String(
                        fallbackBtnStyle.borderRadius,
                      );
                      parent.style.background =
                        fallbackBtnStyle.background as string;
                      parent.style.backdropFilter = String(
                        fallbackBtnStyle.backdropFilter,
                      );
                      (parent.style as any).WebkitBackdropFilter = String(
                        (fallbackBtnStyle as any).WebkitBackdropFilter,
                      );
                      parent.style.boxShadow =
                        fallbackBtnStyle.boxShadow as string;
                      parent.style.color = fallbackBtnStyle.color as string;
                      parent.style.fontWeight = String(
                        fallbackBtnStyle.fontWeight,
                      );
                      parent.style.letterSpacing = String(
                        fallbackBtnStyle.letterSpacing,
                      );
                      parent.style.display = "flex";
                      parent.style.alignItems = "center";
                      parent.style.justifyContent = "center";
                      parent.style.padding = "10px 14px";
                      parent.textContent = it.label;
                    }
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
