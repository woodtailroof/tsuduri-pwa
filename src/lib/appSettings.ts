// src/lib/appSettings.ts
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type CharacterMode = "fixed" | "random";

export type AppSettings = {
  version: 1;

  // ===== キャラ =====
  characterEnabled: boolean;
  characterMode: CharacterMode;
  fixedCharacterId: string;
  /** 0.7〜5.0（表示側でも clamp） */
  characterScale: number;
  /** 0〜1 */
  characterOpacity: number;

  /**
   * ✅ キャラ画像の上書き
   * 例: { tsuduri: "/assets/t1.png", kokoro: "/assets/k1.png" }
   */
  characterImageOverrides: Record<string, string> | null;

  // ===== 表示 =====
  /** 背景暗幕 0〜1 */
  bgDim: number;
  /** 背景ぼかし(px) */
  bgBlur: number;

  /** ✅ ガラス：透過の濃さ 0〜0.9 */
  glassAlpha: number;
  /** ✅ ガラス：ぼかし(px) 0〜24 */
  glassBlur: number;
};

const KEY = "tsuduri_app_settings_v1";

// 初期値（気持ちよさ重視）
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1.15,
  characterOpacity: 1,
  characterImageOverrides: null,

  bgDim: 0.55,
  bgBlur: 0,

  glassAlpha: 0.22,
  glassBlur: 10,
};

// キャラ候補（ここ増やせばUIに出る）
export type CharacterOption = { id: string; label: string; src: string };
export const CHARACTER_OPTIONS: CharacterOption[] = [
  {
    id: "tsuduri",
    label: "つづり（テスト）",
    src: "/assets/character-test.png",
  },
  // { id: 'kokoro', label: 'こころ', src: '/assets/kokoro.png' },
  // { id: 'matsuri', label: 'まつり', src: '/assets/matsuri.png' },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalize(input: unknown): AppSettings {
  const x = (input ?? {}) as Partial<AppSettings> & Record<string, any>;

  const fixedId =
    typeof x.fixedCharacterId === "string" && x.fixedCharacterId.trim()
      ? x.fixedCharacterId.trim()
      : DEFAULT_SETTINGS.fixedCharacterId;

  const overrides =
    x.characterImageOverrides &&
    typeof x.characterImageOverrides === "object" &&
    !Array.isArray(x.characterImageOverrides)
      ? (x.characterImageOverrides as Record<string, unknown>)
      : null;

  const normalizedOverrides: Record<string, string> | null = overrides
    ? Object.fromEntries(
        Object.entries(overrides)
          .filter(([k, v]) => typeof k === "string" && typeof v === "string")
          .map(([k, v]) => [k, String(v)])
      )
    : null;

  const normalized: AppSettings = {
    version: 1,

    characterEnabled:
      typeof x.characterEnabled === "boolean"
        ? x.characterEnabled
        : DEFAULT_SETTINGS.characterEnabled,

    characterMode: x.characterMode === "random" ? "random" : "fixed",
    fixedCharacterId: fixedId,

    characterScale: clamp(
      Number.isFinite(x.characterScale as number)
        ? (x.characterScale as number)
        : DEFAULT_SETTINGS.characterScale,
      0.7,
      5.0
    ),

    characterOpacity: clamp(
      Number.isFinite(x.characterOpacity as number)
        ? (x.characterOpacity as number)
        : DEFAULT_SETTINGS.characterOpacity,
      0,
      1
    ),

    characterImageOverrides: normalizedOverrides,

    bgDim: clamp(
      Number.isFinite(x.bgDim as number)
        ? (x.bgDim as number)
        : DEFAULT_SETTINGS.bgDim,
      0,
      1
    ),

    bgBlur: clamp(
      Number.isFinite(x.bgBlur as number)
        ? (x.bgBlur as number)
        : DEFAULT_SETTINGS.bgBlur,
      0,
      24
    ),

    glassAlpha: clamp(
      Number.isFinite(x.glassAlpha as number)
        ? (x.glassAlpha as number)
        : DEFAULT_SETTINGS.glassAlpha,
      0,
      0.9
    ),

    glassBlur: clamp(
      Number.isFinite(x.glassBlur as number)
        ? (x.glassBlur as number)
        : DEFAULT_SETTINGS.glassBlur,
      0,
      24
    ),
  };

  // fixedCharacterId が候補に無い時は先頭に寄せる（壊れないように）
  const exists = CHARACTER_OPTIONS.some(
    (c) => c.id === normalized.fixedCharacterId
  );
  if (!exists)
    normalized.fixedCharacterId =
      CHARACTER_OPTIONS[0]?.id ?? DEFAULT_SETTINGS.fixedCharacterId;

  return normalized;
}

function read(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(safeParse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function write(next: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("tsuduri-settings"));
}

export function getAppSettings(): AppSettings {
  return read();
}

export function setAppSettings(
  patch: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)
) {
  const prev = read();
  const next =
    typeof patch === "function"
      ? patch(prev)
      : normalize({ ...prev, ...patch });
  write(next);
}

function subscribe(cb: () => void) {
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("tsuduri-settings", onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("tsuduri-settings", onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/** 設定を購読して UI に反映するための hook */
export function useAppSettings() {
  const settings = useSyncExternalStore(subscribe, read, read);

  const api = useMemo(
    () => ({
      set: (patch: Partial<AppSettings>) => setAppSettings(patch),
      reset: () => setAppSettings(DEFAULT_SETTINGS),
    }),
    []
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible")
        window.dispatchEvent(new Event("tsuduri-settings"));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return { settings, ...api };
}

/**
 * ✅ id→src を解決
 * - overrides があればそれを優先
 * - なければ CHARACTER_OPTIONS
 */
export function resolveCharacterSrc(
  id: string,
  overrides: Record<string, string> | null
) {
  const overridden = overrides?.[id];
  if (typeof overridden === "string" && overridden.trim())
    return overridden.trim();

  const hit = CHARACTER_OPTIONS.find((c) => c.id === id);
  return hit?.src ?? CHARACTER_OPTIONS[0]?.src ?? "/assets/character-test.png";
}

/** ランダム選出（同じ候補が続きにくい程度のゆるい乱数） */
export function pickRandomCharacterId(excludeId?: string) {
  const list = CHARACTER_OPTIONS.map((c) => c.id);
  if (list.length <= 1) return list[0] ?? "tsuduri";

  const filtered = excludeId ? list.filter((x) => x !== excludeId) : list;
  const idx = Math.floor(Math.random() * filtered.length);
  return filtered[idx] ?? list[0] ?? "tsuduri";
}
