// src/lib/appSettings.ts
import { useMemo, useSyncExternalStore } from "react";

/**
 * ===== 型定義 =====
 */

export type BgMode = "auto" | "fixed";
export type BgTimeBand = "morning" | "day" | "evening" | "night";

/**
 * アプリ設定（後方互換あり）
 */
export type AppSettings = {
  version: 1;

  // ===== キャラ =====
  characterEnabled: boolean;
  characterMode: "fixed" | "random";
  fixedCharacterId: string;
  characterScale: number;
  characterOpacity: number;
  characterOverrideSrc: string;

  // ===== 背景（新仕様）=====
  bgMode: BgMode;
  bgAutoSet: string; // 自動背景セット名
  bgFixedSrc: string; // 固定背景パス

  // ===== 背景（旧仕様：後方互換）=====
  autoBgSet?: string;
  fixedBgSrc?: string;

  // ===== 背景演出 =====
  bgDim: number;
  bgBlur: number;

  // ===== ガラス =====
  glassAlpha: number;
  glassBlur: number;
};

/**
 * ===== デフォルト設定 =====
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  // キャラ
  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1.0,
  characterOpacity: 1.0,
  characterOverrideSrc: "",

  // 背景（新）
  bgMode: "auto",
  bgAutoSet: "surf",
  bgFixedSrc: "",

  // 背景（旧互換）
  autoBgSet: "surf",
  fixedBgSrc: "",

  // 演出
  bgDim: 0.25,
  bgBlur: 0,

  // ガラス
  glassAlpha: 0.22,
  glassBlur: 10,
};

/**
 * ===== 正規化（旧 → 新 吸収）=====
 */
function normalizeSettings(
  raw: Partial<AppSettings> | null | undefined,
): AppSettings {
  const s: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
  };

  // --- 旧 → 新（背景） ---
  if (s.autoBgSet && !s.bgAutoSet) {
    s.bgAutoSet = s.autoBgSet;
  }
  if (s.fixedBgSrc && !s.bgFixedSrc) {
    s.bgFixedSrc = s.fixedBgSrc;
  }

  // --- off 互換（昔 "off" があった名残対策） ---
  if ((s as any).bgMode === "off") {
    s.bgMode = "auto";
  }

  // clamp 系（念のため）
  s.characterScale = clamp(s.characterScale, 0.7, 5.0);
  s.characterOpacity = clamp(s.characterOpacity, 0, 1);
  s.bgDim = clamp(s.bgDim, 0, 1);
  s.glassAlpha = clamp(s.glassAlpha, 0, 0.6);
  s.bgBlur = clamp(s.bgBlur, 0, 20);
  s.glassBlur = clamp(s.glassBlur, 0, 40);

  return s;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * ===== ストレージ =====
 */
const STORAGE_KEY = "tsuduri_app_settings_v1";

function readStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStorage(next: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * ===== ストア（useSyncExternalStore）=====
 */
let cache: AppSettings = readStorage();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const appSettingsStore = {
  get(): AppSettings {
    return cache;
  },

  set(patch: Partial<AppSettings>) {
    cache = normalizeSettings({ ...cache, ...patch });
    writeStorage(cache);
    emit();
  },

  reset() {
    cache = { ...DEFAULT_SETTINGS };
    writeStorage(cache);
    emit();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/**
 * ===== フック =====
 */
export function useAppSettings() {
  const settings = useSyncExternalStore(
    appSettingsStore.subscribe,
    appSettingsStore.get,
    appSettingsStore.get,
  );

  const api = useMemo(
    () => ({
      settings,
      set: appSettingsStore.set,
      reset: appSettingsStore.reset,
    }),
    [settings],
  );

  return api;
}

/**
 * ===== 補助 =====
 */
export function getTimeBand(d: Date): BgTimeBand {
  const h = d.getHours();
  if (h >= 4 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}
