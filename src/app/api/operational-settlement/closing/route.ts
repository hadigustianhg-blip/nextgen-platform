import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canCloseOperational, closeOperational, closeOperationalSchema, operationalScope } from "@/modules/operational-settlement";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canCloseOperational(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 }); }
  const parsed = closeOperationalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  try {
    return NextResponse.json({ data: await closeOperational({ ...scope, actorId: session.userId }, parsed.data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CLOSING_FAILED";
    const message = code === "BANK_DEPOSIT_EXCEEDS_AVAILABLE_CASH"
      ? "Setor bank tidak boleh melebihi cash tersedia."
      : code === "BANK_ACCOUNT_REQUIRED"
        ? "Rekening tujuan wajib diisi."
        : "Closing operasional gagal.";
    return NextResponse.json({ error: { code, message } }, { status: 409 });
  }
}
