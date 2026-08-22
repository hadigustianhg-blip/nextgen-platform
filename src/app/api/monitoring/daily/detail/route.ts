import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadMonitoringDaily,
  getMonitoringDailyDetail,
  monitoringDailyDetailQuerySchema,
  resolveMonitoringOutlet,
} from "@/modules/monitoring";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  if (!canReadMonitoringDaily(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403 });
  const parsed = monitoringDailyDetailQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Filter rincian tidak valid." } }, { status: 400 });
  const outletId = await resolveMonitoringOutlet(session, parsed.data.outletId);
  if (!outletId) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  return NextResponse.json(await getMonitoringDailyDetail({
    tenantId: session.tenantId, outletId, businessDate: parsed.data.businessDate,
    metric: parsed.data.metric, team: parsed.data.team,
  }));
}
