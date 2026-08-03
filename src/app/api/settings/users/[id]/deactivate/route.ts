import { NextResponse } from "next/server";
import { requireSettingsApi, setSettingsUserStatus, settingsApiError } from "@/modules/settings";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;
  try {
    return NextResponse.json(await setSettingsUserStatus(access.scope, (await context.params).id, "SUSPENDED"));
  } catch (error) {
    return settingsApiError(error, "settings.users.deactivate");
  }
}
