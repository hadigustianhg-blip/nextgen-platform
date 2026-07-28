import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/modules/auth/auth.service";

export async function POST(request: Request) {
  const session = await getSession();
  if (session) await logout(session);
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
