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

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/assets/slides/index.json", { cache: "no-store" });
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

    return ordered.map((k) => ({
      key: k,
      label: getCharLabel(k),
      albums: by[k] ?? [],
    }));
  }, [items]);

  return (
    <PageShell
      title="秘密アルバム"
      subtitle={null}
      showBack
      onBack={props.back}
      maxWidth={1200}
      scrollY="auto"
    >
      <div style={{ display: "grid", gap: 14 }}>
        {loading && <div style={{ opacity: 0.8, padding: "4px 2px" }}>読み込み中…</div>}

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

        {!loading && !err && grouped.every((g) => g.albums.length === 0) && (
          <div style={{ opacity: 0.8, padding: "4px 2px" }}>
            アルバムがまだないよ（index.json を確認してね）
          </div>
        )}

        {grouped.map((g) => {
          if (g.albums.length === 0) return null;
          return (
            <section key={g.key} style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 15, opacity: 0.95 }}>
                {g.label}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                }}
              >
                {g.albums.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => props.openAlbum(a.id, a.title)}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.08)",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "16 / 9",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "rgba(0,0,0,0.18)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {a.thumb ? (
                        <img
                          src={a.thumb}
                          alt={a.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "grid",
                            placeItems: "center",
                            opacity: 0.75,
                            fontSize: 12,
                          }}
                        >
                          no thumb
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 8, fontWeight: 800, fontSize: 13 }}>
                      {a.title}
                    </div>
                    <div style={{ marginTop: 3, opacity: 0.7, fontSize: 11 }}>
                      {a.id}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}