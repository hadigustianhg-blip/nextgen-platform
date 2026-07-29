import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";
import { pickupScope } from "@/modules/pickup/pickup.authorization";
import { adjustPickupSettlement } from "@/modules/pickup";
import { pickupAdjustmentSchema } from "@/modules/pickup/pickup-settlement.validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ pickupId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = pickupScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!hasAnyRole(session.roles, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya Admin atau Owner yang dapat melakukan penyesuaian." } }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Data penyesuaian tidak valid." } }, { status: 400 });
  }
  const input = pickupAdjustmentSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({
      error: {
        code: "VALIDATION_ERROR",
        message: input.error.issues[0]?.message ?? "Data penyesuaian tidak valid.",
      },
    }, { status: 400 });
  }
  const { pickupId } = await context.params;
  try {
    const data = await adjustPickupSettlement({ ...scope, actorId: session.userId }, pickupId, input.data);
    if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Pickup tidak ditemukan." } }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "TRANSFER_ACCOUNT_REQUIRED") {
      return NextResponse.json({ error: { code, message: "Pilih rekening transfer yang tersedia." } }, { status: 400 });
    }
    if (code === "CANCELLATION_REASON_REQUIRED") {
      return NextResponse.json({ error: { code, message: "Alasan pembatalan wajib diisi." } }, { status: 400 });
    }
    if (code === "INVALID_DISCOUNT") {
      return NextResponse.json({ error: { code, message: "Diskon tidak boleh melebihi ongkir." } }, { status: 400 });
    }
    if (code === "PICKUP_NOT_FOUND") {
      return NextResponse.json({ error: { code, message: "Pickup tidak ditemukan." } }, { status: 404 });
    }
    return NextResponse.json({ error: { code: "ADJUSTMENT_FAILED", message: "Penyesuaian belum dapat disimpan." } }, { status: 409 });
  }
}
