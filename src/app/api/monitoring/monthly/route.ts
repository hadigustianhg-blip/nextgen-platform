import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadMonitoringDaily,
  getMonitoringMonthly,
  monitoringMonthlyQuerySchema,
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
  const parsed = monitoringMonthlyQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Rentang tanggal tidak valid.",
        },
      },
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
    await getMonitoringMonthly({
      tenantId: session.tenantId,
      outletId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      deliveryPage: parsed.data.deliveryPage,
      pickupPage: parsed.data.pickupPage,
      pageSize: parsed.data.pageSize,
    }),
  );
}
