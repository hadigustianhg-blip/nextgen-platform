import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deliveryScope } from "@/modules/delivery-settlement";
import { canReadPickupScheduling, listPickupScheduling, pickupSchedulingQuerySchema } from "@/modules/quality-control";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadPickupScheduling(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = pickupSchedulingQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json(await listPickupScheduling({ ...scope, ...parsed.data }));
}
