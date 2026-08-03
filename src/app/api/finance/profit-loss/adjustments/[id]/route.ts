import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canManageProfitLoss, profitLossAdjustmentSchema, profitLossScope, profitLossVoidSchema, updateAdjustment, voidAdjustment } from "@/modules/profit-loss";
type Context = { params: Promise<{ id: string }> };
async function auth() {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  if (!canManageProfitLoss(session)) return { response: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  const scope = profitLossScope(session);
  return scope ? { context: { ...scope, actorId: session.userId } } : { response: NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 }) };
}
export async function PATCH(request: Request, context: Context) {
  const access = await auth(); if (access.response) return access.response;
  const parsed = profitLossAdjustmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json({ data: await updateAdjustment(access.context!, (await context.params).id, parsed.data) });
}
export async function DELETE(request: Request, context: Context) {
  const access = await auth(); if (access.response) return access.response;
  const parsed = profitLossVoidSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json({ data: await voidAdjustment(access.context!, (await context.params).id, parsed.data.reason) });
}
