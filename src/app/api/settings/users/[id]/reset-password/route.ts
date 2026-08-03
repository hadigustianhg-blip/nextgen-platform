import { NextResponse } from "next/server";
import { requireSettingsApi, resetPasswordSchema, resetSettingsUserPassword, settingsApiError } from "@/modules/settings";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { const access = await requireSettingsApi(); if ("response" in access) return access.response; const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 }); try { return NextResponse.json(await resetSettingsUserPassword(access.scope, (await context.params).id, parsed.data.password)); } catch (error) { return settingsApiError(error); } }
