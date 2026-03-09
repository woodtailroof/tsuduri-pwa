// src/lib/appLock.ts

export type StoredAppLock = {
  version: 2;
  saltB64: string;
  hashB64: string;
  iterations: number;
  createdAt: string;
};

const APP_LOCK_STORAGE_KEY = "tsuduri_app_lock_v2";
const APP_LOCK_SESSION_KEY = "tsuduri_app_session_unlocked_v2";

// 旧 Home.tsx の簡易ロック用キー（自動移行に使う）
const LEGACY_APP_LOCK_PASS_KEY = "tsuduri_app_pass_v1";
const LEGACY_APP_LOCK_UNLOCKED_KEY = "tsuduri_app_unlocked_v1";

const PBKDF2_ITERATIONS = 150_000;

function getCryptoOrThrow(): Crypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("このブラウザでは Web Crypto API が使えません。");
  }
  return window.crypto;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const cryptoObj = getCryptoOrThrow();
  const enc = new TextEncoder();
  const passwordBytes = enc.encode(password);

  const keyMaterial = await cryptoObj.subtle.importKey(
    "raw",
    toArrayBuffer(passwordBytes),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await cryptoObj.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return new Uint8Array(bits);
}

export function getStoredAppLock(): StoredAppLock | null {
  try {
    const raw = localStorage.getItem(APP_LOCK_STORAGE_KEY);
    const parsed = safeJsonParse<StoredAppLock | null>(raw, null);

    if (!parsed) return null;
    if (parsed.version !== 2) return null;
    if (!parsed.saltB64 || !parsed.hashB64 || !parsed.iterations) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function hasAppPassword(): boolean {
  return !!getStoredAppLock();
}

export function isSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(APP_LOCK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSessionUnlocked(unlocked: boolean) {
  try {
    if (unlocked) {
      sessionStorage.setItem(APP_LOCK_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

export async function setupAppPassword(password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error("パスワードが空です。");
  }

  const cryptoObj = getCryptoOrThrow();
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(trimmed, salt, PBKDF2_ITERATIONS);

  const payload: StoredAppLock = {
    version: 2,
    saltB64: bytesToBase64(salt),
    hashB64: bytesToBase64(hash),
    iterations: PBKDF2_ITERATIONS,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(APP_LOCK_STORAGE_KEY, JSON.stringify(payload));
}

export async function verifyAppPassword(password: string): Promise<boolean> {
  const trimmed = password.trim();
  if (!trimmed) return false;

  const stored = getStoredAppLock();
  if (!stored) return false;

  const salt = base64ToBytes(stored.saltB64);
  const expectedHash = base64ToBytes(stored.hashB64);
  const actualHash = await derivePasswordHash(
    trimmed,
    salt,
    stored.iterations || PBKDF2_ITERATIONS,
  );

  return timingSafeEqual(expectedHash, actualHash);
}

export async function changeAppPassword(
  currentPassword: string,
  nextPassword: string,
): Promise<boolean> {
  const ok = await verifyAppPassword(currentPassword);
  if (!ok) return false;

  await setupAppPassword(nextPassword);
  return true;
}

export function clearAppPassword() {
  try {
    localStorage.removeItem(APP_LOCK_STORAGE_KEY);
    sessionStorage.removeItem(APP_LOCK_SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function migrateLegacyPlaintextLock(): Promise<void> {
  try {
    const alreadyMigrated = hasAppPassword();
    const legacyPass = (
      localStorage.getItem(LEGACY_APP_LOCK_PASS_KEY) ?? ""
    ).trim();
    const legacyUnlocked =
      localStorage.getItem(LEGACY_APP_LOCK_UNLOCKED_KEY) === "1";

    if (!alreadyMigrated && legacyPass) {
      await setupAppPassword(legacyPass);
      if (legacyUnlocked) {
        setSessionUnlocked(true);
      }
    }

    localStorage.removeItem(LEGACY_APP_LOCK_PASS_KEY);
    localStorage.removeItem(LEGACY_APP_LOCK_UNLOCKED_KEY);
  } catch {
    // ignore
  }
}
