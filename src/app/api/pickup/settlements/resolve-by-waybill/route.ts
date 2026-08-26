import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadPickup,
  pickupScope,
} from "@/modules/pickup/pickup.authorization";
import { resolvePickupSettlementByWaybill } from "@/modules/pickup";
import { pickupWaybillResolverQuerySchema } from "@/modules/pickup/pickup-settlement.validation";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } },
      { status: 401 },
    );
  }

  const scope = pickupScope(session);
  if (!scope) {
    return NextResponse.json(
      { error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } },
      { status: 400 },
    );
  }
  if (!canReadPickup(session)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak." } },
      { status: 403 },
    );
  }

  const query = pickupWaybillResolverQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Nomor waybill tidak valid.",
        },
      },
      { status: 400 },
    );
  }

  const data = await resolvePickupSettlementByWaybill(
    scope.tenantId,
    scope.outletId,
    query.data.waybillNo,
  );
  if (!data) {
    return NextResponse.json(
      {
        error: {
          code: "PICKUP_NOT_FOUND",
          message: "Pickup belum tersedia.",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ data });
}
