import { NextResponse } from "next/server";
import { getOwnerControlPlaneOverview } from "@/modules/integrations/jfs-owner-control.service";
import { requireSettingsApi, settingsApiError } from "@/modules/settings/settings.http";

export async function GET() {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;

  try {
    const overview = await getOwnerControlPlaneOverview();
    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (err) {
    return settingsApiError(err);
  }
}
