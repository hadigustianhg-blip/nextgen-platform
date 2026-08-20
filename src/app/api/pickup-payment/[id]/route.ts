import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManagePickupPayment, canReadPickupPayment, getPickupPaymentDetail, pickupPaymentScope,
  pickupPaymentUpdateSchema, updatePickupPaymentWithProof,
} from "@/modules/payment";
import { isSameOriginRequest, pickupPaymentErrorStatus, pickupPaymentRequestPayload } from "@/modules/payment/pickup-payment.http";

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
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: { code: "ORIGIN_MISMATCH" } }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canManagePickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const payload = await pickupPaymentRequestPayload(request);
  const parsed = pickupPaymentUpdateSchema.safeParse(payload.values);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    const data = await updatePickupPaymentWithProof({ ...scope, actorId: session.userId }, (await context.params).id, parsed.data, payload.proof);
    return data ? NextResponse.json({ data }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_FAILED";
    return NextResponse.json({ error: { code } }, { status: pickupPaymentErrorStatus(code) });
  }
}
