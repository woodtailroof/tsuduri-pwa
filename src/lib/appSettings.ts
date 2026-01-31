// src/lib/appSettings.ts
import { useMemo, useSyncExternalStore } from "react";

/* =========================
 * 型定義
 * ========================= */

export type BgMode = "auto" | "fixed";
export type BgTimeBand = "morning" | "day" | "evening" | "night";

export type AppSettings = {
  version: 1;

  // ===== キャラ =====
  characterEnabled: boolean;
  characterMode: "fixed" | "random";
  fixedCharacterId: string;
  characterScale: number;
  characterOpacity: number;
  characterOverrideSrc: string;

  // ===== 背景 =====
  bgMode: BgMode;
  bgAutoSet: string;
  bgFixedSrc: string;

  // ===== 旧互換 =====
  autoBgSet?: string;
  fixedBgSrc?: string;

  // ===== 演出 =====
  bgDim: number;
  bgBlur: number;

  // ===== ガラス =====
  glassAlpha: number;
  glassBlur: number;
};

/* =========================
 * 定数
 * ========================= */

export const AUTO_BG_SETS = {
  surf: {
    morning: "/bg/surf/morning.jpg",
    day: "/bg/surf/day.jpg",
    evening: "/bg/surf/evening.jpg",
    night: "/bg/surf/night.jpg",
  },
} as const;

/* =========================
 * デフォルト
 * ========================= */

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1,
  characterOpacity: 1,
  characterOverrideSrc: "",

  bgMode: "auto",
  bgAutoSet: "surf",
  bgFixedSrc: "",

  autoBgSet: "surf",
  fixedBgSrc: "",

  bgDim: 0.25,
  bgBlur: 0,

  glassAlpha: 0.22,
  glassBlur: 10,
};

/* =========================
 * util
 * ========================= */

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizePublicPath(p: string): string {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return p.startsWith("/") ? p : `/${p}`;
}

/* =========================
 * 背景解決
 * ========================= */

export function resolveAutoBackgroundSrc(
  setName: string,
  band: BgTimeBand,
): string {
  const set = (AUTO_BG_SETS as any)[setName];
  if (!set) return "";
  return normalizePublicPath(set[band] ?? "");
}

export function getTimeBand(d: Date): BgTimeBand {
  const h = d.getHours();
  if (h >= 4 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

/* =========================
 * キャラ画像（互換スタブ）
 * ========================= */

export function resolveCharacterSrc(overrideSrc: string, defaultSrc: string) {
  return normalizePublicPath(overrideSrc || defaultSrc);
}

/* =========================
 * 正規化
 * ========================= */

function normalizeSettings(
  raw: Partial<AppSettings> | null | undefined,
): AppSettings {
  const s: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
  };

  // 旧 → 新
  if (s.autoBgSet && !s.bgAutoSet) s.bgAutoSet = s.autoBgSet;
  if (s.fixedBgSrc && !s.bgFixedSrc) s.bgFixedSrc = s.fixedBgSrc;

  // off 互換（型エラー防止）
  if ((s as any).bgMode === "off") {
    s.bgMode = "auto";
  }

  s.characterScale = clamp(s.characterScale, 0.7, 5);
  s.characterOpacity = clamp(s.characterOpacity, 0, 1);
  s.bgDim = clamp(s.bgDim, 0, 1);
  s.bgBlur = clamp(s.bgBlur, 0, 20);
  s.glassAlpha = clamp(s.glassAlpha, 0, 0.6);
  s.glassBlur = clamp(s.glassBlur, 0, 40);

  return s;
}

/* =========================
 * store
 * ========================= */

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
  } catch {}
}

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

export function useAppSettings() {
  const settings = useSyncExternalStore(
    appSettingsStore.subscribe,
    appSettingsStore.get,
    appSettingsStore.get,
  );

  return useMemo(
    () => ({
      settings,
      set: appSettingsStore.set,
      reset: appSettingsStore.reset,
    }),
    [settings],
  );
}
