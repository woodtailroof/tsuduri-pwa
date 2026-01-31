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

type Props = {
  back: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type CharacterOption = { id: string; label: string };

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
};

function loadCreatedCharacters(): CharacterOption[] {
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  return list
    .map((c) => ({
      id: typeof c.id === "string" ? c.id : "",
      label:
        typeof c.name === "string"
          ? c.name
          : typeof c.label === "string"
            ? c.label
            : "",
    }))
    .filter((c) => c.id && c.label);
}

export default function Settings({ back }: Props) {
  const { settings, set, reset } = useAppSettings();
  const minuteTick = useMemo(() => Date.now(), []);

  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;

  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet) || "surf";

  const fixedBgSrcRaw = settings.fixedBgSrc ?? "";
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw || "") || "/assets/bg/ui-check.png";

  const nowBand: BgTimeBand = useMemo(() => {
    return getTimeBand(new Date());
  }, [minuteTick]);

  const autoPreviewSrc = useMemo(
    () => resolveAutoBackgroundSrc(autoBgSet, nowBand),
    [autoBgSet, nowBand],
  );

  const effectivePreviewSrc =
    bgMode === "off" ? "" : bgMode === "fixed" ? fixedBgSrc : autoPreviewSrc;

  return (
    <PageShell
      title={<h1 style={{ margin: 0 }}>⚙ 設定</h1>}
      showBack
      onBack={back}
      titleLayout="left"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div className="glass glass-strong" style={{ padding: 16 }}>
          <h2>🖼 背景</h2>

          <div>
            <label>
              <input
                type="radio"
                checked={bgMode === "auto"}
                onChange={() => set({ bgMode: "auto" })}
              />
              自動
            </label>

            <label>
              <input
                type="radio"
                checked={bgMode === "fixed"}
                onChange={() => set({ bgMode: "fixed" })}
              />
              固定
            </label>

            <label>
              <input
                type="radio"
                checked={bgMode === "off"}
                onChange={() => set({ bgMode: "off" })}
              />
              なし
            </label>
          </div>

          <select
            value={autoBgSet}
            disabled={bgMode !== "auto"}
            onChange={(e) => set({ autoBgSet: e.target.value })}
          >
            {AUTO_BG_SETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          {effectivePreviewSrc && (
            <img
              src={effectivePreviewSrc}
              alt=""
              style={{ width: "100%", borderRadius: 12 }}
            />
          )}
        </div>

        <button
          onClick={() => {
            reset();
            alert("初期化したよ");
          }}
        >
          🔁 初期化
        </button>
      </div>
    </PageShell>
  );
}
