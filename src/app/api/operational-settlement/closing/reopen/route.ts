import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReopenOperational, operationalScope, reopenOperational, reopenOperationalSchema } from "@/modules/operational-settlement";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReopenOperational(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 }); }
  const parsed = reopenOperationalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  try {
    return NextResponse.json({ data: await reopenOperational({ ...scope, actorId: session.userId }, parsed.data) });
  } catch {
    return NextResponse.json({ error: { code: "CLOSING_NOT_FOUND", message: "Closing belum tersedia." } }, { status: 404 });
  }
}
