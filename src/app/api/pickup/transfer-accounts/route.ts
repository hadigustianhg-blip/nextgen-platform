import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";
import { pickupScope } from "@/modules/pickup/pickup.authorization";
import { getPickupTransferAccounts } from "@/modules/pickup";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  if (!pickupScope(session)) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!hasAnyRole(session.roles, ["OWNER", "ADMIN"])) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  return NextResponse.json({ data: getPickupTransferAccounts() });
}
