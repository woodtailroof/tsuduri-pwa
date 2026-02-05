// src/screens/Settings.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { FIXED_PORT } from "../points";
import {
  deleteTideCacheAll,
  deleteTideCacheByKey,
  deleteTideCacheOlderThan,
  forceRefreshTide736Day,
  getTideCacheStats,
  listTideCacheEntries,
} from "../lib/tide736Cache";
import type { TideCacheEntry } from "../db";
import PageShell from "../components/PageShell";
import {
  AUTO_BG_SETS,
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  type BgMode,
  type BgTimeBand,
  useAppSettings,
} from "../lib/appSettings";
import { CHARACTERS_STORAGE_KEY } from "./CharacterSettings";

type Props = { back: () => void };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type CharacterOption = { id: string; label: string };

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadCreatedCharacters(): CharacterOption[] {
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<any[]>(raw, []);
  return list
    .map((c) => ({
      id: typeof c?.id === "string" ? c.id : "",
      label:
        typeof c?.name === "string"
          ? c.name
          : typeof c?.label === "string"
            ? c.label
            : "",
    }))
    .filter((c) => c.id && c.label);
}

export default function Settings({ back }: Props) {
  const { settings, set, reset } = useAppSettings();

  const [entries, setEntries] = useState<TideCacheEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState<30 | 60 | 90 | 180>(30);

  const [createdCharacters, setCreatedCharacters] = useState<CharacterOption[]>(
    [],
  );

  useEffect(() => {
    (async () => {
      setStats(await getTideCacheStats());
      setEntries(await listTideCacheEntries());
      setCreatedCharacters(loadCreatedCharacters());
    })();
  }, []);

  const nowBand: BgTimeBand = getTimeBand(new Date());
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet = settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet;
  const autoPreviewSrc = resolveAutoBackgroundSrc(autoBgSet, nowBand);

  const sectionTitle: CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 900,
  };

  const card: CSSProperties = {
    borderRadius: 16,
    padding: 14,
    display: "grid",
    gap: 12,
  };

  return (
    <PageShell
      title={<h1 style={{ margin: 0 }}>⚙ 設定</h1>}
      maxWidth={980}
      showBack
      onBack={back}
    >
      {/* 画面全体を縦Flexで固定 */}
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          gap: 12,
        }}
      >
        {/* スクロール領域 */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 2,
            display: "grid",
            gap: 16,
          }}
        >
          <div className="glass glass-strong" style={card}>
            <h2 style={sectionTitle}>👧 キャラクター</h2>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              作成キャラ数：{createdCharacters.length}
            </div>
          </div>

          <div className="glass glass-strong" style={card}>
            <h2 style={sectionTitle}>🖼 背景</h2>
            <div style={{ fontSize: 12 }}>
              現在の自動背景：<code>{autoPreviewSrc}</code>
            </div>
          </div>

          <div className="glass glass-strong" style={card}>
            <h2 style={sectionTitle}>🌊 tide736 キャッシュ</h2>

            <button
              onClick={async () => {
                if (!confirm("全削除する？")) return;
                setBusy("all");
                await deleteTideCacheAll();
                setEntries(await listTideCacheEntries());
                setBusy(null);
              }}
            >
              🗑 全削除
            </button>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              件数：{stats?.count ?? "—"}
            </div>
          </div>
        </div>

        {/* 下部固定ボタン */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              if (!confirm("初期化する？")) return;
              reset();
            }}
          >
            🔁 初期化
          </button>
          <button onClick={() => set({ ...settings })}>✅ 保存</button>
        </div>
      </div>
    </PageShell>
  );
}
