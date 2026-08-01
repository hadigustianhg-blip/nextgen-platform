import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canCreatePickupPayment, canReadPickupPayment, createPickupPayment, listPickupPayment,
  pickupPaymentInputSchema, pickupPaymentListSchema, pickupPaymentScope,
} from "@/modules/payment";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReadPickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = pickupPaymentListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json(await listPickupPayment({ ...scope, ...parsed.data }));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canCreatePickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = pickupPaymentInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  try {
    const payment = await createPickupPayment({ ...scope, actorId: session.userId }, parsed.data);
    return payment ? NextResponse.json({ data: payment }, { status: 201 }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_FAILED";
    const message = code === "PICKUP_PAYMENT_NOT_CASH_SETTLEMENT"
      ? "Waybill ini bukan Pickup Tunai dan tidak dapat diproses melalui Pickup Payment."
      : undefined;
    return NextResponse.json({ error: { code, message } }, { status: code === "OVERPAYMENT_CONFIRMATION_REQUIRED" ? 409 : 400 });
  }
}
