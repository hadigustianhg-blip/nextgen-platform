import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadDelivery, deliveryScope, getLatestDeliveryRun } from "@/modules/delivery-settlement";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canReadDelivery(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  return NextResponse.json({ data: await getLatestDeliveryRun(scope) });
}
