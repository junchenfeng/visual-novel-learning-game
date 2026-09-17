export const USERNAME_COOKIE = "poem_user";
export const USERNAME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const USERNAME_PATTERN = /^[\u4e00-\u9fffA-Za-z0-9_-]{2,32}$/;

export function decodeCookieUsername(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function normalizeUsername(raw: string): string | null {
  const username = raw.trim();
  if (!USERNAME_PATTERN.test(username)) {
    return null;
  }
  return username;
}

export function usernameHint() {
  return "2–32 个字，可用中文、字母、数字、下划线和短横线";
}
