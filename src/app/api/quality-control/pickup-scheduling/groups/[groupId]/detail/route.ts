import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { deliveryScope } from "@/modules/delivery-settlement";
import { canViewPickupSchedulingSensitive, getPickupSchedulingDetail, pickupSchedulingSyncSchema } from "@/modules/quality-control";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request, context: { params: Promise<{ groupId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
  if (!canViewPickupSchedulingSensitive(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403, headers: noStore });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400, headers: noStore });
  const parsed = pickupSchedulingSyncSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400, headers: noStore });
  try {
    const { groupId } = await context.params;
    const requestId = request.headers.get("x-request-id") || randomUUID();
    return NextResponse.json(await getPickupSchedulingDetail({
      ...scope, actorId: session.userId,
      startDate: parsed.data.startDate, endDate: parsed.data.endDate,
      groupId, sessionOutletCode: session.outletCode, requestId,
    }), { headers: noStore });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return NextResponse.json(
      { error: { code: code === "NOT_FOUND" ? "GROUP_NOT_FOUND" : "DETAIL_UNAVAILABLE" } },
      { status: code === "NOT_FOUND" ? 404 : 502, headers: noStore },
    );
  }
}
