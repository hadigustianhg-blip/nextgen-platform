import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";
import { pickupScope } from "@/modules/pickup/pickup.authorization";
import { bulkAdjustPickupSettlements } from "@/modules/pickup";
import { pickupBulkAdjustmentSchema } from "@/modules/pickup/pickup-settlement.validation";

export async function POST(request: Request) {
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
  if (!hasAnyRole(session.roles, ["OWNER", "ADMIN"])) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Hanya Admin atau Owner yang dapat melakukan penyesuaian.",
        },
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Data penyesuaian massal tidak valid.",
        },
      },
      { status: 400 },
    );
  }
  const input = pickupBulkAdjustmentSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            input.error.issues[0]?.message ??
            "Data penyesuaian massal tidak valid.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const data = await bulkAdjustPickupSettlements(
      {
        ...scope,
        actorId: session.userId,
        actorRoles: session.roles,
      },
      input.data,
    );
    return NextResponse.json({ data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "TRANSFER_ACCOUNT_REQUIRED") {
      return NextResponse.json(
        { error: { code, message: "Pilih rekening transfer yang tersedia." } },
        { status: 400 },
      );
    }
    if (code === "INVALID_DISCOUNT") {
      const waybill =
        error && typeof error === "object" && "waybillNo" in error
          ? String(error.waybillNo)
          : "";
      return NextResponse.json(
        {
          error: {
            code,
            message: waybill
              ? `Diskon melebihi ongkir untuk waybill ${waybill}.`
              : "Diskon tidak boleh melebihi ongkir.",
          },
        },
        { status: 400 },
      );
    }
    if (code === "PICKUP_NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code,
            message: "Pickup tidak ditemukan atau berada di luar akses outlet.",
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "BULK_ADJUSTMENT_FAILED",
          message: "Penyesuaian massal gagal. Tidak ada data yang diubah.",
        },
      },
      { status: 409 },
    );
  }
}
