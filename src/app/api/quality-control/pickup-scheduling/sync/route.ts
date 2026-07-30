import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deliveryScope } from "@/modules/delivery-settlement";
import { canSyncPickupScheduling, pickupSchedulingSyncSchema, syncPickupScheduling } from "@/modules/quality-control";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canSyncPickupScheduling(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = pickupSchedulingSyncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    return NextResponse.json(await syncPickupScheduling({
      ...scope, actorId: session.userId,
      startDate: parsed.data.startDate, endDate: parsed.data.endDate,
    }));
  } catch (error) {
    const conflict = error instanceof Error && "code" in error && error.code === "SYNC_IN_PROGRESS";
    return NextResponse.json({ error: { code: conflict ? "SYNC_IN_PROGRESS" : "SYNC_FAILED" } }, { status: conflict ? 409 : 502 });
  }
}
