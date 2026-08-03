import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  dashboardOverviewQuerySchema,
  getDashboardOverview,
} from "@/modules/dashboard";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } },
      { status: 401 },
    );
  }
  if (!session.outletId) {
    return NextResponse.json(
      { error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } },
      { status: 400 },
    );
  }
  const parsed = dashboardOverviewQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filter tidak valid." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await getDashboardOverview(
        { tenantId: session.tenantId, outletId: session.outletId },
        parsed.data,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "DASHBOARD_REQUEST_FAILED", message: "Dashboard belum dapat dimuat." } },
      { status: 500 },
    );
  }
}
