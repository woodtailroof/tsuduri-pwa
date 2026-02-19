// src/App.tsx
import { useState, type ReactNode } from "react";
import Home from "./screens/Home";
import Record from "./screens/Record";
import RecordHistory from "./screens/RecordHistory";
import Weather from "./screens/Weather";
import Chat from "./screens/Chat";
import Settings from "./screens/Settings";
import CharacterSettings from "./screens/CharacterSettings";
import { EmotionProvider } from "./lib/emotion";

type Screen =
  | "home"
  | "record"
  | "recordHistory"
  | "weather"
  | "chat"
  | "settings"
  | "characterSettings";

/**
 * ✅ レイヤー順（背面→前面）
 * 1) 背景
 * 2) キャラ
 * 3) ヘッダー（PageShellの title/戻る）
 * 4) 情報（各画面の中身）
 *
 * ※ 3) と 4) は PageShell 側の z-index で担保する前提
 *    App 側は 1)2) と「UIの土台」を固定する。
 */
const Z = {
  bg: 0,
  char: 10,
  ui: 20,
} as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  const backHome = () => setScreen("home");

  const goFromHome = (
    s: "record" | "recordHistory" | "weather" | "chat" | "settings",
  ) => setScreen(s);

  let content: ReactNode;

  if (screen === "record") content = <Record back={backHome} />;
  else if (screen === "recordHistory")
    content = <RecordHistory back={backHome} />;
  else if (screen === "weather") content = <Weather back={backHome} />;
  else if (screen === "settings") content = <Settings back={backHome} />;
  else if (screen === "chat") {
    content = (
      <Chat
        back={backHome}
        goCharacterSettings={() => setScreen("characterSettings")}
      />
    );
  } else if (screen === "characterSettings") {
    content = <CharacterSettings back={() => setScreen("chat")} />;
  } else {
    content = <Home go={goFromHome} />;
  }

  return (
    <EmotionProvider>
      <div
        id="app-root"
        style={{
          width: "100vw",
          height: "100dvh",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* ✅ 背景レイヤー（最背面） */}
        <div
          id="layer-bg"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: Z.bg,
            pointerEvents: "none",
          }}
        />

        {/* ✅ キャラレイヤー（背景の上 / UIの下） */}
        <div
          id="layer-character"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: Z.char,
            pointerEvents: "none",
          }}
        />

        {/* ✅ UIレイヤー（PageShellや各画面の情報は全部ここ） */}
        <div
          id="layer-ui"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: Z.ui,
            pointerEvents: "auto",
            // PageShell が 100dvh で設計されてるので、ここも同じ器にする
            display: "block",
          }}
        >
          {content}
        </div>
      </div>
    </EmotionProvider>
  );
}
