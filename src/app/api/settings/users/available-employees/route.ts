import { NextResponse } from "next/server";
import { listAvailableSalaryEmployees, requireSettingsApi, settingsApiError } from "@/modules/settings";

export async function GET() {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  try {
    return NextResponse.json({ success: true, data: await listAvailableSalaryEmployees(access.scope) });
  } catch (error) {
    return settingsApiError(error, "settings.users.available-employees");
  }
}
