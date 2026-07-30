import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deliveryScope } from "@/modules/delivery-settlement";
import {
  canSyncWaybillStuck,
  syncWaybillStuckDelivery,
  waybillStuckSyncSchema,
} from "@/modules/quality-control";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  if (!canSyncWaybillStuck(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses sinkronisasi ditolak." } }, { status: 403 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  const parsed = waybillStuckSyncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Business Date tidak valid." } }, { status: 400 });
  try {
    return NextResponse.json(await syncWaybillStuckDelivery({
      ...scope,
      actorId: session.userId,
      businessDate: parsed.data.businessDate,
    }));
  } catch {
    return NextResponse.json({ error: { code: "SYNC_FAILED", message: "Sinkronisasi Waybill Stuck Delivery gagal." } }, { status: 502 });
  }
}
