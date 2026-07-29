import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canMutateExpense, expenseUpdateSchema, operationalScope, updateOperationalExpense } from "@/modules/operational-settlement";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canMutateExpense(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 }); }
  const parsed = expenseUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  try {
    const row = await updateOperationalExpense({ ...scope, actorId: session.userId }, (await context.params).id, parsed.data);
    return row ? NextResponse.json({ data: row }) : NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPENSE_FAILED";
    return NextResponse.json({ error: { code, message: "Pengeluaran tidak dapat diubah." } }, { status: 409 });
  }
}
