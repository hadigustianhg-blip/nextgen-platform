import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { adjustDeliverySettlement, canAdjustDelivery, deliveryAdjustmentSchema, deliveryScope } from "@/modules/delivery-settlement";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401 });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400 });
  if (!canAdjustDelivery(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya Admin atau Owner yang dapat menyesuaikan setoran." } }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Data tidak valid." } }, { status: 400 }); }
  const parsed = deliveryAdjustmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Data tidak valid." } }, { status: 400 });
  try {
    const row = await adjustDeliverySettlement({ ...scope, actorId: session.userId }, (await context.params).id, parsed.data);
    return row ? NextResponse.json({ data: row }) : NextResponse.json({ error: { code: "NOT_FOUND", message: "Setoran tidak ditemukan." } }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "CANCELLATION_REASON_REQUIRED") {
      return NextResponse.json({ error: { code: error.message, message: "Alasan pembatalan wajib diisi." } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: "ADJUSTMENT_FAILED", message: "Penyesuaian tidak dapat disimpan." } }, { status: 409 });
  }
}
