// src/App.tsx
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Home from "./screens/Home";
import Record from "./screens/Record";
import RecordHistory from "./screens/RecordHistory";
import Weather from "./screens/Weather";
import Chat from "./screens/Chat";
import Settings from "./screens/Settings";
import CharacterSettings from "./screens/CharacterSettings";
import Stage from "./components/Stage";
import FadeSwitch from "./components/FadeSwitch";
import {
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  type BgMode,
  useAppSettings,
} from "./lib/appSettings";
import { EmotionProvider } from "./lib/emotion";

type Screen =
  | "home"
  | "record"
  | "recordHistory"
  | "weather"
  | "chat"
  | "settings"
  | "characterSettings";

const Z = {
  bg: 0,
  stage: 10,
  ui: 20,
} as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useMinuteTick() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let timer: number | null = null;

    const arm = () => {
      const now = Date.now();
      const msToNextMinute = 60_000 - (now % 60_000) + 5;
      timer = window.setTimeout(() => {
        setTick((v) => v + 1);
        arm();
      }, msToNextMinute);
    };

    arm();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  return tick;
}

function AppInner() {
  const [screen, setScreen] = useState<Screen>("home");
  const { settings } = useAppSettings();
  const minuteTick = useMinuteTick();

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

  // ===== 背景解決 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;

  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw) || "/assets/bg/ui-check.png";

  const autoPreviewSrc = useMemo(() => {
    const band = getTimeBand(new Date());
    return resolveAutoBackgroundSrc(autoBgSet, band);
  }, [autoBgSet, minuteTick]);

  const effectiveBgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return autoPreviewSrc;
  }, [bgMode, fixedBgSrc, autoPreviewSrc]);

  const bgBlur = Number.isFinite(settings.bgBlur)
    ? settings.bgBlur
    : DEFAULT_SETTINGS.bgBlur;

  const glassAlpha = Number.isFinite(settings.glassAlpha)
    ? settings.glassAlpha
    : DEFAULT_SETTINGS.glassAlpha;

  const glassBlur = Number.isFinite(settings.glassBlur)
    ? settings.glassBlur
    : DEFAULT_SETTINGS.glassBlur;

  type CSSVars = Record<`--${string}`, string>;
  const appVars: CSSProperties & CSSVars = useMemo(() => {
    // ✅ ぼかしは「数値(unitless)」と「px」を両方セットして、参照側をpxに寄せる
    const gb = Math.round(clamp(glassBlur, 0, 60));
    const gbUnitless = String(gb);
    const gbPx = `${gb}px`;

    return {
      "--bg-image":
        effectiveBgSrc && bgMode !== "off"
          ? `url("${effectiveBgSrc}")`
          : "none",
      "--bg-blur": `${Math.round(clamp(bgBlur, 0, 60))}px`,

      // 互換・参照用
      "--glass-blur": gbUnitless,
      "--glass-blur-px": gbPx,

      "--glass-alpha": `${clamp(glassAlpha, 0, 1)}`,
      "--glass-alpha-strong": `${clamp(glassAlpha + 0.13, 0, 1)}`,
    };
  }, [effectiveBgSrc, bgMode, bgBlur, glassBlur, glassAlpha]);

  return (
    <div
      id="app-root"
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        ...appVars,
      }}
    >
      <div
        id="layer-bg"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z.bg,
          pointerEvents: "none",
        }}
      />

      <div
        id="layer-stage"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z.stage,
          pointerEvents: "none",
        }}
      >
        <Stage activeKey={screen} />
      </div>

      <div
        id="layer-ui"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z.ui,
          pointerEvents: "auto",
        }}
      >
        <FadeSwitch activeKey={screen}>{content}</FadeSwitch>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <EmotionProvider>
      <AppInner />
    </EmotionProvider>
  );
}
