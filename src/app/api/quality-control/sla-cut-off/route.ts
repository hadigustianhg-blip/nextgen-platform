import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveMonitoringOutlet } from "@/modules/monitoring";
import { canReadSlaCutOff, getSlaCutOff, slaCutOffQuerySchema } from "@/modules/quality-control";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSlaCutOff(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = slaCutOffQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Periode SLA tidak valid." } }, { status: 400 });
  const outletId = await resolveMonitoringOutlet(session, parsed.data.outletId);
  if (!outletId) return NextResponse.json({ error: { code: "OUTLET_NOT_ALLOWED" } }, { status: 403 });
  return NextResponse.json(await getSlaCutOff({ tenantId: session.tenantId, outletId, periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd }));
}
