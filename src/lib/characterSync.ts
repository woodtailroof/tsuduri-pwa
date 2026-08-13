export const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";
export const SELECTED_CHARACTER_ID_KEY = "tsuduri_selected_character_id_v2";
export const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";

const CHARACTER_SYNC_META_KEY = "tsuduri_character_sync_meta_v1";
const LEGACY_CHARACTER_BACKUP_KEY = "tsuduri_characters_backup_v1";

export type CharacterImageMap = Record<string, string>;

export type CharacterSettingsPush = {
  mode: "seed" | "update";
  updatedAt: string;
  characters: unknown[];
  selectedId: string;
  imageMap: CharacterImageMap;
};

export type CharacterSettingsRemote = Omit<CharacterSettingsPush, "mode">;

type CharacterSyncMeta = {
  initialized: boolean;
  dirty: boolean;
  explicit: boolean;
  updatedAt: string;
};

function storageSafe(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readMeta(): CharacterSyncMeta {
  const storage = storageSafe();
  const parsed = parseJson<Partial<CharacterSyncMeta>>(
    storage?.getItem(CHARACTER_SYNC_META_KEY) ?? null,
    {},
  );
  const legacyBackup = parseJson<{ at?: unknown }>(
    storage?.getItem(LEGACY_CHARACTER_BACKUP_KEY) ?? null,
    {},
  );
  const legacyUpdatedAt =
    typeof legacyBackup.at === "string" &&
    Number.isFinite(Date.parse(legacyBackup.at))
      ? legacyBackup.at
      : new Date(0).toISOString();

  return {
    initialized: parsed.initialized === true,
    dirty: parsed.dirty === true,
    explicit: parsed.explicit === true,
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt
        ? parsed.updatedAt
        : legacyUpdatedAt,
  };
}

function writeMeta(meta: CharacterSyncMeta) {
  storageSafe()?.setItem(CHARACTER_SYNC_META_KEY, JSON.stringify(meta));
}

function normalizeImageMap(raw: unknown): CharacterImageMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CharacterImageMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && key.trim()) out[key] = value;
  }
  return out;
}

export function readLocalCharacterSettings(): CharacterSettingsRemote | null {
  const storage = storageSafe();
  if (!storage) return null;

  const characters = parseJson<unknown>(
    storage.getItem(CHARACTERS_STORAGE_KEY),
    [],
  );
  if (!Array.isArray(characters) || characters.length === 0) return null;

  const firstId =
    typeof characters[0] === "object" && characters[0]
      ? String((characters[0] as { id?: unknown }).id ?? "tsuduri")
      : "tsuduri";
  const selectedId =
    storage.getItem(SELECTED_CHARACTER_ID_KEY)?.trim() || firstId;
  const imageMap = normalizeImageMap(
    parseJson<unknown>(storage.getItem(CHARACTER_IMAGE_MAP_KEY), {}),
  );
  const meta = readMeta();

  return {
    updatedAt: meta.updatedAt,
    characters,
    selectedId,
    imageMap,
  };
}

export function collectPendingCharacterSettings(): CharacterSettingsPush | null {
  const local = readLocalCharacterSettings();
  if (!local) return null;
  const meta = readMeta();
  if (meta.initialized && !meta.dirty) return null;

  const epoch = new Date(0).toISOString();
  const updatedAt =
    meta.updatedAt === epoch ? new Date().toISOString() : meta.updatedAt;

  return {
    ...local,
    updatedAt,
    mode: meta.initialized || meta.explicit ? "update" : "seed",
  };
}

export function markCharacterSettingsDirty() {
  const current = readMeta();
  writeMeta({
    initialized: current.initialized,
    dirty: true,
    explicit: true,
    updatedAt: new Date().toISOString(),
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tsuduri-character-dirty"));
    window.dispatchEvent(new Event("tsuduri-characters"));
  }
}

export function markCharacterSettingsPushComplete(updatedAt: string) {
  const current = readMeta();
  if (current.updatedAt !== updatedAt) return;
  writeMeta({ initialized: true, dirty: false, explicit: false, updatedAt });
}

export function applyRemoteCharacterSettings(
  remote: CharacterSettingsRemote | null | undefined,
): boolean {
  if (
    !remote ||
    !Array.isArray(remote.characters) ||
    !remote.characters.length
  ) {
    return false;
  }

  const storage = storageSafe();
  if (!storage) return false;

  storage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(remote.characters));
  storage.setItem(SELECTED_CHARACTER_ID_KEY, remote.selectedId || "tsuduri");
  storage.setItem(
    CHARACTER_IMAGE_MAP_KEY,
    JSON.stringify(normalizeImageMap(remote.imageMap)),
  );
  writeMeta({
    initialized: true,
    dirty: false,
    explicit: false,
    updatedAt: remote.updatedAt || new Date().toISOString(),
  });

  window.dispatchEvent(new Event("tsuduri-characters"));
  window.dispatchEvent(new Event("tsuduri-settings"));
  return true;
}

export function toCharacterFolderValue(raw: string): string {
  let value = String(raw ?? "")
    .trim()
    .replace(/\\/g, "/");
  value = value.replace(/^\/?assets\/characters\//i, "");
  return value.replace(/^\/+|\/+$/g, "");
}

export function resolveCharacterFolderPath(raw: string): string {
  const folder = toCharacterFolderValue(raw);
  return folder ? `/assets/characters/${folder}/` : "";
}
