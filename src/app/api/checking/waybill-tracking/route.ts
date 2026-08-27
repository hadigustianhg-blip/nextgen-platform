import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import {
  getRealtimeWaybillTracking,
  waybillTrackingRequestSchema,
  WaybillTrackingServiceError,
} from "@/modules/checking";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401, headers: noStore });
  }
  if (!session.outletId) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400, headers: noStore });
  }
  if (!canAccessResource(session.roles, "WAYBILL_TRACKING", "READ")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403, headers: noStore });
  }

  const parsed = waybillTrackingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Nomor resi tidak valid." } }, { status: 400, headers: noStore });
  }

  try {
    const data = await getRealtimeWaybillTracking(
      { tenantId: session.tenantId, outletId: session.outletId },
      parsed.data.waybillNo,
    );
    return NextResponse.json({ data }, { headers: noStore });
  } catch (error) {
    const known = error instanceof WaybillTrackingServiceError ? error : null;
    const notFound = known?.code === "WAYBILL_TRACKING_NOT_FOUND";
    return NextResponse.json({
      error: {
        code: notFound ? "WAYBILL_TRACKING_NOT_FOUND" : "TRACKING_UNAVAILABLE",
        message: notFound ? "Resi tidak ditemukan." : "Tracking belum dapat diperiksa.",
      },
    }, { status: notFound ? 404 : 502, headers: noStore });
  }
}
