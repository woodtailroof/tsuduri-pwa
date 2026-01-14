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

  // ===== 表示 =====
  /** 背景暗幕 0〜1 */
  bgDim: number;
  /** 背景ぼかし(px) */
  bgBlur: number;
  /** 情報レイヤー背面の「板」不透明度 0〜1（文字は薄くしない） */
  infoPanelAlpha: number;

  // ===== 追加: 任意の画像パスで上書き =====
  /** public 配下の画像パス（例: "/assets/k1.png" や "assets/k1.png"） 空ならデフォルト */
  characterOverrideSrc?: string;
};

const KEY = "tsuduri_app_settings_v1";

// ここは「最初の気持ちよさ」重視の初期値
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "tsuduri",
  characterScale: 1.15,
  characterOpacity: 1,

  bgDim: 0.55,
  bgBlur: 0,
  infoPanelAlpha: 0,

  characterOverrideSrc: "",
};

// キャラ候補（ここ増やせばUIに出る）
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
  const x = (input ?? {}) as Partial<AppSettings>;

  const fixedId =
    typeof x.fixedCharacterId === "string" && x.fixedCharacterId.trim()
      ? x.fixedCharacterId.trim()
      : DEFAULT_SETTINGS.fixedCharacterId;

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

    characterOverrideSrc:
      typeof x.characterOverrideSrc === "string" ? x.characterOverrideSrc : "",
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

/**
 * ✅ useSyncExternalStore 対策：
 * getSnapshot が「同じ状態のとき同じ参照」を返さないと無限更新になる。
 * localStorage の raw が変わらない限り、同じ settings オブジェクトを返す。
 */
let cachedRaw: string | null = null;
let cachedSettings: AppSettings = DEFAULT_SETTINGS;

function readSnapshot(): AppSettings {
  // SSR/ビルド環境対策
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = localStorage.getItem(KEY);

    // ✅ raw が同じなら「同じ参照」を返す（これが重要）
    if (raw === cachedRaw) return cachedSettings;

    const next = normalize(safeParse(raw));

    cachedRaw = raw;
    cachedSettings = next;
    return next;
  } catch {
    // ここで毎回 DEFAULT_SETTINGS を返すと参照が安定しないケースがあるので、
    // 直近キャッシュを返す（空なら初期値）
    return cachedSettings ?? DEFAULT_SETTINGS;
  }
}

function write(next: AppSettings) {
  try {
    const raw = JSON.stringify(next);
    localStorage.setItem(KEY, raw);

    // ✅ 書いた内容でキャッシュも更新（同一タブの readSnapshot 安定化）
    cachedRaw = raw;
    cachedSettings = next;
  } catch {
    // ignore
  }

  // 同一タブ内へ通知
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
  // ✅ getSnapshot が安定参照を返すので #185 を回避できる
  const settings = useSyncExternalStore(subscribe, readSnapshot, readSnapshot);

  const api = useMemo(
    () => ({
      set: (patch: Partial<AppSettings>) => setAppSettings(patch),
      reset: () => setAppSettings(DEFAULT_SETTINGS),
    }),
    []
  );

  // iOS Safari などで「戻る/復帰」で storage が遅れて見える時の保険
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

/** ランダム選出（同じ候補が続きにくい程度のゆるい乱数） */
export function pickRandomCharacterId(excludeId?: string) {
  const list = CHARACTER_OPTIONS.map((c) => c.id);
  if (list.length <= 1) return list[0] ?? "tsuduri";

  const filtered = excludeId ? list.filter((x) => x !== excludeId) : list;
  const idx = Math.floor(Math.random() * filtered.length);
  return filtered[idx] ?? list[0] ?? "tsuduri";
}

/** ✅ パスを正規化（"assets/xxx.png" → "/assets/xxx.png"） */
export function normalizePublicPath(p: string) {
  const s = (p ?? "").trim();
  if (!s) return "";
  if (s.startsWith("/")) return s;
  return `/${s}`;
}
