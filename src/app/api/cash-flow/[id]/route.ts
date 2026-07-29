import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageManualCashFlow, cashFlowScope, updateManualMovement, updateManualMovementSchema,
} from "@/modules/payment";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = cashFlowScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canManageManualCashFlow(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = updateManualMovementSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    const movement = await updateManualMovement({ ...scope, actorId: session.userId }, (await context.params).id, parsed.data);
    return movement ? NextResponse.json({ data: movement }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UPDATE_FAILED";
    return NextResponse.json({ error: { code } }, { status: 409 });
  }
}

