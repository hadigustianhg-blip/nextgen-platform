import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canCreateManualCashFlow, cashFlowScope, createManualIncome, manualIncomeSchema,
} from "@/modules/payment";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = cashFlowScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canCreateManualCashFlow(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = manualIncomeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  return NextResponse.json({ data: await createManualIncome({ ...scope, actorId: session.userId }, parsed.data) }, { status: 201 });
}

