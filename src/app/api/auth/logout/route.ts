import { NextResponse } from "next/server";
import { getAnySession } from "@/lib/auth/session";
import { logout } from "@/modules/auth/auth.service";

export async function POST(request: Request) {
  const session = await getAnySession();
  if (session) await logout(session);
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
