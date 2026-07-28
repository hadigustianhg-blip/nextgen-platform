import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canSyncPickup, pickupScope } from "@/modules/pickup/pickup.authorization";
import { operationalDateSchema } from "@/modules/pickup/pickup.validation";
import { syncPickup } from "@/modules/pickup";

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
      { error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif terlebih dahulu." } },
      { status: 400 },
    );
  }
  if (!canSyncPickup(session)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Anda tidak memiliki akses sinkronisasi." } },
      { status: 403 },
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty JSON body uses today's operational date.
  }
  const candidate =
    typeof body === "object" && body && "operationalDate" in body
      ? (body as { operationalDate?: unknown }).operationalDate
      : undefined;
  const parsedDate =
    candidate === undefined ? undefined : operationalDateSchema.safeParse(candidate);
  if (parsedDate && !parsedDate.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tanggal operasional tidak valid." } },
      { status: 400 },
    );
  }

  try {
    const result = await syncPickup(
      { ...scope, actorId: session.userId },
      { operationalDate: parsedDate?.data },
    );
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "PICKUP_SYNC_FAILED",
          message: "Sinkronisasi pickup gagal. Periksa status middleware lalu coba kembali.",
        },
      },
      { status: 502 },
    );
  }
}
