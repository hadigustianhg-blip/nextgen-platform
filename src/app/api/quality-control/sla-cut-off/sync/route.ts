import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveMonitoringOutlet } from "@/modules/monitoring";
import { canSyncSlaCutOff, slaCutOffSyncSchema, syncSlaCutOff } from "@/modules/quality-control";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canSyncSlaCutOff(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = slaCutOffSyncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Periode SLA tidak valid." } }, { status: 400 });
  const outletId = await resolveMonitoringOutlet(session, parsed.data.outletId);
  if (!outletId) return NextResponse.json({ error: { code: "OUTLET_NOT_ALLOWED" } }, { status: 403 });
  try {
    return NextResponse.json(await syncSlaCutOff({ tenantId: session.tenantId, outletId, periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd }));
  } catch (error) {
    return NextResponse.json({ error: { code: "SYNC_FAILED", message: error instanceof Error ? error.message : "Sinkronisasi gagal." } }, { status: 502 });
  }
}
