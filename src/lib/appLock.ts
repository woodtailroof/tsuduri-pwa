// src/lib/appLock.ts

const APP_LOCK_SESSION_KEY = "tsuduri_app_session_unlocked_v3";

const HASH_PARTS = [
  "4ac4a02e0ced",
  "fc9e15a5afdd",
  "6e3cf9aa7c37",
  "b3df23347c73",
  "881550915c33",
  "8c96",
] as const;

function getExpectedHashHex(): string {
  return HASH_PARTS.join("");
}

function getCryptoOrThrow(): Crypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("このブラウザでは Web Crypto API が使えません。");
  }
  return window.crypto;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const cryptoObj = getCryptoOrThrow();
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await cryptoObj.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * いまは「共通固定パスワード方式」なので常に true 扱い。
 */
export function hasAppPassword(): boolean {
  return true;
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

/**
 * 旧版からの移行で残っている端末ローカル値は使わない。
 * 誤動作防止のため掃除だけする。
 */
export async function migrateLegacyPlaintextLock(): Promise<void> {
  try {
    localStorage.removeItem("tsuduri_app_pass_v1");
    localStorage.removeItem("tsuduri_app_unlocked_v1");
    localStorage.removeItem("tsuduri_app_lock_v2");
    sessionStorage.removeItem("tsuduri_app_session_unlocked_v2");
  } catch {
    // ignore
  }
}

export async function verifyAppPassword(password: string): Promise<boolean> {
  const trimmed = password.trim();
  if (!trimmed) return false;

  const actual = await sha256Hex(trimmed);
  const expected = getExpectedHashHex();

  return timingSafeEqualString(actual, expected);
}

/**
 * 固定共通パスワード方式なので、設定画面から変更や削除は不可。
 * もし呼ばれても false / no-op を返す。
 */
export async function changeAppPassword(): Promise<boolean> {
  return false;
}

export function clearAppPassword() {
  // 固定共通パスワード方式では削除しない
}
