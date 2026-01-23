// src/lib/appSettings.ts
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type CharacterMode = "fixed" | "random";

/** ✅ 背景モード */
export type BackgroundMode = "auto" | "fixed" | "off";

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

  /** ✅ public 配下の画像パスでキャラ画像を上書き（例: "/assets/k1.png" or "assets/k1.png"）空ならデフォルト */
  characterOverrideSrc: string;

  // ===== 背景 =====
  /** ✅ "auto": 画面側(bgImage prop)に従う / "fixed": fixedBgSrc を強制 / "off": 背景画像なし */
  bgMode: BackgroundMode;
  /** ✅ 固定背景の画像パス（public配下）例: "/assets/bg/home/day.webp" */
  fixedBgSrc: string;

  // ===== 表示 =====
  /** 背景暗幕 0〜1 */
  bgDim: number;
  /** 背景ぼかし(px) */
  bgBlur: number;

  /** ✅ すりガラス濃さ（0〜0.6くらい推奨） */
  glassAlpha: number;
  /** ✅ すりガラスぼかし(px) */
  glassBlur: number;
};

const KEY = "tsuduri_app_settings_v1";

/** ✅ 作成キャラ（CharacterSettings）保存キー（appSettings側でも読む） */
const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";

/** 初期値 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1.15,
  characterOpacity: 1,
  characterOverrideSrc: "",

  // ✅ 背景
  bgMode: "auto",
  fixedBgSrc: "",

  bgDim: 0.55,
  bgBlur: 0,

  glassAlpha: 0.22,
  glassBlur: 10,
};

// キャラ候補（ここ増やせばUIに出る）
// ※ src は「デフォルト表示パス」。override を入れたらそれが優先される
export type CharacterOption = { id: string; label: string; src: string };
export const CHARACTER_OPTIONS: CharacterOption[] = [
  {
    id: "tsuduri",
    label: "つづり（テスト）",
    src: "/assets/character-test.png",
  },
  // 例:
  // { id: "kokoro", label: "日波こころ", src: "/assets/k1.png" },
  // { id: "matsuri", label: "潮風まつり", src: "/assets/m1.png" },
];

/** ✅ 背景候補（Settings UIに出す用） */
export type BackgroundOption = { id: string; label: string; src: string };
export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  // 例：あとでここを増やしていけばUIが育つ
  // { id: "home_day", label: "ホーム：昼", src: "/assets/bg/home/day.webp" },
  // { id: "home_night", label: "ホーム：夜", src: "/assets/bg/home/night.webp" },
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

export function normalizePublicPath(p: string) {
  const s = (p ?? "").trim();
  if (!s) return "";
  if (s.startsWith("/")) return s;
  return `/${s}`;
}

type StoredCharacterLike = {
  id?: unknown;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** ✅ 作成キャラID一覧を取得（appSettings単体で参照できるようにここで読む） */
function loadCreatedCharacterIds(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  const ids = Array.isArray(list)
    ? list
        .map((c) => (typeof c?.id === "string" ? c.id : ""))
        .filter((x) => !!x)
    : [];

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(id);
  }
  return uniq;
}

/** ✅ 固定キャラIDとして「許可」するID集合を作る */
function getAllowedCharacterIds(): string[] {
  const base = CHARACTER_OPTIONS.map((c) => c.id).filter(Boolean);
  const created = loadCreatedCharacterIds();
  // 併合（順序：created → base）
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const id of created) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of base) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }

  return merged;
}

function normalize(input: unknown): AppSettings {
  const x = (input ?? {}) as Partial<AppSettings>;

  const fixedId =
    typeof x.fixedCharacterId === "string" && x.fixedCharacterId.trim()
      ? x.fixedCharacterId.trim()
      : DEFAULT_SETTINGS.fixedCharacterId;

  const bgMode: BackgroundMode =
    x.bgMode === "fixed" || x.bgMode === "off" ? x.bgMode : "auto";

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
      5.0,
    ),
    characterOpacity: clamp(
      Number.isFinite(x.characterOpacity as number)
        ? (x.characterOpacity as number)
        : DEFAULT_SETTINGS.characterOpacity,
      0,
      1,
    ),

    characterOverrideSrc:
      typeof x.characterOverrideSrc === "string" ? x.characterOverrideSrc : "",

    // ✅ 背景
    bgMode,
    fixedBgSrc: typeof x.fixedBgSrc === "string" ? x.fixedBgSrc : "",

    bgDim: clamp(
      Number.isFinite(x.bgDim as number)
        ? (x.bgDim as number)
        : DEFAULT_SETTINGS.bgDim,
      0,
      1,
    ),
    bgBlur: clamp(
      Number.isFinite(x.bgBlur as number)
        ? (x.bgBlur as number)
        : DEFAULT_SETTINGS.bgBlur,
      0,
      24,
    ),

    glassAlpha: clamp(
      Number.isFinite(x.glassAlpha as number)
        ? (x.glassAlpha as number)
        : DEFAULT_SETTINGS.glassAlpha,
      0,
      0.6,
    ),
    glassBlur: clamp(
      Number.isFinite(x.glassBlur as number)
        ? (x.glassBlur as number)
        : DEFAULT_SETTINGS.glassBlur,
      0,
      24,
    ),
  };

  // ✅ fixedCharacterId を「CHARACTER_OPTIONS限定」で潰さない
  // 作成キャラ + 既定キャラ のどちらにも存在しない場合だけフォールバック
  const allowed = getAllowedCharacterIds();
  if (!allowed.includes(normalized.fixedCharacterId)) {
    normalized.fixedCharacterId =
      allowed[0] ??
      CHARACTER_OPTIONS[0]?.id ??
      DEFAULT_SETTINGS.fixedCharacterId;
  }

  // パスの正規化（UIは assets/k1.png でもOKにする）
  normalized.characterOverrideSrc = normalizePublicPath(
    normalized.characterOverrideSrc,
  );

  // ✅ 背景パスの正規化
  normalized.fixedBgSrc = normalizePublicPath(normalized.fixedBgSrc);

  return normalized;
}

/**
 * ✅ useSyncExternalStore 対策：
 * getSnapshot が「同じ状態のとき同じ参照」を返さないと無限更新になる
 */
let cachedRaw: string | null = null;
let cachedSettings: AppSettings = DEFAULT_SETTINGS;

function readSnapshot(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = localStorage.getItem(KEY);

    if (raw === cachedRaw) return cachedSettings;

    const next = normalize(safeParse(raw));
    cachedRaw = raw;
    cachedSettings = next;
    return next;
  } catch {
    return cachedSettings ?? DEFAULT_SETTINGS;
  }
}

function write(next: AppSettings) {
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
  patch: Partial<AppSettings> | ((prev: AppSettings) => AppSettings),
) {
  const prev = readSnapshot();
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
  const settings = useSyncExternalStore(subscribe, readSnapshot, readSnapshot);

  const api = useMemo(
    () => ({
      set: (patch: Partial<AppSettings>) => setAppSettings(patch),
      reset: () => setAppSettings(DEFAULT_SETTINGS),
    }),
    [],
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

/** id→src を解決（見つからなければ先頭） */
export function resolveCharacterSrc(id: string) {
  const hit = CHARACTER_OPTIONS.find((c) => c.id === id);
  return hit?.src ?? CHARACTER_OPTIONS[0]?.src ?? "/assets/character-test.png";
}

/** ランダム選出（互換用：既定キャラから） */
export function pickRandomCharacterId(excludeId?: string) {
  const list = CHARACTER_OPTIONS.map((c) => c.id);
  if (list.length <= 1) return list[0] ?? "tsuduri";

  const filtered = excludeId ? list.filter((x) => x !== excludeId) : list;
  const idx = Math.floor(Math.random() * filtered.length);
  return filtered[idx] ?? list[0] ?? "tsuduri";
}
