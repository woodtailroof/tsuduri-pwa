// src/lib/appSettings.ts
import { useMemo, useSyncExternalStore } from "react";

/* =========================
 * 型定義
 * ========================= */

export type BgMode = "auto" | "fixed" | "off";
export type BgTimeBand = "morning" | "day" | "evening" | "night";

export type CharacterMode = "fixed" | "random";

export type CharacterCostumeId = "uniform" | "casual";
export type CharacterCostumeMode = CharacterCostumeId | "daily";

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

  /** 全キャラ共通の衣装テーマ */
  characterCostumeMode: CharacterCostumeMode;

  /**
   * ✅ 静的アセット用のキャッシュバスター（Cloudflare immutable 対策）
   * 空なら何もしない。値が入ると画像URLに ?av=... を付ける。
   */
  assetVersion: string;

  // ===== 背景 =====
  bgMode: BgMode;
  autoBgSet: string;
  fixedBgSrc: string;

  // ===== 表示 =====
  /** 背景ぼかし(px) */
  bgBlur: number;

  /** すりガラス濃さ（0〜0.6くらい推奨） */
  glassAlpha: number;
  /** すりガラスぼかし(px) */
  glassBlur: number;

  // ===== 旧互換（過去に保存してた可能性があるキー） =====
  bgAutoSet?: string;
  bgFixedSrc?: string;
};

/* =========================
 * 背景セット一覧（Settings.tsx が map する前提）
 * ========================= */

export const AUTO_BG_SETS: Array<{ id: string; label: string }> = [
  { id: "surf", label: "サーフ" },
] as const;

/* =========================
 * 衣装一覧
 * ========================= */

export const CHARACTER_COSTUME_OPTIONS: Array<{
  id: CharacterCostumeMode;
  label: string;
  description: string;
}> = [
  {
    id: "daily",
    label: "日替わり",
    description: "朝5時更新。全キャラ共通で、その日の衣装テーマを固定するよ。",
  },
  {
    id: "uniform",
    label: "制服固定",
    description: "全キャラを制服テーマで固定するよ。",
  },
  {
    id: "casual",
    label: "私服固定",
    description: "全キャラを私服テーマで固定するよ。",
  },
] as const;

export const CHARACTER_COSTUME_IDS: CharacterCostumeId[] = [
  "uniform",
  "casual",
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
  characterCostumeMode: "daily",

  // assetVersion（空=無効）
  assetVersion: "",

  // 背景
  bgMode: "auto",
  autoBgSet: "surf",
  fixedBgSrc: "",

  // 表示
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
 * キャラ衣装解決
 * ========================= */

const DAILY_COSTUME_STORAGE_KEY = "tsuduri_daily_costume_v1";

type DailyCostumeState = {
  dateKey: string;
  costumeId: CharacterCostumeId;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 釣行中の0時またぎで衣装が変わらないように、
 * 朝5時を日替わり境界にする。
 */
export function getCostumeDateKey(d = new Date()): string {
  const shifted = new Date(d.getTime());
  shifted.setHours(shifted.getHours() - 5);

  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function normalizeCostumeMode(raw: unknown): CharacterCostumeMode {
  if (raw === "uniform" || raw === "casual" || raw === "daily") return raw;
  return DEFAULT_SETTINGS.characterCostumeMode;
}

function pickRandomCostumeId(): CharacterCostumeId {
  const i = Math.floor(Math.random() * CHARACTER_COSTUME_IDS.length);
  return CHARACTER_COSTUME_IDS[i] ?? "uniform";
}

function readDailyCostume(dateKey: string): CharacterCostumeId {
  if (typeof window === "undefined") return "uniform";

  const stored = safeJsonParse<Partial<DailyCostumeState>>(
    localStorage.getItem(DAILY_COSTUME_STORAGE_KEY),
    {},
  );

  if (
    stored &&
    stored.dateKey === dateKey &&
    (stored.costumeId === "uniform" || stored.costumeId === "casual")
  ) {
    return stored.costumeId;
  }

  const next: DailyCostumeState = {
    dateKey,
    costumeId: pickRandomCostumeId(),
  };

  try {
    localStorage.setItem(DAILY_COSTUME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }

  return next.costumeId;
}

export function resolveCharacterCostumeId(
  mode: CharacterCostumeMode | undefined,
  d = new Date(),
): CharacterCostumeId {
  const normalized = normalizeCostumeMode(mode);
  if (normalized === "uniform" || normalized === "casual") return normalized;
  return readDailyCostume(getCostumeDateKey(d));
}

/* =========================
 * キャラ画像
 * ========================= */

export function resolveCharacterSrc(
  characterId: string,
  overrideSrc?: string,
): string {
  const ov = normalizePublicPath(overrideSrc ?? "");
  if (ov) return ov;

  const id = (characterId ?? "").trim();
  if (!id) return "/assets/character-test.png";

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

  // characterMode の補正
  if (merged.characterMode !== "fixed" && merged.characterMode !== "random") {
    merged.characterMode = DEFAULT_SETTINGS.characterMode;
  }

  // characterCostumeMode の補正
  merged.characterCostumeMode = normalizeCostumeMode(
    merged.characterCostumeMode,
  );

  merged.characterScale = clamp(merged.characterScale, 0.7, 5.0);
  merged.characterOpacity = clamp(merged.characterOpacity, 0, 1);

  merged.bgBlur = clamp(merged.bgBlur, 0, 24);
  merged.glassAlpha = clamp(merged.glassAlpha, 0, 0.6);
  merged.glassBlur = clamp(merged.glassBlur, 0, 40);

  merged.autoBgSet =
    (merged.autoBgSet ?? "").trim() || DEFAULT_SETTINGS.autoBgSet;
  merged.fixedBgSrc = (merged.fixedBgSrc ?? "").trim();

  // assetVersion 正規化
  merged.assetVersion = String(merged.assetVersion ?? "").trim();

  // characterOverrideSrc 正規化
  merged.characterOverrideSrc = String(
    merged.characterOverrideSrc ?? "",
  ).trim();
  merged.fixedCharacterId =
    String(merged.fixedCharacterId ?? "").trim() ||
    DEFAULT_SETTINGS.fixedCharacterId;

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

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("tsuduri-settings"));
    }
  },
  reset() {
    cache = { ...DEFAULT_SETTINGS };
    writeStorage(cache);
    emit();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("tsuduri-settings"));
    }
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
