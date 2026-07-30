import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { operationalScope } from "@/modules/operational-settlement";
import {
  canExportFinance, createWorkbook, financeRangeSchema,
  getOperationalDetailRows, getOperationalDetailSummary,
} from "@/modules/finance";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canExportFinance(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = financeRangeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const [summary, detail] = await Promise.all([
    getOperationalDetailSummary({ ...scope, ...parsed.data }),
    getOperationalDetailRows({ ...scope, ...parsed.data, all: true }),
  ]);
  const workbook = await createWorkbook([
    {
      name: "SUMMARY",
      headers: ["Kategori", "Jumlah Transaksi", "Total Nominal"],
      rows: summary.categories.map((row) => [row.category, row.transactionCount, row.totalAmount]),
    },
    {
      name: "DETAIL",
      headers: ["Tanggal", "Kategori", "Nominal", "Keterangan", "PIC", "Nomor Referensi"],
      rows: detail.data.map((row) => [
        row.date, row.category, row.amount, row.description || "", row.pic, row.referenceNumber,
      ]),
    },
  ]);
  await prisma.auditLog.create({ data: {
    ...scope, actorId: session.userId, action: "CREATE",
    entityType: "EXPORT_OPERATIONAL_DETAIL",
    metadata: {
      startDate: parsed.data.startDate, endDate: parsed.data.endDate,
      totalCategories: summary.summary.totalCategories,
      totalTransactions: summary.summary.totalTransactions,
    },
  } });
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Rincian_Operasional_${parsed.data.startDate}_${parsed.data.endDate}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
