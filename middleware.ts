import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isValidAdminCookie } from "./src/auth/admin";
import { USERNAME_COOKIE, decodeCookieUsername, normalizeUsername } from "./src/auth/username";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin/")) {
    const ok = await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value);
    if (!ok) {
      return NextResponse.json({ error: "未登录管理台" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const raw = request.cookies.get(USERNAME_COOKIE)?.value;
  const username = raw ? normalizeUsername(decodeCookieUsername(raw)) : null;
  if (username) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("needLogin", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/play/:path*", "/poet/:path*", "/api/admin/:path*"],
};
