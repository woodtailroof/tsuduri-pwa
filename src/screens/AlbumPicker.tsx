// src/screens/AlbumPicker.tsx
import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";

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

function appendAssetVersion(url: string, assetVersion: string) {
  const u = (url ?? "").trim();
  const av = (assetVersion ?? "").trim();
  if (!u || !av) return u;
  const encoded = encodeURIComponent(av);
  return u.includes("?") ? `${u}&av=${encoded}` : `${u}?av=${encoded}`;
}

const CHARACTER_ORDER = [
  "tsuduri",
  "matsuri",
  "kokoro",
  "lulu",
  "rin",
] as const;

const CHARACTER_LABEL: Record<string, string> = {
  tsuduri: "つづり",
  matsuri: "まつり",
  kokoro: "こころ",
  lulu: "るる",
  rin: "りん",
  other: "その他",
};

function getCharLabel(characterId: string | undefined): string {
  const id = (characterId ?? "").trim();
  if (!id) return CHARACTER_LABEL.other;
  return CHARACTER_LABEL[id] ?? id;
}

export default function AlbumPicker(props: Props) {
  const { settings } = useAppSettings();
  const assetVersion = String(settings.assetVersion ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<AlbumItem[]>([]);

  const [activeKey, setActiveKey] = useState<string>("all");
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const indexUrl = appendAssetVersion(
          "/assets/slides/index.json",
          assetVersion,
        );

        const res = await fetch(indexUrl, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`index.json fetch failed: ${res.status}`);

        const json = (await res.json()) as AlbumIndex;
        const list = Array.isArray(json?.albums) ? json.albums : [];

        const normalized = list.map((a) => ({
          ...a,
          thumb: a.thumb ? appendAssetVersion(a.thumb, assetVersion) : a.thumb,
        }));

        if (!cancelled) setItems(normalized);
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
  }, [assetVersion]);

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

  const selectedKey = tabs.some((t) => t.key === activeKey) ? activeKey : "all";
  const visibleAlbums =
    selectedKey === "all"
      ? allAlbums
      : (grouped.find((g) => g.key === selectedKey)?.albums ?? []);

  const hasAnyAlbum = allAlbums.length > 0;

  return (
    <PageShell title="秘密アルバム" showBack onBack={props.back} maxWidth={1200}>
      <style>{`
        .album-picker { display: grid; gap: 16px; padding-bottom: env(safe-area-inset-bottom); }
        .album-filters { display: flex; flex-wrap: wrap; gap: 8px; }
        .album-filter, .album-card {
          border: 1px solid rgba(255,255,255,.2);
          background: rgba(255,255,255,.08);
          color: inherit;
          cursor: pointer;
        }
        .album-filter { border-radius: 999px; min-height: 36px; padding: 6px 12px; font-weight: 700; }
        .album-filter[aria-pressed="true"] { background: rgba(255,255,255,.22); }
        .album-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .album-card { display: block; width: 100%; min-width: 0; border-radius: 16px; overflow: hidden; padding: 0; text-align: left; }
        .album-card-image {
          display: block;
          width: 100%;
          position: relative;
          aspect-ratio: 4 / 3;
          overflow: hidden;
          background: rgba(0,0,0,.22);
        }
        .album-card-image img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; min-height: 0; object-fit: cover; object-position: center 35%; }
        .album-card-title { display: block; padding: 10px 12px; font-size: 15px; font-weight: 800; overflow-wrap: anywhere; }
        @media (max-width: 820px) {
          .album-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .album-card-image { aspect-ratio: 4 / 5; }
        }
        @media (orientation: landscape) and (max-height: 520px) and (pointer: coarse) {
          .album-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .album-card-image { aspect-ratio: 4 / 3; }
          .album-card { backdrop-filter: none; }
        }
        @media (max-width: 350px) {
          .album-grid { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
      <div className="album-picker">
        {loading && <div role="status">読み込み中…</div>}
        {err && <div role="alert">index.json を読めなかったよ: {err}</div>}
        {!loading && !err && !hasAnyAlbum && <div>アルバムがまだないよ</div>}
        {hasAnyAlbum && (
          <div className="album-filters" role="group" aria-label="キャラクターで絞り込み">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className="album-filter"
                aria-pressed={t.key === selectedKey}
                onClick={() => setActiveKey(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="album-grid">
          {visibleAlbums.map((a) => (
            <button
              key={a.id}
              type="button"
              className="album-card"
              onClick={() => props.openAlbum(a.id, a.title)}
            >
              <span className="album-card-image">
                {a.thumb && <img src={a.thumb} alt="" loading="lazy" draggable={false} />}
              </span>
              <span className="album-card-title">{a.title || a.id}</span>
            </button>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
