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

export default function AlbumViewer(props: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(props.albumTitleHint ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

  const [fs, setFs] = useState(false);

  const albumBase = useMemo(() => {
    const id = (props.albumId ?? "").trim();
    return id ? `/assets/slides/${id}` : "";
  }, [props.albumId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      setIdx(0);

      if (!albumBase) {
        setErr("albumId が空だよ");
        setLoading(false);
        return;
      }

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

        if (!cancelled) {
          setTitle(nextTitle);
          setFiles(nextFiles);
        }
      } catch (e) {
        if (!cancelled) setErr(safeText(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [albumBase, props.albumTitleHint]);

  const currentSrc = useMemo(() => {
    if (!albumBase) return "";
    if (!files.length) return "";
    const name = files[clamp(idx, 0, files.length - 1)];
    return `${albumBase}/${name}`;
  }, [albumBase, files, idx]);

  const prev = () => {
    if (!files.length) return;
    setIdx((v) => (v - 1 + files.length) % files.length);
  };

  const next = () => {
    if (!files.length) return;
    setIdx((v) => (v + 1) % files.length);
  };

  // クリック/タップで左右送り
  const onTap = (clientX: number, width: number) => {
    if (!files.length) return;
    const leftSide = clientX < width * 0.4;
    if (leftSide) prev();
    else next();
  };

  // キーボード（PC）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        props.back();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.back, files.length, idx]);

  // Fullscreen状態追従
  useEffect(() => {
    const onFsChange = () => setFs(isFullscreenNow());
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange" as any, onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange" as any, onFsChange);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      const root = rootRef.current;
      if (!root) return;
      if (isFullscreenNow()) await exitFs();
      else await requestFs(root);
      setFs(isFullscreenNow());
    } catch {
      // iOS Safariなどで不可のケースもある
    }
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.92)", // ✅ 落ち着く背景
        color: "#fff",
        overflow: "hidden",
        touchAction: "manipulation",
      }}
    >
      {/* 画像本体（フル表示 + containで自動余白） */}
      <div
        style={{ position: "absolute", inset: 0 }}
        onClick={(e) => {
          const rect = (
            e.currentTarget as HTMLDivElement
          ).getBoundingClientRect();
          onTap(e.clientX - rect.left, rect.width);
        }}
      >
        {currentSrc ? (
          <img
            src={currentSrc}
            alt={title || props.albumId}
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
            {loading
              ? "読み込み中…"
              : err
                ? "読み込みエラー"
                : "files が空だよ"}
          </div>
        )}
      </div>

      {/* 上オーバーレイ */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          padding:
            "max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 10px max(10px, env(safe-area-inset-left))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "grid", gap: 2, pointerEvents: "none" }}>
          <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.95 }}>
            {title || "アルバム"}
          </div>
          {files.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {idx + 1} / {files.length}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(0,0,0,0.35)",
              color: "inherit",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {fs ? "全画面OFF" : "全画面"}
          </button>

          <button
            type="button"
            onClick={props.back}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(0,0,0,0.35)",
              color: "inherit",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← 戻る
          </button>
        </div>
      </div>

      {/* 下オーバーレイ（薄いヒント） */}
      {files.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding:
              "10px max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))",
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.18)",
              fontSize: 12,
              opacity: 0.9,
            }}
          >
            左タップ: 前 / 右タップ: 次（PCは ← → / Fで全画面）
          </div>
        </div>
      )}

      {/* エラー表示（必要最低限） */}
      {err && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 56,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(255,100,100,0.45)",
            background: "rgba(255,80,80,0.14)",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          読めなかったよ: {err}
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            {albumBase ? `期待パス: ${albumBase}/manifest.json` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
