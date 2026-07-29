import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManagePickupPayment, canReadPickupPayment, getPickupPaymentDetail, pickupPaymentScope,
  pickupPaymentUpdateSchema, updatePickupPayment,
} from "@/modules/payment";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReadPickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const data = await getPickupPaymentDetail(scope, (await context.params).id);
  return data ? NextResponse.json({ data }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canManagePickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = pickupPaymentUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    const data = await updatePickupPayment({ ...scope, actorId: session.userId }, (await context.params).id, parsed.data);
    return data ? NextResponse.json({ data }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_FAILED";
    return NextResponse.json({ error: { code } }, { status: 409 });
  }
}

