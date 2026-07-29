import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadCashFlow, cashFlowListSchema, cashFlowScope, listCashFlow,
} from "@/modules/payment";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = cashFlowScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReadCashFlow(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = cashFlowListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json(await listCashFlow({ ...scope, ...parsed.data }));
}

