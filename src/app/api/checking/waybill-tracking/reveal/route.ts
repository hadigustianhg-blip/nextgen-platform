import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { deliveryScope } from "@/modules/delivery-settlement";
import { waybillTrackingRequestSchema } from "@/modules/checking";
import {
  canViewProblemWaybillSensitive,
  checkProblemWaybillSensitiveRateLimit,
  revealTrackingReceiverPhone,
  SensitiveDetailError,
} from "@/modules/quality-control";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401, headers: noStoreHeaders });
  if (!canAccessResource(session.roles, "WAYBILL_TRACKING", "READ") || !canViewProblemWaybillSensitive(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Anda tidak memiliki akses untuk melihat nomor penerima." } }, { status: 403, headers: noStoreHeaders });
  }
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400, headers: noStoreHeaders });
  if (!checkProblemWaybillSensitiveRateLimit(`${session.tenantId}:${session.userId}`)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan detail." } }, { status: 429, headers: noStoreHeaders });
  }
  const parsed = waybillTrackingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Nomor resi tidak valid." } }, { status: 400, headers: noStoreHeaders });
  try {
    const data = await revealTrackingReceiverPhone({
      ...scope,
      actorId: session.userId,
      waybill: parsed.data.waybillNo,
    });
    return NextResponse.json({ data }, { headers: noStoreHeaders });
  } catch (error) {
    const notFound = error instanceof SensitiveDetailError && error.code === "NOT_FOUND";
    return NextResponse.json({ error: {
      code: notFound ? "PHONE_NOT_FOUND" : "SENSITIVE_UNAVAILABLE",
      message: notFound ? "Nomor penerima tidak tersedia." : "Nomor penerima belum dapat ditampilkan.",
    } }, { status: notFound ? 404 : 502, headers: noStoreHeaders });
  }
}
