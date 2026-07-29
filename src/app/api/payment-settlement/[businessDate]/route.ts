import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  businessDateParamSchema, canReadPaymentSettlement, getPaymentSettlementDay,
  paymentSettlementScope,
} from "@/modules/payment";

export async function GET(_: Request, context: { params: Promise<{ businessDate: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = paymentSettlementScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReadPaymentSettlement(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = businessDateParamSchema.safeParse((await context.params).businessDate);
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_DATE" } }, { status: 400 });
  const data = await getPaymentSettlementDay(scope, parsed.data);
  return data ? NextResponse.json({ data }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}
