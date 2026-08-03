import { NextResponse } from "next/server";
import { getMaintenancePreview, requireSettingsApi, settingsApiError } from "@/modules/settings";
export async function GET() { const access = await requireSettingsApi(); if ("response" in access) return access.response; try { return NextResponse.json({ success: true, data: await getMaintenancePreview(access.scope) }); } catch (error) { return settingsApiError(error, "GET /api/settings/maintenance/preview"); } }
