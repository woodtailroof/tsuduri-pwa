// src/screens/AlbumViewer.tsx
import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";

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

export default function AlbumViewer(props: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(props.albumTitleHint ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

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
        if (!res.ok) throw new Error(`manifest.json fetch failed: ${res.status}`);

        const json = (await res.json()) as AlbumManifest;

        const nextTitle = (json?.title ?? props.albumTitleHint ?? "").trim();
        const nextFiles = Array.isArray(json?.files) ? json.files.filter(Boolean) : [];

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
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.back, files.length]);

  const onTap = (clientX: number, width: number) => {
    if (!files.length) return;
    const leftSide = clientX < width * 0.4;
    if (leftSide) prev();
    else next();
  };

  return (
    <PageShell
      title={title || "アルバム"}
      subtitle={files.length ? `${idx + 1} / ${files.length}` : ""}
      showBack
      onBack={props.back}
      maxWidth={9999}
      scrollY="hidden"
      contentPadding={0}
    >
      {/* フル画面で "contain"。縦横どっちでも自動余白が出る */}
      <div
        style={{
          height: "100%",
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr)",
        }}
      >
        {loading && (
          <div style={{ opacity: 0.85, padding: 12, pointerEvents: "none" }}>
            読み込み中…
          </div>
        )}

        {err && (
          <div
            style={{
              margin: 12,
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
            position: "relative",
            width: "100%",
            height: "100%",
            minHeight: 0,
            overflow: "hidden",
            background: "rgba(0,0,0,0.18)",
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
                objectFit: "contain", // ✅ 端末の向きに応じて自動余白
                display: "block",
              }}
              draggable={false}
            />
          ) : (
            !loading &&
            !err && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  opacity: 0.85,
                }}
              >
                manifest.json の files が空だよ
              </div>
            )
          )}

          {/* 最小の操作ヒント（不要なら後で消せる） */}
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
                pointerEvents: "none",
              }}
            >
              左タップ: 前 / 右タップ: 次（← → でもOK）
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}