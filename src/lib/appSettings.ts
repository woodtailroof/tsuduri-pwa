// src/lib/appSettings.ts
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type CharacterMode = "fixed" | "random";

export type AppSettings = {
  version: 2;

  // ===== キャラ =====
  characterEnabled: boolean;
  characterMode: CharacterMode;
  fixedCharacterId: string;
  /** 0.7〜5.0（表示側でも clamp） */
  characterScale: number;
  /** 0〜1 */
  characterOpacity: number;

  /** ✅ キャラ画像の上書き（id -> src） */
  characterImageOverrides: Record<string, string>;

  // ===== 表示 =====
  /** 背景暗幕 0〜1 */
  bgDim: number;
  /** 背景ぼかし(px) */
  bgBlur: number;

  /** ✅ 情報レイヤー背面の「板」不透明度 0〜1（文字は薄くしない） */
  infoPanelAlpha: number;

  /** ✅ 擦りガラス（カード）透過度 0〜1 */
  glassAlpha: number;
  /** ✅ 擦りガラス（カード）ぼかし(px) */
  glassBlur: number;
};

const KEY = "tsuduri_app_settings_v2";

/**
 * ✅ キャラ一覧は「作成したキャラ」を拾うため localStorage から読む
 * CharacterSettings 側の保存キー（プロジェクト既存）
 */
const CHARACTERS_KEY_V2 = "tsuduri_characters_v2";

// 初期値（気持ちよさ重視）
export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,

  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1.15,
  characterOpacity: 1,

  characterImageOverrides: {},

  bgDim: 0.55,
  bgBlur: 0,
  infoPanelAlpha: 0,

  // ✅ 以前の「擦りガラス度」相当の初期値（お好みで）
  glassAlpha: 0.22,
  glassBlur: 10,
};

export type CharacterOption = { id: string; label: string; src?: string };

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeOverrides(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof k === "string" && typeof val === "string" && val.trim()) {
      out[k] = val.trim();
    }
  }
  return out;
}

/** ✅ 作成キャラ（CharacterSettings）を localStorage から拾って選択肢にする */
export function getCharacterOptions(): CharacterOption[] {
  const fallback: CharacterOption[] = [
    { id: "tsuduri", label: "つづり", src: "/assets/character-test.png" },
  ];

  try {
    const raw = localStorage.getItem(CHARACTERS_KEY_V2);
    const parsed = safeParse(raw);

    if (!Array.isArray(parsed)) return fallback;

    const list: CharacterOption[] = parsed
      .map((x) => (isRecord(x) ? x : null))
      .filter(Boolean)
      .map((x) => {
        const id =
          typeof x!.id === "string" && x!.id.trim() ? x!.id.trim() : "";
        const label =
          typeof x!.name === "string" && x!.name.trim()
            ? x!.name.trim()
            : typeof x!.label === "string" && x!.label.trim()
            ? x!.label.trim()
            : id;

        // 画像は profile 側に src を持ってる場合もあるので拾う（なければ undefined）
        const src =
          typeof x!.src === "string" && x!.src.trim()
            ? x!.src.trim()
            : typeof x!.imageSrc === "string" && x!.imageSrc.trim()
            ? x!.imageSrc.trim()
            : undefined;

        return id ? { id, label, src } : null;
      })
      .filter(Boolean) as CharacterOption[];

    // 最低1件は欲しい
    if (list.length === 0) return fallback;

    // tsuduri が無い場合は先頭に差し込む（壊れにくくする）
    const hasTsuduri = list.some((c) => c.id === "tsuduri");
    if (!hasTsuduri) return [...fallback, ...list];

    return list;
  } catch {
    return fallback;
  }
}

function normalize(input: unknown): AppSettings {
  const x = (input ?? {}) as Partial<AppSettings> & { version?: number };

  const opts = (() => {
    try {
      return getCharacterOptions();
    } catch {
      return [
        { id: "tsuduri", label: "つづり", src: "/assets/character-test.png" },
      ];
    }
  })();

  const fixedId =
    typeof x.fixedCharacterId === "string" && x.fixedCharacterId.trim()
      ? x.fixedCharacterId.trim()
      : DEFAULT_SETTINGS.fixedCharacterId;

  const normalized: AppSettings = {
    version: 2,

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

    characterImageOverrides: normalizeOverrides(
      (x as any).characterImageOverrides
    ),

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

    infoPanelAlpha: clamp(
      Number.isFinite(x.infoPanelAlpha as number)
        ? (x.infoPanelAlpha as number)
        : DEFAULT_SETTINGS.infoPanelAlpha,
      0,
      1
    ),

    glassAlpha: clamp(
      Number.isFinite((x as any).glassAlpha as number)
        ? ((x as any).glassAlpha as number)
        : DEFAULT_SETTINGS.glassAlpha,
      0,
      1
    ),

    glassBlur: clamp(
      Number.isFinite((x as any).glassBlur as number)
        ? ((x as any).glassBlur as number)
        : DEFAULT_SETTINGS.glassBlur,
      0,
      24
    ),
  };

  // fixedCharacterId が候補に無い時は先頭に寄せる
  const exists = opts.some((c) => c.id === normalized.fixedCharacterId);
  if (!exists)
    normalized.fixedCharacterId =
      opts[0]?.id ?? DEFAULT_SETTINGS.fixedCharacterId;

  return normalized;
}

/**
 * ✅ useSyncExternalStore の getSnapshot は「同じ値なら同じ参照」
 */
let cachedRaw: string | null = null;
let cachedSettings: AppSettings = DEFAULT_SETTINGS;

function readSnapshot(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw && cachedSettings) return cachedSettings;

    const next = normalize(safeParse(raw));
    cachedRaw = raw;
    cachedSettings = next;
    return next;
  } catch {
    cachedRaw = null;
    cachedSettings = DEFAULT_SETTINGS;
    return DEFAULT_SETTINGS;
  }
}

function writeSnapshot(next: AppSettings) {
  try {
    const raw = JSON.stringify(next);
    localStorage.setItem(KEY, raw);
    cachedRaw = raw;
    cachedSettings = next;
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("tsuduri-settings"));
}

export function getAppSettings(): AppSettings {
  return readSnapshot();
}

export function setAppSettings(
  patch: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)
) {
  const prev = readSnapshot();
  const next =
    typeof patch === "function"
      ? normalize(patch(prev))
      : normalize({ ...prev, ...patch });
  writeSnapshot(next);
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
  const settings = useSyncExternalStore(subscribe, readSnapshot, readSnapshot);

  const api = useMemo(
    () => ({
      set: (patch: Partial<AppSettings>) => setAppSettings(patch),
      reset: () => setAppSettings(DEFAULT_SETTINGS),
    }),
    []
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        window.dispatchEvent(new Event("tsuduri-settings"));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return { settings, ...api };
}

/** ✅ id→src を解決（override → キャラデータsrc → フォールバック） */
export function resolveCharacterSrc(
  id: string,
  overrides?: Record<string, string> | null
) {
  const ov = overrides?.[id];
  if (typeof ov === "string" && ov.trim()) return ov.trim();

  const list = getCharacterOptions();
  const hit = list.find((c) => c.id === id);
  return hit?.src ?? list[0]?.src ?? "/assets/character-test.png";
}

/** ランダム選出（同じ候補が続きにくい程度のゆるい乱数） */
export function pickRandomCharacterId(excludeId?: string) {
  const list = getCharacterOptions().map((c) => c.id);
  if (list.length <= 1) return list[0] ?? "tsuduri";

  const filtered = excludeId ? list.filter((x) => x !== excludeId) : list;
  const idx = Math.floor(Math.random() * filtered.length);
  return filtered[idx] ?? list[0] ?? "tsuduri";
}
