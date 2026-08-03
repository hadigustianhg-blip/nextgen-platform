import { NextResponse } from "next/server";
import { getIntegrationStatus, requireSettingsApi, settingsApiError } from "@/modules/settings";
export async function GET() { const access = await requireSettingsApi(); if ("response" in access) return access.response; try { return NextResponse.json({ success: true, data: await getIntegrationStatus(access.scope) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return settingsApiError(error); } }
