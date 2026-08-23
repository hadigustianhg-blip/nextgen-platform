import { NextResponse } from "next/server";
import { requireSettingsApi, settingsApiError } from "@/modules/settings/settings.http";
import { reconnectJfsIntegration, JfsIntegrationError } from "@/modules/integrations/jfs-credential.service";

export async function POST() {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  try {
    const result = await reconnectJfsIntegration(access.scope);
    return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof JfsIntegrationError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return settingsApiError(error, "POST /api/settings/integrations/jfs/reconnect");
  }
}
