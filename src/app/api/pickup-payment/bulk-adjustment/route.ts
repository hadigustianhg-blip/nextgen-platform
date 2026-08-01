import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  bulkAdjustPickupPayments,
  canManagePickupPayment,
  pickupPaymentBulkAdjustmentSchema,
  pickupPaymentScope,
} from "@/modules/payment";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canManagePickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = pickupPaymentBulkAdjustmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message },
    }, { status: 400 });
  }
  try {
    const data = await bulkAdjustPickupPayments({ ...scope, actorId: session.userId }, parsed.data);
    return NextResponse.json({ data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BULK_ADJUSTMENT_FAILED";
    const status = code === "PICKUP_PAYMENT_NOT_FOUND" ? 404 : code.includes("CONFLICT") ? 409 : 400;
    const message = code === "PICKUP_PAYMENT_NOT_CASH_SETTLEMENT"
      ? "Waybill ini bukan Pickup Tunai dan tidak dapat diproses melalui Pickup Payment."
      : undefined;
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
