import { NextResponse } from "next/server";

function loginPath(nextPath?: string) {
  const query = nextPath
    ? `?${new URLSearchParams({ next: nextPath }).toString()}`
    : "";
  return `/login${query}`;
}

export function redirectToLogin({
  nextPath,
  status = 307,
}: {
  nextPath?: string;
  status?: 303 | 307;
} = {}) {
  return new NextResponse(null, {
    status,
    headers: { Location: loginPath(nextPath) },
  });
}

export function redirectToPublicLogin({
  appUrl,
  nextPath,
}: {
  appUrl: string | undefined;
  nextPath?: string;
}) {
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is required");

  const publicUrl = new URL(appUrl);
  if (!["http:", "https:"].includes(publicUrl.protocol)) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }

  return NextResponse.redirect(new URL(loginPath(nextPath), publicUrl), 307);
}
