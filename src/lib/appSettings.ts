// src/lib/appSettings.ts
import { useMemo, useSyncExternalStore } from "react";

/* =========================
 * 型定義
 * ========================= */

export type BgMode = "auto" | "fixed" | "off";
export type BgTimeBand = "morning" | "day" | "evening" | "night";

export type CharacterMode = "fixed" | "random";

export type AppSettings = {
  version: 1;

  // ===== キャラ =====
  characterEnabled: boolean;
  characterMode: CharacterMode;
  fixedCharacterId: string;
  /** 0.7〜5.0 */
  characterScale: number;
  /** 0〜1 */
  characterOpacity: number;

  /** public 配下の画像パスでキャラ画像を上書き（例: "/assets/k1.png"）空なら無効 */
  characterOverrideSrc: string;

  // ===== 背景（現行） =====
  bgMode: BgMode;
  autoBgSet: string;
  fixedBgSrc: string;

  // ===== 旧互換（過去のキーが残ってても死なないように） =====
  bgAutoSet?: string;
  bgFixedSrc?: string;

  // ===== 演出 =====
  /** 背景暗幕 0〜1 */
  bgDim: number;
  /** 背景ぼかし(px) */
  bgBlur: number;

  // ===== ガラス =====
  /** 0〜0.6 */
  glassAlpha: number;
  /** 0〜40(px) */
  glassBlur: number;
};

/* =========================
 * 自動背景セット（UI用）
 * - Settings.tsx が AUTO_BG_SETS.map(...) する前提
 * ========================= */
export const AUTO_BG_SETS: Array<{ id: string; label: string }> = [
  { id: "surf", label: "サーフ" },
];

/* =========================
 * デフォルト
 * ========================= */

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  // キャラ
  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1,
  characterOpacity: 1,
  characterOverrideSrc: "",

  // 背景
  bgMode: "auto",
  autoBgSet: "surf",
  fixedBgSrc: "",

  // 旧互換の初期値（あっても無害）
  bgAutoSet: "surf",
  bgFixedSrc: "",

  // 演出
  bgDim: 0.25,
  bgBlur: 0,

  // ガラス
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

/** public 配下パスに寄せる（undefined/nullでも落ちない版） */
export function normalizePublicPath(p?: string | null): string {
  const s = (p ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith("/") ? s : `/${s}`;
}

/* =========================
 * 背景解決
 * - PageShell/Settings が期待している命名規則:
 *   /assets/bg/{setId}_{band}.png
 * ========================= */

export function resolveAutoBackgroundSrc(
  setId: string,
  band: BgTimeBand,
): string {
  const sid = (setId ?? "").trim();
  if (!sid) return "";
  return normalizePublicPath(`/assets/bg/${sid}_${band}.png`);
}

export function getTimeBand(d: Date): BgTimeBand {
  const h = d.getHours();
  if (h >= 4 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

/* =========================
 * キャラ画像（互換込み）
 * - 新：resolveCharacterSrc(characterId)
 * - 旧：resolveCharacterSrc(overrideSrc, defaultSrc)
 * ========================= */

export function resolveCharacterSrc(characterId: string): string;
export function resolveCharacterSrc(
  overrideSrc: string,
  defaultSrc: string,
): string;
export function resolveCharacterSrc(a: string, b?: string): string {
  // 旧形式: (overrideSrc, defaultSrc)
  if (typeof b === "string") {
    return normalizePublicPath(a || b);
  }

  // 新形式: (characterId)
  const id = (a ?? "").trim();
  if (!id) return "/assets/character-test.png";

  // 既定の置き場（必要ならこの規則で画像を置く）
  // 例: public/assets/characters/tsuduri.png
  const candidate = `/assets/characters/${id}.png`;
  return normalizePublicPath(candidate) || "/assets/character-test.png";
}

/* =========================
 * 正規化
 * ========================= */

function normalizeSettings(
  raw: Partial<AppSettings> | null | undefined,
): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
  };

  // 旧キー → 現行キーへ寄せる
  if (!merged.autoBgSet && typeof merged.bgAutoSet === "string") {
    merged.autoBgSet = merged.bgAutoSet;
  }
  if (!merged.fixedBgSrc && typeof merged.bgFixedSrc === "string") {
    merged.fixedBgSrc = merged.bgFixedSrc;
  }

  // bgMode の不正値を矯正（過去に "off" を any で入れてた等の事故も吸収）
  if (
    merged.bgMode !== "auto" &&
    merged.bgMode !== "fixed" &&
    merged.bgMode !== "off"
  ) {
    merged.bgMode = DEFAULT_SETTINGS.bgMode;
  }

  // 数値クランプ
  merged.characterScale = clamp(merged.characterScale, 0.7, 5);
  merged.characterOpacity = clamp(merged.characterOpacity, 0, 1);

  merged.bgDim = clamp(merged.bgDim, 0, 1);
  merged.bgBlur = clamp(merged.bgBlur, 0, 24);

  merged.glassAlpha = clamp(merged.glassAlpha, 0, 0.6);
  merged.glassBlur = clamp(merged.glassBlur, 0, 40);

  // 空白除去
  merged.autoBgSet =
    (merged.autoBgSet ?? "").trim() || DEFAULT_SETTINGS.autoBgSet;
  merged.fixedBgSrc = (merged.fixedBgSrc ?? "").trim();

  merged.characterOverrideSrc = (merged.characterOverrideSrc ?? "").trim();

  return merged;
}

/* =========================
 * store
 * ========================= */

const STORAGE_KEY = "tsuduri_app_settings_v1";

function readStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    return normalizeSettings(parsed as Partial<AppSettings>);
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
