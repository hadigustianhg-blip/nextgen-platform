import { NextResponse } from "next/server";
import { getIntegrationStatus, requireSettingsApi, settingsApiError } from "@/modules/settings";
import manifest from "../../../../../extensions/nextgen-jfs-helper/manifest.json";
import { isDevelopmentDistributionEnabled } from "@/modules/integrations/jfs-helper-distribution";

export async function GET() {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  try {
    const data = await getIntegrationStatus(access.scope);
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        jfsWaybillHelper: isDevelopmentDistributionEnabled()
          ? { available: true, version: manifest.version }
          : undefined,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return settingsApiError(error, "GET /api/settings/integrations");
  }
}
