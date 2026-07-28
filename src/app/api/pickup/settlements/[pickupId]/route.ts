import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadPickup, pickupScope } from "@/modules/pickup/pickup.authorization";
import { getPickupSettlement } from "@/modules/pickup";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pickupId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = pickupScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canReadPickup(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  const { pickupId } = await context.params;
  const data = await getPickupSettlement(scope.tenantId, scope.outletId, pickupId);
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Pickup tidak ditemukan." } }, { status: 404 });
  return NextResponse.json({ data });
}
