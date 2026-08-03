import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessSettings } from "@/modules/settings";
export async function GET() { const session = await getSession(); return NextResponse.json({ success: true, allowed: Boolean(session && canAccessSettings(session)) }, { headers: { "Cache-Control": "private, no-store" } }); }
