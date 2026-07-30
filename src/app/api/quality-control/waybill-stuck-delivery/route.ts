import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deliveryScope } from "@/modules/delivery-settlement";
import {
  canReadWaybillStuck,
  listWaybillStuckDelivery,
  waybillStuckQuerySchema,
} from "@/modules/quality-control";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  if (!canReadWaybillStuck(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses tidak diizinkan." } }, { status: 403 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  const parsed = waybillStuckQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } }, { status: 400 });
  return NextResponse.json(await listWaybillStuckDelivery({ ...scope, ...parsed.data }));
}
