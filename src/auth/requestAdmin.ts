import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE_SECONDS,
  expectedAdminCookie,
  isValidAdminCookie,
} from "./admin";

export async function readAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return isValidAdminCookie(jar.get(ADMIN_COOKIE)?.value);
}

export async function writeAdminCookie() {
  const value = await expectedAdminCookie();
  if (!value) {
    throw new Error("未配置 POEM_ADMIN_PASSWORD");
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}
