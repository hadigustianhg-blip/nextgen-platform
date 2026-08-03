import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canManageProfitLoss, createAdjustment, profitLossAdjustmentSchema, profitLossScope } from "@/modules/profit-loss";
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageProfitLoss(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = profitLossScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = profitLossAdjustmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json({ data: await createAdjustment({ ...scope, actorId: session.userId }, parsed.data) }, { status: 201 });
}
