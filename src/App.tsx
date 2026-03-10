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
import RecordAnalysis from "./screens/RecordAnalysis";
import Weather from "./screens/Weather";
import Chat from "./screens/Chat";
import Settings from "./screens/Settings";
import CharacterSettings from "./screens/CharacterSettings";
import AlbumPicker from "./screens/AlbumPicker";
import AlbumViewer from "./screens/AlbumViewer";
import Stage from "./components/Stage";
import FadeSwitch from "./components/FadeSwitch";
import LockScreen from "./components/LockScreen";
import {
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  type BgMode,
  useAppSettings,
} from "./lib/appSettings";
import { EmotionProvider, useEmotion } from "./lib/emotion";
import { isSessionUnlocked, migrateLegacyPlaintextLock } from "./lib/appLock";

type Screen =
  | "home"
  | "record"
  | "recordHistory"
  | "recordAnalysis"
  | "weather"
  | "chat"
  | "settings"
  | "characterSettings"
  | "albumPicker"
  | "albumViewer";

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
  const { clearEmotion } = useEmotion();
  const minuteTick = useMinuteTick();

  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedAlbumTitle, setSelectedAlbumTitle] = useState<string>("");

  const [lockReady, setLockReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        await migrateLegacyPlaintextLock();

        if (!alive) return;
        setUnlocked(isSessionUnlocked());
      } catch (err) {
        console.error(err);
        setUnlocked(false);
      } finally {
        if (alive) setLockReady(true);
      }
    }

    void boot();

    return () => {
      alive = false;
    };
  }, []);

  // ✅ 現在画面を常に通知
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("tsuduri-screen-change", {
        detail: { screen },
      }),
    );
  }, [screen]);

  // ✅ 親側でも保険で weather 感情を消す
  useEffect(() => {
    if (screen !== "weather") {
      clearEmotion("weather");
    }
  }, [screen, clearEmotion]);

  const backHome = () => setScreen("home");

  const goFromHome = (
    s:
      | "record"
      | "recordHistory"
      | "recordAnalysis"
      | "weather"
      | "chat"
      | "settings",
  ) => setScreen(s);

  const openAlbum = (albumId: string, title?: string) => {
    setSelectedAlbumId(albumId);
    setSelectedAlbumTitle(title ?? "");
    setScreen("albumViewer");
  };

  let content: ReactNode;

  if (screen === "record") {
    content = <Record back={backHome} />;
  } else if (screen === "recordHistory") {
    content = <RecordHistory back={backHome} />;
  } else if (screen === "recordAnalysis") {
    content = <RecordAnalysis back={backHome} />;
  } else if (screen === "weather") {
    content = <Weather back={backHome} />;
  } else if (screen === "settings") {
    content = <Settings back={backHome} />;
  } else if (screen === "chat") {
    content = (
      <Chat
        back={backHome}
        goCharacterSettings={() => setScreen("characterSettings")}
      />
    );
  } else if (screen === "characterSettings") {
    content = <CharacterSettings back={() => setScreen("chat")} />;
  } else if (screen === "albumPicker") {
    content = (
      <AlbumPicker back={backHome} openAlbum={(id, t) => openAlbum(id, t)} />
    );
  } else if (screen === "albumViewer") {
    content = (
      <AlbumViewer
        back={() => setScreen("albumPicker")}
        albumId={selectedAlbumId ?? ""}
        albumTitleHint={selectedAlbumTitle}
      />
    );
  } else {
    content = (
      <Home go={goFromHome} goSecret={() => setScreen("albumPicker")} />
    );
  }

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
    const bgBlurPx = Math.round(clamp(bgBlur, 0, 60));
    const glassBlurUnitless = Math.round(clamp(glassBlur, 0, 60));
    const ga = clamp(glassAlpha, 0, 1);
    const gas = clamp(glassAlpha + 0.13, 0, 1);

    const vars: CSSProperties & CSSVars = {
      "--bg-image":
        effectiveBgSrc && bgMode !== "off"
          ? `url("${effectiveBgSrc}")`
          : "none",
      "--bg-blur": `${bgBlurPx}px`,
      "--glass-blur": `${glassBlurUnitless}`,
      "--glass-blur-px": `${glassBlurUnitless}px`,
      "--glass-alpha": `${ga}`,
      "--glass-alpha-strong": `${gas}`,
    };

    if (screen === "albumViewer") {
      vars["--bg-image"] = "none";
      vars["--bg-blur"] = "0px";
    }

    return vars;
  }, [effectiveBgSrc, bgMode, bgBlur, glassBlur, glassAlpha, screen]);

  const isCalmViewer = screen === "albumViewer";
  const skipFade = screen === "albumPicker" || screen === "albumViewer";

  if (!lockReady) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100dvh",
          background: "rgba(8,10,14,0.98)",
        }}
      />
    );
  }

  if (!unlocked) {
    return (
      <LockScreen
        onUnlocked={() => {
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <div
      id="app-root"
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        backgroundColor: isCalmViewer ? "rgba(0,0,0,0.86)" : undefined,
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

      {screen !== "albumViewer" && (
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
      )}

      <div
        id="layer-ui"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z.ui,
          pointerEvents: "auto",
        }}
      >
        {skipFade ? (
          content
        ) : (
          <FadeSwitch
            activeKey={screen}
            durationMs={260}
            coverAlpha={0.82}
            settleMs={90}
          >
            {content}
          </FadeSwitch>
        )}
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
