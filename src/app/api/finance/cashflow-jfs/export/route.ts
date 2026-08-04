import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { operationalScope } from "@/modules/operational-settlement";
import { createWorkbook, financeRangeSchema, readJfsCashflow } from "@/modules/finance";
import { canExportProfitLoss } from "@/modules/profit-loss";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canExportProfitLoss(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = financeRangeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  try {
    const result = await readJfsCashflow({ ...scope, ...parsed.data });
    const workbook = await createWorkbook([
      {
        name: "Summary",
        headers: ["Tanggal Awal", "Tanggal Akhir", "Total Pemasukan", "Total Pengeluaran", "Selisih"],
        rows: [[parsed.data.startDate, parsed.data.endDate, result.summary.totalIncome, result.summary.totalExpense, result.summary.difference]],
      },
      {
        name: "Pemasukan", headers: ["Jenis Transaksi", "Total Bulan Terpilih"],
        rows: result.income.map((row) => [row.transactionType, row.total]),
      },
      {
        name: "Pengeluaran", headers: ["Jenis Transaksi", "Total Bulan Terpilih"],
        rows: result.expense.map((row) => [row.transactionType, row.total]),
      },
    ]);
    await prisma.auditLog.create({ data: {
      ...scope, actorId: session.userId, action: "CREATE",
      entityType: "EXPORT_JFS_CASHFLOW",
      metadata: {
        ...parsed.data,
        incomeCount: result.income.length,
        expenseCount: result.expense.length,
        totalIncome: result.summary.totalIncome,
        totalExpense: result.summary.totalExpense,
      },
    } });
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Cashflow_JFS_${parsed.data.startDate}_${parsed.data.endDate}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ error: { code: "EXPORT_FAILED" } }, { status: 500 });
  }
}
