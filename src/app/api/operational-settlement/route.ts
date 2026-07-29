import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { auditOperationalBusinessDate, canReadOperational, listOperationalSettlement, operationalListQuerySchema, operationalScope } from "@/modules/operational-settlement";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canReadOperational(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  const parsed = operationalListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } }, { status: 400 });
  const data = await listOperationalSettlement({ ...scope, ...parsed.data });
  try {
    if (parsed.data.operationalDate) return NextResponse.json(data);
    await auditOperationalBusinessDate(
      { ...scope, actorId: session.userId },
      {
        activeBusinessDate: data.activeBusinessDate,
        calendarDate: data.calendarDate,
        openBusinessDates: data.openBusinessDates,
        openDayCount: data.openDayCount,
        isPastDueOpenDay: data.isPastDueOpenDay,
      },
    );
  } catch {
    // Audit telemetry must not make a scoped read unavailable.
  }
  return NextResponse.json(data);
}
