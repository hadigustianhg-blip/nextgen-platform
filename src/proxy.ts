import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/auth/constants";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(getSessionCookieName())) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
