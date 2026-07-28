import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadDelivery, deliveryScope, getDeliverySettlement } from "@/modules/delivery-settlement";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canReadDelivery(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  const row = await getDeliverySettlement(scope, (await context.params).id);
  return row ? NextResponse.json({ data: row }) : NextResponse.json({ error: { code: "NOT_FOUND", message: "Setoran tidak ditemukan." } }, { status: 404 });
}
