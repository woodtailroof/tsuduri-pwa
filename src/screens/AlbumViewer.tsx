// src/screens/AlbumViewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isFullscreenNow(): boolean {
  const d = document as any;
  return Boolean(
    document.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.mozFullScreenElement ||
    d.msFullscreenElement,
  );
}

function canUseFullscreenApi(): boolean {
  const el = document.documentElement as any;
  return (
    !!el.requestFullscreen ||
    !!el.webkitRequestFullscreen ||
    !!el.mozRequestFullScreen ||
    !!el.msRequestFullscreen
  );
}

// ✅ モバイル判定
function isMobile(): boolean {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

async function requestFs(el: HTMLElement) {
  const anyEl = el as any;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (anyEl.webkitRequestFullscreen) return anyEl.webkitRequestFullscreen();
  if (anyEl.mozRequestFullScreen) return anyEl.mozRequestFullScreen();
  if (anyEl.msRequestFullscreen) return anyEl.msRequestFullscreen();
}

async function exitFs() {
  const d = document as any;
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

export default function AlbumViewer(props: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(props.albumTitleHint ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

  const [fs, setFs] = useState(false);

  // ✅ PCのみ表示
  const showFullscreenButton = !isMobile() && canUseFullscreenApi();

  const albumBase = useMemo(() => {
    const id = (props.albumId ?? "").trim();
    return id ? `/assets/slides/${id}` : "";
  }, [props.albumId]);

  const [shownSrc, setShownSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      setIdx(0);

      try {
        const res = await fetch(`${albumBase}/manifest.json`, {
          cache: "no-store",
        });
        if (!res.ok)
          throw new Error(`manifest.json fetch failed: ${res.status}`);
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

        const firstSrc = `${albumBase}/${nextFiles[0]}`;
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
  }, [albumBase, props.albumTitleHint]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!files.length) return;
      const nextSrc = `${albumBase}/${files[idx]}`;
      if (shownSrc === nextSrc) return;

      await preloadImage(nextSrc);
      if (!cancelled) setShownSrc(nextSrc);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [albumBase, files, idx, shownSrc]);

  const prev = () => {
    if (!files.length) return;
    setIdx((v) => (v - 1 + files.length) % files.length);
  };

  const next = () => {
    if (!files.length) return;
    setIdx((v) => (v + 1) % files.length);
  };

  const onTap = (clientX: number, width: number) => {
    if (!files.length) return;
    const leftSide = clientX < width * 0.4;
    if (leftSide) prev();
    else next();
  };

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;

    if (isFullscreenNow()) await exitFs();
    else await requestFs(root);

    setFs(isFullscreenNow());
  }

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
      }}
    >
      <div
        style={{ position: "absolute", inset: 0 }}
        onClick={(e) => {
          const rect = (
            e.currentTarget as HTMLDivElement
          ).getBoundingClientRect();
          onTap(e.clientX - rect.left, rect.width);
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

      {/* 上部オーバーレイ */}
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
        }}
      >
        <div style={{ pointerEvents: "none" }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          {files.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {idx + 1} / {files.length}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
          {showFullscreenButton && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
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
            onClick={props.back}
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
    </div>
  );
}
