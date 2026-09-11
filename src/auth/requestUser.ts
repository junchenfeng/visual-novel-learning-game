import { cookies } from "next/headers";
import { decodeCookieUsername, normalizeUsername, USERNAME_COOKIE, USERNAME_MAX_AGE_SECONDS } from "./username";

export async function readUsername(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(USERNAME_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  return normalizeUsername(decodeCookieUsername(raw));
}

export async function writeUsernameCookie(username: string) {
  const jar = await cookies();
  jar.set(USERNAME_COOKIE, encodeURIComponent(username), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: USERNAME_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearUsernameCookie() {
  const jar = await cookies();
  jar.set(USERNAME_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}
