import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessSettings } from "./settings.authorization";
import { SettingsError } from "./settings.service";
import { settingsScope } from "./settings.types";

export async function requireSettingsApi() {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 }) } as const;
  if (!canAccessSettings(session)) return { response: NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 }) } as const;
  const scope = settingsScope(session);
  if (!scope) return { response: NextResponse.json({ success: false, error: { code: "OUTLET_REQUIRED" } }, { status: 400 }) } as const;
  return { session, scope } as const;
}
export function settingsApiError(error: unknown) { if (error instanceof SettingsError) return NextResponse.json({ success: false, error: { code: error.code } }, { status: error.status }); const code = (error as { code?: string })?.code === "P2002" ? "DUPLICATE_VALUE" : "SETTINGS_REQUEST_FAILED"; return NextResponse.json({ success: false, error: { code } }, { status: code === "DUPLICATE_VALUE" ? 409 : 500 }); }
