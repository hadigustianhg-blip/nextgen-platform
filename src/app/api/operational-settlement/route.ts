import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadOperational, listOperationalSettlement, operationalListQuerySchema, operationalScope } from "@/modules/operational-settlement";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canReadOperational(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  const parsed = operationalListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } }, { status: 400 });
  return NextResponse.json(await listOperationalSettlement({ ...scope, ...parsed.data }));
}
