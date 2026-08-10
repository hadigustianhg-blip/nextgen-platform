import { NextResponse } from "next/server";
import { requireSettingsApi, settingsApiError } from "@/modules/settings/settings.http";
import { connectJfsIntegration, JfsIntegrationError } from "@/modules/integrations/jfs-credential.service";

export async function POST(request: Request) {
  const access = await requireSettingsApi();
  if ("response" in access) return access.response;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await connectJfsIntegration(access.scope, {
      account: body?.account,
      password: body?.password,
    });

    return NextResponse.json(
      { success: true, data: result, message: "Koneksi JFS berhasil dihubungkan" },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof JfsIntegrationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    return settingsApiError(error, "POST /api/settings/integrations/jfs/connect");
  }
}
