// src/lib/appSettings.ts
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type CharacterMode = "fixed" | "random";

export type AppSettings = {
  version: 1;

  // ===== キャラ表示（※人格は characterStore 側が正本）=====
  characterEnabled: boolean;
  characterMode: CharacterMode;
  /** ✅ characterStore の CharacterProfile.id を入れる */
  fixedCharacterId: string;
  /** 0.7〜5.0 推奨（見た目は PageShell 側で clamp と合成） */
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
};

const KEY = "tsuduri_app_settings_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,

  characterEnabled: true,
  characterMode: "fixed",
  fixedCharacterId: "", // ✅ 実際の初期値は PageShell 側で activeId/先頭に寄せる
  characterScale: 1.15,
  characterOpacity: 1,

  bgDim: 0.55,
  bgBlur: 0,
  infoPanelAlpha: 0,
};

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

  const normalized: AppSettings = {
    version: 1,

    characterEnabled:
      typeof x.characterEnabled === "boolean"
        ? x.characterEnabled
        : DEFAULT_SETTINGS.characterEnabled,
    characterMode: x.characterMode === "random" ? "random" : "fixed",
    fixedCharacterId:
      typeof x.fixedCharacterId === "string"
        ? x.fixedCharacterId
        : DEFAULT_SETTINGS.fixedCharacterId,
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
  };

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
