import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canSyncDelivery, deliveryOperationalDateSchema, deliveryScope, syncDeliverySettlement } from "@/modules/delivery-settlement";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canSyncDelivery(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses sinkronisasi ditolak." } }, { status: 403 });
  let body: unknown = {};
  try { body = await request.json(); } catch { /* Today is the safe default. */ }
  const candidate = typeof body === "object" && body && "operationalDate" in body ? (body as { operationalDate?: unknown }).operationalDate : undefined;
  const parsed = candidate === undefined ? undefined : deliveryOperationalDateSchema.safeParse(candidate);
  if (parsed && !parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Tanggal tidak valid." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await syncDeliverySettlement({ ...scope, actorId: session.userId }, { operationalDate: parsed?.data }) });
  } catch {
    return NextResponse.json({ error: { code: "DELIVERY_SYNC_FAILED", message: "Sinkronisasi Delivery Settlement gagal." } }, { status: 502 });
  }
}
