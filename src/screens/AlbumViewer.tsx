// src/screens/AlbumViewer.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { useAppSettings } from "../lib/appSettings";

type Props = {
  back: () => void;
  albumId: string;
  albumTitleHint?: string;
};

type AlbumManifest = {
  title?: string;
  files?: string[];
};

function safeText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function appendAssetVersion(url: string, assetVersion: string) {
  const u = (url ?? "").trim();
  const av = (assetVersion ?? "").trim();
  if (!u || !av) return u;
  const encoded = encodeURIComponent(av);
  return u.includes("?") ? `${u}&av=${encoded}` : `${u}?av=${encoded}`;
}

function isFullscreenNow(): boolean {
  const d = document as {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };

  return Boolean(
    document.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.mozFullScreenElement ||
    d.msFullscreenElement,
  );
}

function canUseFullscreenApi(): boolean {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  return Boolean(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen,
  );
}

function isMobileDevice(): boolean {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

async function requestFs(el: HTMLElement) {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  if (el.requestFullscreen) return el.requestFullscreen();
  if (anyEl.webkitRequestFullscreen) return anyEl.webkitRequestFullscreen();
  if (anyEl.mozRequestFullScreen) return anyEl.mozRequestFullScreen();
  if (anyEl.msRequestFullscreen) return anyEl.msRequestFullscreen();
}

async function exitFs() {
  const d = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };

  if (document.exitFullscreen) return document.exitFullscreen();
  if (d.webkitExitFullscreen) return d.webkitExitFullscreen();
  if (d.mozCancelFullScreen) return d.mozCancelFullScreen();
  if (d.msExitFullscreen) return d.msExitFullscreen();
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function clampIndex(n: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, n));
}

export default function AlbumViewer(props: Props) {
  const { settings } = useAppSettings();
  const assetVersion = String(settings.assetVersion ?? "").trim();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const thumbRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(props.albumTitleHint ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

  const [fs, setFs] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);

  const mobile = isMobileDevice();
  const showFullscreenButton = !mobile && canUseFullscreenApi();

  const albumBase = useMemo(() => {
    const id = (props.albumId ?? "").trim();
    return id ? `/assets/slides/${id}` : "";
  }, [props.albumId]);

  const manifestUrl = useMemo(() => {
    return albumBase
      ? appendAssetVersion(`${albumBase}/manifest.json`, assetVersion)
      : "";
  }, [albumBase, assetVersion]);

  const buildSlideSrc = useMemo(() => {
    return (file: string) =>
      appendAssetVersion(`${albumBase}/${file}`, assetVersion);
  }, [albumBase, assetVersion]);

  const [shownSrc, setShownSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      setIdx(0);
      setControlsVisible(false);

      try {
        if (!manifestUrl) {
          throw new Error("albumId が空だよ");
        }

        const res = await fetch(manifestUrl, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`manifest.json fetch failed: ${res.status}`);
        }

        const json = (await res.json()) as AlbumManifest;

        const nextTitle = (json?.title ?? props.albumTitleHint ?? "").trim();
        const nextFiles = Array.isArray(json?.files)
          ? json.files.filter(Boolean)
          : [];

        if (cancelled) return;

        setTitle(nextTitle);
        setFiles(nextFiles);

        if (nextFiles.length === 0) {
          setShownSrc("");
          setLoading(false);
          return;
        }

        const firstSrc = buildSlideSrc(nextFiles[0]);
        await preloadImage(firstSrc);

        if (cancelled) return;

        setShownSrc(firstSrc);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setErr(safeText(e));
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [manifestUrl, buildSlideSrc, props.albumTitleHint]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!files.length) return;

      const nextFile = files[idx];
      if (!nextFile) return;

      const nextSrc = buildSlideSrc(nextFile);
      if (shownSrc === nextSrc) return;

      await preloadImage(nextSrc);
      if (!cancelled) setShownSrc(nextSrc);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [buildSlideSrc, files, idx, shownSrc]);

  useEffect(() => {
    if (!controlsVisible) return;

    const el = thumbRefs.current[idx];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [idx, controlsVisible]);

  useEffect(() => {
    const onFsChange = () => {
      setFs(isFullscreenNow());
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("mozfullscreenchange", onFsChange);
    document.addEventListener("MSFullscreenChange", onFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      document.removeEventListener("mozfullscreenchange", onFsChange);
      document.removeEventListener("MSFullscreenChange", onFsChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!files.length) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Home") {
        e.preventDefault();
        jumpTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        jumpTo(files.length - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        setControlsVisible((v) => !v);
      } else if (e.key.toLowerCase() === "f" && showFullscreenButton) {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === "Escape") {
        e.preventDefault();
        props.back();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, showFullscreenButton, props.back]);

  const prev = () => {
    if (!files.length) return;
    setIdx((v) => (v - 1 + files.length) % files.length);
  };

  const next = () => {
    if (!files.length) return;
    setIdx((v) => (v + 1) % files.length);
  };

  const jumpTo = (nextIndex: number) => {
    if (!files.length) return;
    setIdx(clampIndex(nextIndex, files.length));
  };

  const onTap = (
    clientX: number,
    width: number,
    clientY: number,
    height: number,
  ) => {
    if (!files.length) return;

    const bottomHotZone = clientY > height * 0.72;

    if (mobile && bottomHotZone) {
      setControlsVisible((v) => !v);
      return;
    }

    const leftSide = clientX < width * 0.4;
    if (leftSide) prev();
    else next();
  };

  function handleMouseMove(clientY: number, height: number) {
    if (mobile) return;
    const bottomHotZone = clientY > height * 0.72;
    setControlsVisible(bottomHotZone);
  }

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;

    if (isFullscreenNow()) await exitFs();
    else await requestFs(root);

    setFs(isFullscreenNow());
  }

  const stopOverlayEvent = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        color: "#fff",
        overflow: "hidden",
        touchAction: "manipulation",
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        handleMouseMove(e.clientY - rect.top, rect.height);
      }}
      onMouseLeave={() => {
        if (!mobile) setControlsVisible(false);
      }}
    >
      <div
        style={{ position: "absolute", inset: 0 }}
        onClick={(e) => {
          const rect = (
            e.currentTarget as HTMLDivElement
          ).getBoundingClientRect();
          onTap(
            e.clientX - rect.left,
            rect.width,
            e.clientY - rect.top,
            rect.height,
          );
        }}
      >
        {shownSrc ? (
          <img
            src={shownSrc}
            alt={title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              userSelect: "none",
            }}
            draggable={false}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              opacity: 0.85,
            }}
          >
            {loading ? "読み込み中…" : (err ?? "files が空だよ")}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "12px",
          display: "flex",
          justifyContent: "space-between",
          pointerEvents: "none",
          opacity: controlsVisible || !shownSrc ? 1 : 0.25,
          transition: "opacity 180ms ease",
        }}
      >
        <div style={{ pointerEvents: "none" }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
        </div>

        <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
          {showFullscreenButton && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleFullscreen();
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(0,0,0,0.4)",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {fs ? "全画面OFF" : "全画面"}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              props.back();
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.4)",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← 戻る
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div
          onClick={stopOverlayEvent}
          onPointerDown={stopOverlayEvent}
          onTouchStart={stopOverlayEvent}
          style={{
            position: "absolute",
            left: "max(10px, env(safe-area-inset-left))",
            right: "max(10px, env(safe-area-inset-right))",
            bottom: "max(10px, env(safe-area-inset-bottom))",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(0,0,0,0.42)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            padding: mobile ? "10px 10px 12px" : "10px 12px 12px",
            display: "grid",
            gap: 10,
            pointerEvents: controlsVisible ? "auto" : "none",
            opacity: controlsVisible ? 1 : 0,
            transform: controlsVisible ? "translateY(0)" : "translateY(18px)",
            transition: "opacity 180ms ease, transform 180ms ease",
          }}
        >
          <div
            ref={stripRef}
            onWheel={(e) => {
              const el = stripRef.current;
              if (!el) return;
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                el.scrollLeft += e.deltaY;
              }
            }}
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              overscrollBehaviorX: "contain",
              paddingBottom: 2,
              scrollbarWidth: "thin",
            }}
          >
            {files.map((file, i) => {
              const selected = i === idx;
              const src = buildSlideSrc(file);

              return (
                <button
                  key={`${file}-${i}`}
                  ref={(el) => {
                    thumbRefs.current[i] = el;
                  }}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpTo(i);
                  }}
                  title={`${i + 1} / ${files.length}`}
                  style={{
                    flex: "0 0 auto",
                    width: mobile ? 58 : "clamp(54px, 8vw, 86px)",
                    height: mobile ? 58 : "clamp(54px, 8vw, 86px)",
                    borderRadius: 12,
                    border: selected
                      ? "2px solid rgba(255,255,255,0.95)"
                      : "1px solid rgba(255,255,255,0.20)",
                    background: selected
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(0,0,0,0.28)",
                    padding: 3,
                    cursor: "pointer",
                    boxShadow: selected
                      ? "0 0 0 3px rgba(255,122,162,0.35)"
                      : "none",
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: 9,
                      display: "block",
                      opacity: selected ? 1 : 0.76,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {!mobile && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "46px 1fr 46px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.72,
                  textAlign: "left",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                1
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                <input
                  type="range"
                  min={0}
                  max={files.length - 1}
                  step={1}
                  value={idx}
                  onChange={(e) => jumpTo(Number(e.target.value))}
                  style={{
                    width: "100%",
                    accentColor: "#ff7aa2",
                  }}
                />

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.86,
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {idx + 1} / {files.length}
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  opacity: 0.72,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {files.length}
              </div>
            </div>
          )}

          {mobile && (
            <div
              style={{
                fontSize: 12,
                opacity: 0.86,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {idx + 1} / {files.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
