// src/screens/AlbumPicker.tsx
import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";

type Props = {
  back: () => void;
  openAlbum: (albumId: string, title?: string) => void;
};

type AlbumIndex = {
  albums: AlbumItem[];
};

type AlbumItem = {
  id: string;
  title: string;
  thumb?: string;
  characterId?: string;
  tags?: string[];
};

function safeText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const CHARACTER_ORDER = ["tsuduri", "matsuri", "kokoro"] as const;

const CHARACTER_LABEL: Record<string, string> = {
  tsuduri: "つづり",
  matsuri: "まつり",
  kokoro: "こころ",
  other: "その他",
};

function getCharLabel(characterId: string | undefined): string {
  const id = (characterId ?? "").trim();
  if (!id) return CHARACTER_LABEL.other;
  return CHARACTER_LABEL[id] ?? id;
}

export default function AlbumPicker(props: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<AlbumItem[]>([]);

  // ✅ タブ（キャラ）＆ページング
  const [activeKey, setActiveKey] = useState<string>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch("/assets/slides/index.json", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`index.json fetch failed: ${res.status}`);
        const json = (await res.json()) as AlbumIndex;

        const list = Array.isArray(json?.albums) ? json.albums : [];
        if (!cancelled) setItems(list);
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
  }, []);

  const grouped = useMemo(() => {
    const by: Record<string, AlbumItem[]> = {};

    for (const a of items) {
      const key = (a.characterId ?? "other").trim() || "other";
      if (!by[key]) by[key] = [];
      by[key].push(a);
    }

    for (const k of Object.keys(by)) {
      by[k].sort((x, y) =>
        (x.title ?? x.id).localeCompare(y.title ?? y.id, "ja", {
          numeric: true,
          sensitivity: "base",
        }),
      );
    }

    const keys = new Set(Object.keys(by));
    const ordered: string[] = [];

    for (const id of CHARACTER_ORDER) {
      if (keys.has(id)) ordered.push(id);
      keys.delete(id);
    }
    if (keys.has("other")) {
      ordered.push("other");
      keys.delete("other");
    }
    ordered.push(
      ...Array.from(keys).sort((a, b) =>
        a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" }),
      ),
    );

    const groups = ordered.map((k) => ({
      key: k,
      label: getCharLabel(k),
      albums: by[k] ?? [],
    }));

    return groups;
  }, [items]);

  const allAlbums = useMemo(() => {
    return grouped.flatMap((g) => g.albums);
  }, [grouped]);

  const tabs = useMemo(() => {
    const list = [
      { key: "all", label: `全部（${allAlbums.length}）` },
      ...grouped
        .filter((g) => g.albums.length > 0)
        .map((g) => ({
          key: g.key,
          label: `${g.label}（${g.albums.length}）`,
        })),
    ];
    return list;
  }, [grouped, allAlbums.length]);

  // ✅ データが来たら、activeKey が空振りしないように補正
  useEffect(() => {
    const valid = new Set(tabs.map((t) => t.key));
    if (!valid.has(activeKey)) setActiveKey("all");
    // データが変わったらページは先頭に戻す（見失い防止）
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const visibleAlbums = useMemo(() => {
    if (activeKey === "all") return allAlbums;
    const g = grouped.find((x) => x.key === activeKey);
    return g?.albums ?? [];
  }, [activeKey, allAlbums, grouped]);

  // ✅ 1画面に収めるため、表示件数は固定でページング
  //    ここを増減すると「1画面の密度」が変わるよ
  const PAGE_SIZE = 9;

  const pageCount = Math.max(1, Math.ceil(visibleAlbums.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return visibleAlbums.slice(start, start + PAGE_SIZE);
  }, [visibleAlbums, safePage]);

  const hasAnyAlbum = allAlbums.length > 0;

  return (
    <PageShell
      title="秘密アルバム"
      subtitle={null}
      showBack
      onBack={props.back}
      maxWidth={1400}
      // ✅ スクロール禁止（1画面必須）
      scrollY="hidden"
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ✅ ロード中は“上に薄く”乗せるだけ（中身は消さない） */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              pointerEvents: "none",
              display: "grid",
              placeItems: "start",
            }}
          >
            <div
              style={{
                marginTop: 2,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              読み込み中…
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {err && (
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,100,100,0.45)",
                background: "rgba(255,80,80,0.12)",
              }}
            >
              index.json を読めなかったよ: {err}
            </div>
          )}

          {!loading && !err && !hasAnyAlbum && (
            <div style={{ opacity: 0.8, padding: "4px 2px" }}>
              アルバムがまだないよ（index.json を確認してね）
            </div>
          )}

          {/* タブ（キャラ切替） */}
          {hasAnyAlbum && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {tabs.map((t) => {
                const active = t.key === activeKey;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveKey(t.key)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: active
                        ? "1px solid rgba(255,255,255,0.30)"
                        : "1px solid rgba(255,255,255,0.14)",
                      background: active
                        ? "rgba(255,255,255,0.14)"
                        : "rgba(255,255,255,0.06)",
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      opacity: active ? 1 : 0.9,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}

              {/* ページング */}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage <= 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.18)",
                    color: "inherit",
                    cursor: safePage <= 0 ? "default" : "pointer",
                    fontSize: 12,
                    opacity: safePage <= 0 ? 0.45 : 0.9,
                  }}
                >
                  ←
                </button>

                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                  {safePage + 1} / {pageCount}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.18)",
                    color: "inherit",
                    cursor: safePage >= pageCount - 1 ? "default" : "pointer",
                    fontSize: 12,
                    opacity: safePage >= pageCount - 1 ? 0.45 : 0.9,
                  }}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ✅ サムネグリッド（カード型） */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            marginTop: 10,
            overflow: "hidden", // スクロール禁止
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {pageItems.map((a) => (
            <button
              key={a.id}
              onClick={() => props.openAlbum(a.id, a.title)}
              style={{
                textAlign: "left",
                padding: 10,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.18)",
                  // ✅ 画像が綺麗に見える“比率固定”
                  aspectRatio: "16 / 9",
                }}
              >
                {a.thumb ? (
                  <>
                    <img
                      src={a.thumb}
                      alt={a.title}
                      loading="lazy"
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        // ✅ ちょいだけコントラストを上げて見栄え良く
                        filter: "contrast(1.06) saturate(1.02)",
                        transform: "translateZ(0)",
                      }}
                    />
                    {/* ✅ 下にうっすらグラデ（文字が乗りやすい） */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: "55%",
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))",
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 10,
                        right: 10,
                        bottom: 8,
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: 0.2,
                        textShadow: "0 1px 10px rgba(0,0,0,0.55)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={a.title}
                    >
                      {a.title}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      opacity: 0.7,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    no thumb
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 8,
                  opacity: 0.65,
                  fontSize: 10,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={a.id}
              >
                {a.id}
              </div>
            </button>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
