// src/screens/AlbumPicker.tsx
import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";

type Props = {
  back: () => void;
};

type AlbumIndex = {
  albums: AlbumItem[];
};

type AlbumItem = {
  /** "tsuduri/sailor" みたいな識別子 */
  id: string;
  /** 表示名 */
  title: string;
  /** サムネURL（public配下の絶対パス想定） */
  thumb?: string;
  /** 任意: キャラやタグで後から絞り込みできる */
  characterId?: string;
  tags?: string[];
};

function safeText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default function AlbumPicker(props: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((a) => {
      const hay =
        `${a.title} ${a.id} ${(a.tags ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <PageShell
      title="秘密アルバム"
      subtitle="フォルダを選ぶと、その中をスライドショーできる"
      showBack
      onBack={props.back}
      maxWidth={920}
      scrollY="auto"
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="検索（例: つづり / sailor）"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.10)",
              color: "inherit",
              outline: "none",
            }}
          />
        </div>

        {loading && (
          <div style={{ opacity: 0.8, padding: "6px 2px" }}>読み込み中…</div>
        )}
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                // 次のステップで「スライド画面」に遷移させる
                alert(`選択: ${a.title}\n(id: ${a.id})`);
              }}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.10)",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.18)",
                  border: "1px solid rgba(255,255,255,0.14)",
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

              <div style={{ marginTop: 10, fontWeight: 700 }}>{a.title}</div>
              <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>
                {a.id}
              </div>
            </button>
          ))}
        </div>

        {!loading && !err && filtered.length === 0 && (
          <div style={{ opacity: 0.8, padding: "6px 2px" }}>
            該当するアルバムがないよ
          </div>
        )}
      </div>
    </PageShell>
  );
}
