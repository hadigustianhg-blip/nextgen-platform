import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadPickup, pickupScope } from "@/modules/pickup/pickup.authorization";
import { getLatestPickupRun } from "@/modules/pickup";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = pickupScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif terlebih dahulu." } }, { status: 400 });
  if (!canReadPickup(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  return NextResponse.json({ data: await getLatestPickupRun(scope.tenantId, scope.outletId) });
}
