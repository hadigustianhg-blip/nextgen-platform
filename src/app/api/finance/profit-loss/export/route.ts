import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createWorkbook } from "@/modules/finance";
import { canExportProfitLoss } from "@/modules/profit-loss";
import { getProfitLoss, profitLossQuerySchema, profitLossScope } from "@/modules/profit-loss";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canExportProfitLoss(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = profitLossScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = profitLossQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_QUERY" } }, { status: 400 });
  const result = await getProfitLoss(scope, { ...parsed.data, page: 1, pageSize: 1_000_000 });
  const number = (value: string) => Number(value);
  const workbook = await createWorkbook([
    {
      name: "SUMMARY",
      headers: ["Metric", "Nilai"],
      rows: [
        ["Periode", `${result.period.startDate} - ${result.period.endDate}`],
        ["Outlet", result.outletCode],
        ["Total Pemasukan", number(result.summary.totalIncome)],
        ["Total Pengeluaran", number(result.summary.totalExpense)],
        ["Profit/Loss", number(result.summary.profitLoss)],
        ["Margin (%)", number(result.summary.margin)],
        ["Pemasukan JFS", number(result.summary.jfsIncome)],
        ["Omzet Pickup DFOD", number(result.summary.pickupDfod)],
        ["Omzet Pickup Tunai", number(result.summary.pickupCash)],
        ["Pengeluaran JFS", number(result.summary.jfsExpense)],
        ["Total Operasional", number(result.summary.operational)],
        ["Gross Salary Preview", number(result.summary.grossSalary)],
        ["Potongan Kasbon", number(result.summary.kasbon)],
        ["Salary Net", number(result.summary.salaryNet)],
        ["Waktu Export", new Date().toISOString()],
      ],
    },
    {
      name: "DAILY PROFIT LOSS",
      headers: ["Tanggal", "Pemasukan JFS", "Pickup DFOD", "Pickup Tunai", "Pemasukan Manual/Adjustment", "Total Pemasukan", "Pengeluaran JFS", "Total Operasional", "Gross Salary", "Kasbon", "Salary Net", "Pengeluaran Manual/Adjustment", "Total Pengeluaran", "Profit/Loss"],
      rows: result.daily.map((row) => [row.date, number(row.jfsIncome), number(row.pickupDfod), number(row.pickupCash), number(row.manualAdjustmentIncome), number(row.totalIncome), number(row.jfsExpense), number(row.operational), number(row.grossSalary), number(row.kasbon), number(row.salaryNet), number(row.manualAdjustmentExpense), number(row.totalExpense), number(row.profitLoss)]),
    },
    {
      name: "TRANSACTIONS",
      headers: ["Tanggal", "Jenis", "Kategori", "Keterangan", "Nominal", "Source", "Referensi"],
      rows: result.transactions.map((row) => [row.date, row.direction === "INCOME" ? "Pemasukan" : "Pengeluaran", row.category, row.description, number(row.amount), row.source.replace("_", " "), row.sourceReference ?? ""]),
    },
    {
      name: "SOURCE SUMMARY",
      headers: ["Source", "Pemasukan", "Pengeluaran", "Selisih"],
      rows: result.sourceSummary.map((row) => [row.source.replace("_", " "), number(row.income), number(row.expense), number(row.difference)]),
    },
  ]);
  return new NextResponse(new Uint8Array(workbook), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="profit-loss-${result.outletCode}-${result.period.startDate}-${result.period.endDate}.xlsx"`,
    "Cache-Control": "private, no-store, max-age=0",
  } });
}
