// src/App.tsx
import {
  useEffect,
  useMemo,
  useRef,
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
import { EmotionProvider } from "./lib/emotion";
import { isSessionUnlocked, migrateLegacyPlaintextLock } from "./lib/appLock";
import { syncTrips } from "./lib/tripSync";

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
  const minuteTick = useMinuteTick();

  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedAlbumTitle, setSelectedAlbumTitle] = useState<string>("");

  const [lockReady, setLockReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // 同期状態
  const syncRunningRef = useRef(false);
  const initialSyncDoneRef = useRef(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState("");

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

  async function runAppSync(reason: "boot" | "online" | "manual-save") {
    if (syncRunningRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    syncRunningRef.current = true;
    setSyncBusy(true);
    setSyncError("");

    try {
      const result = await syncTrips();

      if (!result.ok) {
        const msg =
          result.errors && result.errors.length > 0
            ? result.errors.join(" / ")
            : "同期に失敗したよ";
        setSyncError(msg);
        console.warn(`[tripSync:${reason}]`, msg);
      } else {
        setSyncError("");
        console.info(
          `[tripSync:${reason}] pushed=${result.pushedTrips}/${result.pushedFish}/${result.pushedPhotos}, pulled=${result.pulledTrips}/${result.pulledFish}/${result.pulledPhotos}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
      console.error(`[tripSync:${reason}]`, err);
    } finally {
      syncRunningRef.current = false;
      setSyncBusy(false);
    }
  }

  // 起動後の初回同期
  useEffect(() => {
    if (!lockReady || !unlocked) return;
    if (initialSyncDoneRef.current) return;

    initialSyncDoneRef.current = true;
    void runAppSync("boot");
  }, [lockReady, unlocked]);

  // オンライン復帰で再同期
  useEffect(() => {
    if (!lockReady || !unlocked) return;

    const onOnline = () => {
      void runAppSync("online");
    };

    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [lockReady, unlocked]);

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
    content = (
      <Record
        back={backHome}
        onSaved={() => {
          void runAppSync("manual-save");
        }}
      />
    );
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
          <Stage
            activeKey={screen}
            forcedExpression={screen === "home" ? "neutral" : undefined}
          />
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
        {(syncBusy || syncError) && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              zIndex: 999,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              pointerEvents: "none",
            }}
          >
            {syncBusy && (
              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.82)",
                  background: "rgba(0,0,0,0.26)",
                }}
              >
                ☁️ 同期中…
              </div>
            )}

            {!syncBusy && syncError && (
              <div
                className="glass glass-strong"
                style={{
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#ffb3c1",
                  background: "rgba(0,0,0,0.30)",
                  maxWidth: "min(80vw, 480px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={syncError}
              >
                ⚠ 同期失敗
              </div>
            )}
          </div>
        )}

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
