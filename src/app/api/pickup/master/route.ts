import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadPickup, pickupScope } from "@/modules/pickup/pickup.authorization";
import { listMasterPickups } from "@/modules/pickup";
import { pickupListQuerySchema } from "@/modules/pickup/pickup.validation";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  }
  const scope = pickupScope(session);
  if (!scope) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif terlebih dahulu." } }, { status: 400 });
  }
  if (!canReadPickup(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  }
  const url = new URL(request.url);
  const parsed = pickupListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } }, { status: 400 });
  }
  const data = await listMasterPickups({
    ...scope,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    search: parsed.data.search,
  });
  return NextResponse.json({ data });
}
