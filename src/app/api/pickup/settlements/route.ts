import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadPickup, pickupScope } from "@/modules/pickup/pickup.authorization";
import { listPickupSettlements } from "@/modules/pickup";
import { pickupSettlementListQuerySchema } from "@/modules/pickup/pickup-settlement.validation";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = pickupScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canReadPickup(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  const query = pickupSettlementListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } }, { status: 400 });
  return NextResponse.json({ data: await listPickupSettlements({ ...scope, ...query.data }) });
}
