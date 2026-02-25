// src/screens/AlbumViewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import PageShell from "../components/PageShell";

type Props = {
  back: () => void;
  albumId: string;
  /** index.jsonのtitleをヒントとして表示（manifestが無い/読めない時の保険） */
  albumTitleHint?: string;
};

type AlbumManifest = {
  title?: string;
  files?: string[];
  intervalMs?: number;
};

function safeText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function AlbumViewer(props: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(props.albumTitleHint ?? "");
  const [files, setFiles] = useState<string[]>([]);

  const [idx, setIdx] = useState(0);

  // 自動再生
  const [playing, setPlaying] = useState(true);
  const [intervalMs, setIntervalMs] = useState<number>(1200);

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
        const res = await fetch(`${albumBase}/manifest.json`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`manifest.json fetch failed: ${res.status}`);
        }
        const json = (await res.json()) as AlbumManifest;

        const nextTitle = (json?.title ?? props.albumTitleHint ?? "").trim();
        const nextFiles = Array.isArray(json?.files) ? json.files.filter(Boolean) : [];
        const nextInterval =
          Number.isFinite(json?.intervalMs) ? Number(json.intervalMs) : 1200;

        if (!cancelled) {
          setTitle(nextTitle);
          setFiles(nextFiles);
          setIntervalMs(clamp(Math.floor(nextInterval), 250, 10_000));
          setPlaying(true);
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

  const nextSrc = useMemo(() => {
    if (!albumBase) return "";
    if (!files.length) return "";
    const next = (idx + 1) % files.length;
    const name = files[next];
    return `${albumBase}/${name}`;
  }, [albumBase, files, idx]);

  // 先読み（次の1枚だけ）
  useEffect(() => {
    if (!nextSrc) return;
    const img = new Image();
    img.src = nextSrc;
  }, [nextSrc]);

  const prev = () => {
    if (!files.length) return;
    setIdx((v) => (v - 1 + files.length) % files.length);
  };

  const next = () => {
    if (!files.length) return;
    setIdx((v) => (v + 1) % files.length);
  };

  // 自動再生
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    if (!files.length) return;

    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setIdx((v) => (v + 1) % files.length);
    }, intervalMs);

    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, intervalMs, files.length]);

  // キーボード（PC用）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        next();
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Escape") {
        e.preventDefault();
        props.back();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as any);
  }, [props, files.length]);

  const onTap = (clientX: number, width: number) => {
    if (!files.length) return;
    setPlaying(false);
    const leftSide = clientX < width * 0.4;
    if (leftSide) prev();
    else next();
  };

  return (
    <PageShell
      title={title || "アルバム"}
      subtitle={
        files.length
          ? `${idx + 1} / ${files.length}`
          : "manifest.json の files を用意してね"
      }
      showBack
      onBack={props.back}
      maxWidth={1100}
      scrollY="hidden"
    >
      <div style={{ display: "grid", gap: 10 }}>
        {loading && <div style={{ opacity: 0.8 }}>読み込み中…</div>}
        {err && (
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,100,100,0.45)",
              background: "rgba(255,80,80,0.12)",
            }}
          >
            読めなかったよ: {err}
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
              {albumBase ? `期待パス: ${albumBase}/manifest.json` : ""}
            </div>
          </div>
        )}

        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 18,
            overflow: "hidden",
            background: "rgba(0,0,0,0.20)",
            border: "1px solid rgba(255,255,255,0.14)",
            position: "relative",
            touchAction: "manipulation",
            userSelect: "none",
          }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
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
                opacity: 0.8,
              }}
            >
              {files.length ? "画像が空だよ" : "files がまだないよ"}
            </div>
          )}

          {/* ささやかな操作ヒント（後で消してOK） */}
          {files.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: 10,
                bottom: 10,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.18)",
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              左タップ: 前 / 右タップ: 次 / Space: 再生
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                prev();
              }}
              disabled={!files.length}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.10)",
                color: "inherit",
                cursor: files.length ? "pointer" : "not-allowed",
              }}
            >
              ◀
            </button>

            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={!files.length}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.10)",
                color: "inherit",
                cursor: files.length ? "pointer" : "not-allowed",
                minWidth: 90,
              }}
            >
              {playing ? "停止" : "再生"}
            </button>

            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                next();
              }}
              disabled={!files.length}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.10)",
                color: "inherit",
                cursor: files.length ? "pointer" : "not-allowed",
              }}
            >
              ▶
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ opacity: 0.85, fontSize: 12 }}>速度</div>
            <input
              type="range"
              min={250}
              max={3000}
              step={50}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              disabled={!files.length}
              style={{ width: 180 }}
            />
            <div style={{ opacity: 0.85, fontSize: 12, minWidth: 64 }}>
              {intervalMs}ms
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}