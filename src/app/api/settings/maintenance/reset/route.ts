import { NextResponse } from "next/server";
import {
  maintenanceResetSchema,
  requireSettingsApi,
  resetMaintenanceCandidate,
  settingsApiError,
} from "@/modules/settings";

export async function POST(request: Request) {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  const parsed = maintenanceResetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      error: { code: "VALIDATION_ERROR", fieldErrors: parsed.error.flatten().fieldErrors },
    }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, data: await resetMaintenanceCandidate(access.scope, parsed.data) });
  } catch (error) {
    return settingsApiError(error, "POST /api/settings/maintenance/reset");
  }
}
