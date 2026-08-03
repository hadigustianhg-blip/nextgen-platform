import { NextResponse } from "next/server";
import { listSettingsUsers, requireSettingsApi, settingsApiError } from "@/modules/settings";
export async function GET() { const access = await requireSettingsApi(); if ("response" in access) return access.response; try { return NextResponse.json({ success: true, data: await listSettingsUsers(access.scope) }); } catch (error) { return settingsApiError(error); } }
