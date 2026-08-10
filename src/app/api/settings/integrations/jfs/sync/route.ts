import { NextResponse } from "next/server";
import { runMultiOutletSyncForScope } from "@/modules/integrations/jfs-background-sync.service";
import { requireSettingsApi, settingsApiError } from "@/modules/settings/settings.http";

export async function POST() {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;

  try {
    const results = await runMultiOutletSyncForScope(access.scope.tenantId, access.scope.outletId);
    return NextResponse.json({
      success: true,
      data: results,
      message: "Sinkronisasi dataset JFS berhasil diproses.",
    });
  } catch (err) {
    return settingsApiError(err);
  }
}
