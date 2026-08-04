import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { pickupScope } from "@/modules/pickup/pickup.authorization";
import { getPickupTransferAccounts } from "@/modules/pickup";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  if (!pickupScope(session)) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canAccessResource(session.roles, "PICKUP_SETTLEMENT", "UPDATE")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  return NextResponse.json({ data: getPickupTransferAccounts() });
}
