export const ADMIN_COOKIE = "poem_admin";
export const ADMIN_USERNAME = "nova-admin";
export const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 8;
const HMAC_MESSAGE = "poem-admin";

export function isAdminUsername(name: string): boolean {
  return name.trim().toLowerCase() === ADMIN_USERNAME;
}

export function getAdminPassword(): string {
  return process.env.POEM_ADMIN_PASSWORD?.trim() ?? "";
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(signature);
}

export async function expectedAdminCookie(): Promise<string | null> {
  const password = getAdminPassword();
  if (!password) {
    return null;
  }
  return hmacHex(password, HMAC_MESSAGE);
}

export async function passwordsMatch(input: string): Promise<boolean> {
  const password = getAdminPassword();
  if (!password) {
    return false;
  }
  const left = await hmacHex(password, input);
  const right = await hmacHex(password, password);
  return timingSafeEqualString(left, right);
}

export async function isValidAdminCookie(raw: string | undefined): Promise<boolean> {
  const expected = await expectedAdminCookie();
  if (!expected || !raw) {
    return false;
  }
  return timingSafeEqualString(raw, expected);
}

function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
