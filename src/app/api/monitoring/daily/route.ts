import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadMonitoringDaily,
  getMonitoringDaily,
  monitoringDailyQuerySchema,
  resolveMonitoringOutlet,
} from "@/modules/monitoring";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } },
      { status: 401 },
    );
  }
  if (!canReadMonitoringDaily(session)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak." } },
      { status: 403 },
    );
  }
  const parsed = monitoringDailyQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Filter tidak valid." } },
      { status: 400 },
    );
  }
  const outletId = await resolveMonitoringOutlet(session, parsed.data.outletId);
  if (!outletId) {
    return NextResponse.json(
      { error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } },
      { status: 400 },
    );
  }
  return NextResponse.json(
    await getMonitoringDaily({
      tenantId: session.tenantId,
      outletId,
      businessDate: parsed.data.businessDate,
      deliveryPage: parsed.data.deliveryPage,
      pickupPage: parsed.data.pickupPage,
      pageSize: parsed.data.pageSize,
    }),
  );
}
