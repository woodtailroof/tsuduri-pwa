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
  /** 0.7〜5.0（表示側でも clamp） */
  characterScale: number;
  /** 0〜1 */
  characterOpacity: number;
  /** public 配下の画像パスでキャラ画像を上書き（空ならデフォルト） */
  characterOverrideSrc: string;

  /**
   * ✅ 静的アセット用のキャッシュバスター（Cloudflare immutable 対策）
   * 空なら何もしない。値が入ると画像URLに ?av=... を付ける。
   * 例: "20260219a" / "2" / Date.now().toString()
   */
  assetVersion: string;

  // ===== 背景 =====
  bgMode: BgMode;
  autoBgSet: string;
  fixedBgSrc: string;

  // ===== 表示（3要素のみ）=====
  /** 背景ぼかし(px) */
  bgBlur: number;

  /** すりガラス濃さ（0〜0.6くらい推奨） */
  glassAlpha: number;
  /** すりガラスぼかし(px) */
  glassBlur: number;

  // ===== 旧互換（過去に保存してた可能性があるキー） =====
  bgAutoSet?: string;
  bgFixedSrc?: string;

  // ✅ bgDim は廃止（保存データに残ってても無視する）
};

/* =========================
 * 背景セット一覧（Settings.tsx が map する前提）
 * ========================= */

export const AUTO_BG_SETS: Array<{ id: string; label: string }> = [
  { id: "surf", label: "サーフ" },
] as const;

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

  // ✅ assetVersion（空=無効）
  assetVersion: "",

  // 背景
  bgMode: "auto",
  autoBgSet: "surf",
  fixedBgSrc: "",

  // 表示（3要素のみ）
  bgBlur: 0,

  // ガラス
  glassAlpha: 0.22,
  glassBlur: 10,
};

/* =========================
 * util
 * ========================= */

/**
 * ✅ string / "10px" / number を全部受ける数値化
 * - "10" -> 10
 * - "10px" -> 10
 * - "" / null / NaN -> fallback
 */
function toNumberLike(v: unknown, fallback: number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return fallback;
    const n = Number.parseFloat(s); // "10px" も 10 になる
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function clamp(v: unknown, min: number, max: number) {
  const n = toNumberLike(v, min);
  return Math.max(min, Math.min(max, n));
}

export function normalizePublicPath(p: string): string {
  const s = (p ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return s.startsWith("/") ? s : `/${s}`;
}

/* =========================
 * 背景解決
 * ========================= */

/**
 * ✅ 4枚運用：
 * /assets/bg/{setId}_morning.png
 * /assets/bg/{setId}_day.png
 * /assets/bg/{setId}_evening.png
 * /assets/bg/{setId}_night.png
 */
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
 * キャラ画像
 * ========================= */

/**
 * ✅ PageShell が1引数で呼べるようにする（TS2554対策）
 * - overrideSrc があればそれを優先
 * - 無ければキャラIDから既定パスを組み立てる（最低限の互換）
 */
export function resolveCharacterSrc(
  characterId: string,
  overrideSrc?: string,
): string {
  const ov = normalizePublicPath(overrideSrc ?? "");
  if (ov) return ov;

  const id = (characterId ?? "").trim();
  if (!id) return "/assets/character-test.png";

  // 既定：/assets/characters/{id}.png を想定（無ければ最終的に表示側のフォールバックに落ちる）
  return normalizePublicPath(`/assets/characters/${id}.png`);
}

/* =========================
 * 正規化（互換吸収）
 * ========================= */

function normalizeSettings(
  raw: Partial<AppSettings> | null | undefined,
): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
  };

  // 旧キー → 新キー（どっちが入ってても生きる）
  if ((merged.bgAutoSet ?? "").trim() && !(merged.autoBgSet ?? "").trim()) {
    merged.autoBgSet = String(merged.bgAutoSet);
  }
  if ((merged.bgFixedSrc ?? "").trim() && !(merged.fixedBgSrc ?? "").trim()) {
    merged.fixedBgSrc = String(merged.bgFixedSrc);
  }

  // bgMode の補正
  if (
    merged.bgMode !== "auto" &&
    merged.bgMode !== "fixed" &&
    merged.bgMode !== "off"
  ) {
    merged.bgMode = DEFAULT_SETTINGS.bgMode;
  }

  merged.characterScale = clamp(merged.characterScale, 0.7, 5.0);
  merged.characterOpacity = clamp(merged.characterOpacity, 0, 1);

  merged.bgBlur = clamp(merged.bgBlur, 0, 24);
  merged.glassAlpha = clamp(merged.glassAlpha, 0, 0.6);
  merged.glassBlur = clamp(merged.glassBlur, 0, 40);

  merged.autoBgSet =
    (merged.autoBgSet ?? "").trim() || DEFAULT_SETTINGS.autoBgSet;
  merged.fixedBgSrc = (merged.fixedBgSrc ?? "").trim();

  // ✅ assetVersion 正規化
  merged.assetVersion = String(merged.assetVersion ?? "").trim();

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

let cache: AppSettings = readStorage();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
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
