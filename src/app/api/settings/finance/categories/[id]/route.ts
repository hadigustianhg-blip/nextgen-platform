import { NextResponse } from "next/server";
import { financialCategorySchema, requireSettingsApi, settingsApiError, updateFinancialCategory } from "@/modules/settings";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) { const access = await requireSettingsApi(); if ("response" in access) return access.response; const parsed = financialCategorySchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 }); try { return NextResponse.json({ success: true, data: await updateFinancialCategory(access.scope, (await context.params).id, parsed.data) }); } catch (error) { return settingsApiError(error); } }
