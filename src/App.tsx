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

/** ✅ レイヤー順（背面→前面） */
const Z = {
  stage: 0,
  ui: 20,
} as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** ✅ number/ "12" / "12.3" を安全に number 化 */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** ✅ 1分ごとに更新（背景の時間帯追従） */
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

  // ✅ PageShellが持ってた「見た目変数」をAppで付与して全画面に効かせる
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

  // ✅ ここが今回の修正ポイント：文字列でも拾って数値化
  const bgDim = toNumber(settings.bgDim);
  const bgBlur = toNumber(settings.bgBlur);
  const glassAlpha = toNumber(settings.glassAlpha);
  const glassBlur = toNumber(settings.glassBlur);

  const effectiveBgDim =
    bgDim != null ? bgDim : DEFAULT_SETTINGS.bgDim;
  const effectiveBgBlur =
    bgBlur != null ? bgBlur : DEFAULT_SETTINGS.bgBlur;

  const effectiveGlassAlpha =
    glassAlpha != null ? glassAlpha : DEFAULT_SETTINGS.glassAlpha;
  const effectiveGlassBlur =
    glassBlur != null ? glassBlur : DEFAULT_SETTINGS.glassBlur;

  type CSSVars = Record<`--${string}`, string>;
  const appVars: CSSProperties & CSSVars = useMemo(() => {
    const ga = clamp(effectiveGlassAlpha, 0, 1);
    return {
      "--bg-image":
        effectiveBgSrc && bgMode !== "off"
          ? `url("${effectiveBgSrc}")`
          : "none",
      "--bg-blur": `${Math.round(clamp(effectiveBgBlur, 0, 60))}px`,
      "--bg-dim": `${clamp(effectiveBgDim, 0, 1)}`,

      "--glass-blur": `${Math.round(clamp(effectiveGlassBlur, 0, 60))}px`,
      "--glass-alpha": `${ga}`,
      "--glass-alpha-strong": `${clamp(ga + 0.13, 0, 1)}`,
    };
  }, [
    effectiveBgSrc,
    bgMode,
    effectiveBgBlur,
    effectiveBgDim,
    effectiveGlassBlur,
    effectiveGlassAlpha,
  ]);

  return (
    <div
      id="app-root"
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...appVars,
      }}
    >
      {/* ✅ 背景 + キャラ（常駐） */}
      <div
        id="layer-stage"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z.stage,
          pointerEvents: "none",
        }}
      >
        <Stage />
      </div>

      {/* ✅ UI（画面だけ切り替わる） */}
      <div
        id="layer-ui"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z.ui,
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <FadeSwitch activeKey={screen} durationMs={220} liftPx={6}>
          <div style={{ flex: "1 1 auto", minHeight: 0 }}>{content}</div>
        </FadeSwitch>
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