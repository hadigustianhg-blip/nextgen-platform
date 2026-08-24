import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canSyncDelivery,
  syncDispatchOnly,
} from "@/modules/delivery-settlement";
import { syncPickup } from "@/modules/pickup";
import { canSyncPickup } from "@/modules/pickup/pickup.authorization";
import {
  monitoringDailyQuerySchema,
  orchestrateMonitoringSync,
  resolveMonitoringOutlet,
} from "@/modules/monitoring";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } },
      { status: 401 },
    );
  }
  if (!canSyncDelivery(session) || !canSyncPickup(session)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Akses sinkronisasi ditolak.",
        },
      },
      { status: 403 },
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body uses the active NEXTGEN business date.
  }
  const candidate =
    typeof body === "object" && body !== null
      ? (body as { businessDate?: unknown; outletId?: unknown })
      : {};
  const parsed = monitoringDailyQuerySchema
    .pick({ businessDate: true, outletId: true })
    .safeParse(candidate);
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
  const context = {
    tenantId: session.tenantId,
    outletId,
    actorId: session.userId,
  };
  const result = await orchestrateMonitoringSync(
    async () => {
      const delivery = await syncDispatchOnly(context, {
        operationalDate: parsed.data.businessDate,
      });
      return {
        processed: delivery.dispatch.unique,
        received: delivery.dispatch.fetched,
        unique: delivery.dispatch.unique,
        created: delivery.dispatch.created,
        updated: delivery.dispatch.updated,
        duplicateIgnored: delivery.dispatch.duplicateIgnored,
      };
    },
    async () => {
      const pickup = await syncPickup(context, {
        operationalDate: parsed.data.businessDate,
      });
      return { processed: pickup.fetched };
    },
  );
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
