import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { operationalScope } from "@/modules/operational-settlement";
import {
  canReadFinance, fetchJfsCashflow, financeRangeSchema, JfsCashflowError,
} from "@/modules/finance";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadFinance(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = financeRangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  try {
    const result = await fetchJfsCashflow(parsed.data);
    await prisma.auditLog.create({ data: {
      ...scope, actorId: session.userId, action: "CREATE",
      entityType: "VIEW_JFS_CASHFLOW",
      metadata: {
        ...parsed.data,
        incomeCount: result.income.length,
        expenseCount: result.expense.length,
        totalIncome: result.summary.totalIncome,
        totalExpense: result.summary.totalExpense,
      },
    } });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const code = error instanceof JfsCashflowError ? error.code : "SOURCE_UNAVAILABLE";
    return NextResponse.json({ error: { code } }, { status: 502 });
  }
}
