import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deliveryScope } from "@/modules/delivery-settlement";
import {
  canViewProblemWaybillSensitive,
  checkProblemWaybillSensitiveRateLimit,
  getProblemWaybillSensitiveDetail,
  problemWaybillParamSchema,
  SensitiveDetailError,
} from "@/modules/quality-control";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ waybill: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401, headers: noStoreHeaders });
  if (!canViewProblemWaybillSensitive(session)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses tidak diizinkan." } }, { status: 403, headers: noStoreHeaders });
  const scope = deliveryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400, headers: noStoreHeaders });
  if (!checkProblemWaybillSensitiveRateLimit(`${session.tenantId}:${session.userId}`)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan detail." } }, { status: 429, headers: noStoreHeaders });
  }
  const params = await context.params;
  const parsed = problemWaybillParamSchema.safeParse(params.waybill);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Waybill tidak valid." } }, { status: 400, headers: noStoreHeaders });
  try {
    const data = await getProblemWaybillSensitiveDetail({
      ...scope,
      actorId: session.userId,
      waybill: parsed.data,
    });
    return NextResponse.json({ data }, { headers: noStoreHeaders });
  } catch (error) {
    const status =
      error instanceof SensitiveDetailError &&
      (error.code === "NOT_FOUND" || error.code === "STATUS_CHANGED")
        ? 404
        : 502;
    return NextResponse.json(
      {
        error: {
          code: status === 404 ? "NOT_FOUND" : "SENSITIVE_UNAVAILABLE",
          message: status === 404 ? "Data tidak ditemukan." : "Layanan sedang tidak tersedia.",
        },
      },
      { status, headers: noStoreHeaders },
    );
  }
}
