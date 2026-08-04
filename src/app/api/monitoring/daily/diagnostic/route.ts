import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import {
  getMonitoringDailyDiagnostic,
  monitoringDailyDiagnosticSchema,
  resolveMonitoringOutlet,
} from "@/modules/monitoring";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Endpoint tidak tersedia." } },
      { status: 404 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } },
      { status: 401 },
    );
  }
  if (!canAccessResource(session.roles, "MONITORING", "MANAGE")) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak." } },
      { status: 403 },
    );
  }
  const parsed = monitoringDailyDiagnosticSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } },
      { status: 400 },
    );
  }
  const outletId = await resolveMonitoringOutlet(
    session,
    parsed.data.outletId,
  );
  if (!outletId) {
    return NextResponse.json(
      { error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } },
      { status: 400 },
    );
  }
  return NextResponse.json(await getMonitoringDailyDiagnostic({
    tenantId: session.tenantId,
    outletId,
    businessDate: parsed.data.businessDate,
    waybill: parsed.data.waybill,
  }));
}
