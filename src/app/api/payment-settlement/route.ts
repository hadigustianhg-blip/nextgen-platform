import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadPaymentSettlement, getPaymentSettlement, paymentSettlementQuerySchema,
  paymentSettlementScope,
} from "@/modules/payment";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = paymentSettlementScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReadPaymentSettlement(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const current = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).split("-");
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = paymentSettlementQuerySchema.safeParse({
    month: raw.month || current[1],
    year: raw.year || current[0],
    outletId: raw.outletId || "",
    closingStatus: raw.closingStatus || "",
  });
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  if (parsed.data.outletId && parsed.data.outletId !== scope.outletId) {
    return NextResponse.json({ error: { code: "FORBIDDEN_OUTLET" } }, { status: 403 });
  }
  return NextResponse.json(await getPaymentSettlement(scope, parsed.data));
}

