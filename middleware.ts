import { NextRequest, NextResponse } from "next/server";
import { USERNAME_COOKIE, decodeCookieUsername, normalizeUsername } from "./src/auth/username";

export function middleware(request: NextRequest) {
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
  matcher: ["/play/:path*", "/poet/:path*"],
};
