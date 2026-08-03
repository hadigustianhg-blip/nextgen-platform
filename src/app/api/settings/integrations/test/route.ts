import { NextResponse } from "next/server";
import { requireSettingsApi, settingsApiError, testSettingsConnections } from "@/modules/settings";
export async function POST() { const access = await requireSettingsApi(); if ("response" in access) return access.response; try { return NextResponse.json({ success: true, data: await testSettingsConnections(access.scope) }); } catch (error) { return settingsApiError(error); } }
