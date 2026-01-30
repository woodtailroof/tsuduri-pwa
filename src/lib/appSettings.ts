// src/lib/appSettings.ts
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type CharacterMode = "fixed" | "random";
export type BgMode = "auto" | "fixed";
export type BgTimeBand = "morning" | "day" | "evening" | "night";

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

  /** public 配下の画像パスでキャラ画像を上書き（空ならデフォルト） */
  characterOverrideSrc: string;

  // ===== 背景 =====
  bgMode: BgMode;
  /** fixed 時に使う public 画像パス */
  bgFixedSrc: string;
  /** auto 時に使う背景セット名（例: "surf"） */
  bgAutoSet: string;

  /** 背景暗幕 0〜1 */
  bgDim: number;
  /** 背景ぼかし(px) */
  bgBlur: number;

  /** ✅ すりガラス濃さ（0〜0.6くらい推奨） */
  glassAlpha: number;
  /** ✅ すりガラスぼかし(px) */
  glassBlur: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  // キャラ
  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1.0,
  characterOpacity: 1.0,
  characterOverrideSrc: "",

  // 背景
  bgMode: "auto",
  bgFixedSrc: "",
  bgAutoSet: "surf",

  // 見た目
  bgDim: 0.18,
  bgBlur: 0,

  glassAlpha: 0.22,
  glassBlur: 10,
};

const STORAGE_KEY = "tsuduri_app_settings_v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSettings(
  x: Partial<AppSettings> | null | undefined,
): AppSettings {
  const s = { ...DEFAULT_SETTINGS, ...(x ?? {}) } as AppSettings;

  // 破壊的な型崩れ対策
  s.version = 1;

  s.characterScale = clamp(
    Number(s.characterScale) || DEFAULT_SETTINGS.characterScale,
    0.7,
    5.0,
  );
  s.characterOpacity = clamp(
    Number(s.characterOpacity) || DEFAULT_SETTINGS.characterOpacity,
    0,
    1,
  );

  s.bgDim = clamp(Number(s.bgDim) || 0, 0, 1);
  s.bgBlur = clamp(Number(s.bgBlur) || 0, 0, 30);

  // glass は 0〜0.6 くらいが気持ちいい（上限は安全に 0.8 まで許容）
  s.glassAlpha = clamp(Number(s.glassAlpha) || 0, 0, 0.8);
  s.glassBlur = clamp(Number(s.glassBlur) || 0, 0, 30);

  if (s.characterMode !== "fixed" && s.characterMode !== "random")
    s.characterMode = "fixed";
  if (s.bgMode !== "auto" && s.bgMode !== "fixed") s.bgMode = "auto";

  if (typeof s.fixedCharacterId !== "string")
    s.fixedCharacterId = DEFAULT_SETTINGS.fixedCharacterId;
  if (typeof s.characterOverrideSrc !== "string") s.characterOverrideSrc = "";
  if (typeof s.bgFixedSrc !== "string") s.bgFixedSrc = "";
  if (typeof s.bgAutoSet !== "string") s.bgAutoSet = "surf";

  return s;
}

let _cache: AppSettings | null = null;
const _listeners = new Set<() => void>();

function readSettings(): AppSettings {
  if (_cache) return _cache;
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  _cache = normalizeSettings(
    safeJsonParse<Partial<AppSettings>>(raw, DEFAULT_SETTINGS),
  );
  return _cache;
}

function writeSettings(next: AppSettings) {
  _cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  for (const fn of Array.from(_listeners)) fn();
}

export function setAppSettings(patch: Partial<AppSettings>) {
  const cur = readSettings();
  const next = normalizeSettings({ ...cur, ...patch });
  writeSettings(next);
}

export function resetAppSettings() {
  writeSettings(DEFAULT_SETTINGS);
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/**
 * ✅ ここが今回の本丸
 * - 従来: { settings, set, reset }
 * - 互換: さらに設定値をトップレベルに展開して返す
 *
 * これで Chat.tsx が useAppSettings().glassAlpha を読んでも型エラーにならない
 */
export function useAppSettings(): AppSettings & {
  settings: AppSettings;
  set: (patch: Partial<AppSettings>) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(
    subscribe,
    () => readSettings(),
    () => DEFAULT_SETTINGS,
  );

  const api = useMemo(() => {
    const set = (patch: Partial<AppSettings>) => setAppSettings(patch);
    const reset = () => resetAppSettings();

    // ✅ 互換のため settings をトップレベルに展開
    return Object.assign({}, settings, { settings, set, reset });
  }, [settings]);

  return api;
}

// ===== 背景セット（必要なら増やす） =====
export const AUTO_BG_SETS: Record<string, Record<BgTimeBand, string>> = {
  surf: {
    morning: "/assets/bg/surf_morning.png",
    day: "/assets/bg/surf_day.png",
    evening: "/assets/bg/surf_evening.png",
    night: "/assets/bg/surf_night.png",
  },
};

export function getTimeBand(d: Date): BgTimeBand {
  const h = d.getHours();
  if (h >= 5 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

export function normalizePublicPath(p: string): string {
  const s = (p ?? "").trim();
  if (!s) return "";
  return s.startsWith("/") ? s : `/${s}`;
}

export function resolveAutoBackgroundSrc(
  setName: string,
  band: BgTimeBand,
): string {
  const set =
    AUTO_BG_SETS[setName] ??
    AUTO_BG_SETS[DEFAULT_SETTINGS.bgAutoSet] ??
    AUTO_BG_SETS.surf;
  return set?.[band] ?? "";
}

/** bgMode に応じて表示する背景の src を返す */
export function resolveBackgroundSrc(
  settings: AppSettings,
  now = new Date(),
): string {
  if (settings.bgMode === "fixed")
    return normalizePublicPath(settings.bgFixedSrc);
  const band = getTimeBand(now);
  return resolveAutoBackgroundSrc(settings.bgAutoSet, band);
}
