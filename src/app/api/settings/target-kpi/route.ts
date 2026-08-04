import { NextResponse } from "next/server";
import { getEffectiveOperationalTargets, requireSettingsApi, settingsApiError, targetKpiUpdateSchema, updateOperationalTargets } from "@/modules/settings";

export async function GET() {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  try {
    return NextResponse.json({ success: true, data: await getEffectiveOperationalTargets(access.scope) });
  } catch (error) {
    return settingsApiError(error, "settings.target-kpi.read");
  }
}

export async function PUT(request: Request) {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  const parsed = targetKpiUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    return NextResponse.json({ success: true, data: await updateOperationalTargets(access.scope, parsed.data) });
  } catch (error) {
    return settingsApiError(error, "settings.target-kpi.update");
  }
}
