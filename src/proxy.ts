import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/auth/constants";
import { redirectToPublicLogin } from "@/lib/auth/redirect";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(getSessionCookieName())) {
    return redirectToPublicLogin({
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      nextPath: request.nextUrl.pathname,
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
