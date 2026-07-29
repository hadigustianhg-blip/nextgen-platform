import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { resolveMonitoringOutlet } from "@/modules/monitoring";
import { canSyncSlaCutOff, slaCutOffSyncSchema, syncSlaCutOffForOutlet } from "@/modules/quality-control";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canSyncSlaCutOff(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = slaCutOffSyncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Periode SLA tidak valid." } }, { status: 400 });
  const outletId = await resolveMonitoringOutlet(session, parsed.data.outletId);
  if (!outletId) return NextResponse.json({ error: { code: "OUTLET_NOT_ALLOWED" } }, { status: 403 });
  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, tenantId: session.tenantId, isActive: true },
    select: { code: true },
  });
  if (!outlet) return NextResponse.json({ error: { code: "OUTLET_NOT_ALLOWED" } }, { status: 403 });
  try {
    const result = await syncSlaCutOffForOutlet({
      tenantId: session.tenantId,
      outletId,
      expectedNetworkName: outlet.code,
      actor: { actorType: "USER", actorId: session.userId },
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
    });
    if (
      result.reason === "NETWORK_MISMATCH" ||
      result.reason === "STALE_SNAPSHOT"
    ) {
      return NextResponse.json(
        {
          error: {
            code: result.reason,
            message:
              result.reason === "NETWORK_MISMATCH"
                ? "Network sumber tidak sesuai dengan outlet."
                : "Snapshot sumber belum menggunakan tanggal hari ini.",
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      processed: result.result === "SKIPPED" ? 0 : 1,
      inserted: result.result === "CREATED" ? 1 : 0,
      updated: result.result === "UPDATED" ? 1 : 0,
      skippedOutsidePeriod: result.reason === "OUTSIDE_PERIOD" ? 1 : 0,
      snapshotOnly: true,
      period: { startDate: parsed.data.periodStart, endDate: parsed.data.periodEnd },
    });
  } catch (error) {
    return NextResponse.json({ error: { code: "SYNC_FAILED", message: error instanceof Error ? error.message : "Sinkronisasi gagal." } }, { status: 502 });
  }
}
