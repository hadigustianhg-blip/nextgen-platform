import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManagePickupPayment, pickupPaymentScope, pickupPaymentVoidSchema, voidPickupPayment,
} from "@/modules/payment";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = pickupPaymentScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canManagePickupPayment(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = pickupPaymentVoidSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const data = await voidPickupPayment({ ...scope, actorId: session.userId }, (await context.params).id, parsed.data);
  return data ? NextResponse.json({ data }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}
