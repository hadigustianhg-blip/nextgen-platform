import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canMutateExpense, createOperationalExpense, expenseInputSchema, operationalScope } from "@/modules/operational-settlement";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canMutateExpense(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 }); }
  const parsed = expenseInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  try {
    return NextResponse.json({ data: await createOperationalExpense({ ...scope, actorId: session.userId }, parsed.data) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPENSE_FAILED";
    return NextResponse.json({ error: { code, message: code === "OPERATIONAL_CLOSED" ? "Operasional tanggal ini sudah ditutup." : "Pengeluaran gagal disimpan." } }, { status: 409 });
  }
}
