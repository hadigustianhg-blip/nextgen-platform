import "server-only";
import { Prisma, type AuditAction, type ProfitLossDirection } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSalaryMonthlyPreview } from "@/modules/salary/salary.preview.service";
import type { ProfitLossQuery } from "./profit-loss.validation";

type Scope = { tenantId: string; outletId: string };
type Context = Scope & { actorId: string };
type Source = "JFS" | "NEXTGEN_SYSTEM" | "MANUAL" | "ADJUSTMENT";
type CanonicalRow = {
  id: string;
  date: string;
  direction: ProfitLossDirection;
  category: string;
  description: string;
  amount: Prisma.Decimal;
  source: Source;
  sourceType: string;
  sourceReference: string | null;
  isEditable: boolean;
};

const zero = () => new Prisma.Decimal(0);
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const text = (value: string | null) => String(value ?? "")
  .normalize("NFKC").trim().replace(/\s+/g, " ");
const settlement = (value: string | null) => {
  const normalized = text(value).toLocaleUpperCase("id-ID");
  if (normalized === "DFOD") return "DFOD" as const;
  if (normalized === "TUNAI") return "Tunai" as const;
  return null;
};
const add = (map: Map<string, Prisma.Decimal>, key: string, value: Prisma.Decimal) =>
  map.set(key, (map.get(key) ?? zero()).plus(value));
const serialize = (row: CanonicalRow) => ({ ...row, amount: row.amount.toString() });

function dates(startDate: string, endDate: string) {
  const result: string[] = [];
  for (let cursor = dateValue(startDate); cursor <= dateValue(endDate);) {
    result.push(dateKey(cursor));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return result;
}

export async function getProfitLoss(scope: Scope, query: ProfitLossQuery) {
  const start = dateValue(query.startDate);
  const end = dateValue(query.endDate);
  const [jfs, pickups, expenses, manual, adjustments, salary, outlet] =
    await Promise.all([
      prisma.jfsCashflowRecord.findMany({
        where: { ...scope, businessDate: { gte: start, lte: end } },
        select: {
          id: true, businessDate: true, direction: true, transactionType: true,
          category: true, amount: true, sourceReference: true,
        },
      }),
      prisma.masterPickup.findMany({
        where: {
          ...scope, operationalDate: { gte: start, lte: end },
          syncStatus: "NORMALIZED",
        },
        select: {
          id: true, operationalDate: true, waybillNo: true, freightAmount: true,
          rawPickup: { select: { settlementRaw: true } },
        },
      }),
      prisma.operationalExpense.findMany({
        where: { ...scope, operationalDate: { gte: start, lte: end }, status: "VALID" },
        select: { operationalDate: true, category: true, amount: true },
      }),
      prisma.profitLossManualEntry.findMany({
        where: { ...scope, entryDate: { gte: start, lte: end }, status: "ACTIVE" },
      }),
      prisma.profitLossAdjustment.findMany({
        where: { ...scope, adjustmentDate: { gte: start, lte: end }, status: "ACTIVE" },
      }),
      getSalaryMonthlyPreview(scope, {
        startDate: query.startDate,
        endDate: query.endDate,
      }),
      prisma.outlet.findFirst({
        where: { tenantId: scope.tenantId, id: scope.outletId },
        select: { code: true },
      }),
    ]);

  const rows: CanonicalRow[] = jfs.map((row) => ({
    id: `jfs:${row.id}`,
    date: dateKey(row.businessDate),
    direction: row.direction === "income" ? "INCOME" : "EXPENSE",
    category: "JFS Cashflow",
    description: row.transactionType,
    amount: row.amount,
    source: "JFS",
    sourceType: row.category,
    sourceReference: row.sourceReference,
    isEditable: false,
  }));

  const pickupDaily = new Map<string, Prisma.Decimal>();
  const canonicalWaybills = new Set<string>();
  for (const pickup of pickups) {
    const type = settlement(pickup.rawPickup.settlementRaw);
    const waybill = text(pickup.waybillNo).toUpperCase();
    if (!type || !waybill || canonicalWaybills.has(waybill)) continue;
    canonicalWaybills.add(waybill);
    add(pickupDaily, `${dateKey(pickup.operationalDate)}|${type}`, pickup.freightAmount);
  }
  for (const [key, amount] of pickupDaily) {
    const [date, type] = key.split("|");
    rows.push({
      id: `pickup:${date}:${type}`,
      date,
      direction: "INCOME",
      category: `Omzet Pickup ${type}`,
      description: `Omzet Pickup ${type}`,
      amount,
      source: "NEXTGEN_SYSTEM",
      sourceType: `PICKUP_${type.toUpperCase()}`,
      sourceReference: null,
      isEditable: false,
    });
  }

  const operationalDaily = new Map<string, Prisma.Decimal>();
  const kasbonDaily = new Map<string, Prisma.Decimal>();
  for (const expense of expenses) {
    const date = dateKey(expense.operationalDate);
    add(operationalDaily, date, expense.amount);
    if (text(expense.category).toLocaleUpperCase("id-ID") === "KASBON") {
      add(kasbonDaily, date, expense.amount);
    }
  }
  for (const [date, amount] of operationalDaily) rows.push({
    id: `operational:${date}`,
    date,
    direction: "EXPENSE",
    category: "Operasional",
    description: "Total Operasional Harian",
    amount,
    source: "NEXTGEN_SYSTEM",
    sourceType: "OPERATIONAL_DAILY",
    sourceReference: "/dashboard/finance/rincian-operasional",
    isEditable: false,
  });

  const kasbonTotal = [...kasbonDaily.values()]
    .reduce((sum, value) => sum.plus(value), zero());
  const grossSalary = new Prisma.Decimal(salary.summary.estimatedNetTotal)
    .plus(salary.summary.kasbonDeductionTotal);
  const salaryNet = grossSalary.minus(kasbonTotal);
  if (!salaryNet.isZero()) rows.push({
    id: `salary:${query.startDate}:${query.endDate}`,
    date: query.endDate,
    direction: "EXPENSE",
    category: "Salary",
    description: "Biaya Salary Setelah Kasbon",
    amount: salaryNet,
    source: "NEXTGEN_SYSTEM",
    sourceType: "SALARY_PERIOD_END",
    sourceReference: null,
    isEditable: false,
  });

  rows.push(...manual.map((row) => ({
    id: row.id, date: dateKey(row.entryDate), direction: row.entryType,
    category: row.category, description: row.description, amount: row.amount,
    source: "MANUAL" as const, sourceType: "MANUAL_ENTRY",
    sourceReference: row.reference, isEditable: true,
  })));
  rows.push(...adjustments.map((row) => ({
    id: row.id, date: dateKey(row.adjustmentDate), direction: row.direction,
    category: row.category, description: row.description, amount: row.amount,
    source: "ADJUSTMENT" as const, sourceType: "PROFIT_LOSS_ADJUSTMENT",
    sourceReference: row.reason, isEditable: true,
  })));

  const total = (direction: ProfitLossDirection, source?: Source) => rows
    .filter((row) => row.direction === direction && (!source || row.source === source))
    .reduce((sum, row) => sum.plus(row.amount), zero());
  const totalIncome = total("INCOME");
  const totalExpense = total("EXPENSE");
  const profitLoss = totalIncome.minus(totalExpense);
  const margin = totalIncome.greaterThan(0)
    ? profitLoss.dividedBy(totalIncome).times(100)
    : zero();

  const daily = dates(query.startDate, query.endDate).map((date) => {
    const dayRows = rows.filter((row) => row.date === date);
    const dayTotal = (direction: ProfitLossDirection) => dayRows
      .filter((row) => row.direction === direction)
      .reduce((sum, row) => sum.plus(row.amount), zero());
    const income = dayTotal("INCOME");
    const expense = dayTotal("EXPENSE");
    const pickupDfod = pickupDaily.get(`${date}|DFOD`) ?? zero();
    const pickupCash = pickupDaily.get(`${date}|Tunai`) ?? zero();
    const operational = operationalDaily.get(date) ?? zero();
    const salaryDate = date === query.endDate;
    return {
      date,
      jfsIncome: dayRows.filter((row) => row.source === "JFS" && row.direction === "INCOME").reduce((sum, row) => sum.plus(row.amount), zero()).toString(),
      pickupDfod: pickupDfod.toString(), pickupCash: pickupCash.toString(),
      manualAdjustmentIncome: dayRows.filter((row) => ["MANUAL", "ADJUSTMENT"].includes(row.source) && row.direction === "INCOME").reduce((sum, row) => sum.plus(row.amount), zero()).toString(),
      totalIncome: income.toString(),
      jfsExpense: dayRows.filter((row) => row.source === "JFS" && row.direction === "EXPENSE").reduce((sum, row) => sum.plus(row.amount), zero()).toString(),
      operational: operational.toString(), grossSalary: salaryDate ? grossSalary.toString() : "0",
      kasbon: salaryDate ? kasbonTotal.toString() : "0",
      salaryNet: salaryDate ? salaryNet.toString() : "0",
      manualAdjustmentExpense: dayRows.filter((row) => ["MANUAL", "ADJUSTMENT"].includes(row.source) && row.direction === "EXPENSE").reduce((sum, row) => sum.plus(row.amount), zero()).toString(),
      totalExpense: expense.toString(), profitLoss: income.minus(expense).toString(),
    };
  });

  const sourceSummary = (["JFS", "NEXTGEN_SYSTEM", "MANUAL", "ADJUSTMENT"] as Source[])
    .map((source) => {
      const income = total("INCOME", source), expense = total("EXPENSE", source);
      return { source, income: income.toString(), expense: expense.toString(), difference: income.minus(expense).toString() };
    });
  const lowerSearch = query.search.toLocaleLowerCase("id-ID");
  const filtered = rows.filter((row) =>
    (!query.direction || row.direction === query.direction) &&
    (!query.source || row.source === query.source) &&
    (!query.category || row.category === query.category) &&
    (!lowerSearch || [row.category, row.description, row.sourceReference ?? ""]
      .some((value) => value.toLocaleLowerCase("id-ID").includes(lowerSearch))));
  filtered.sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    const ordered = query.sort === "oldest" ? byDate : -byDate;
    return ordered || left.source.localeCompare(right.source) || left.id.localeCompare(right.id);
  });
  const startIndex = (query.page - 1) * query.pageSize;
  const pickupDfodTotal = [...pickupDaily].filter(([key]) => key.endsWith("|DFOD")).reduce((sum, [, value]) => sum.plus(value), zero());
  const pickupCashTotal = [...pickupDaily].filter(([key]) => key.endsWith("|Tunai")).reduce((sum, [, value]) => sum.plus(value), zero());
  return {
    period: { startDate: query.startDate, endDate: query.endDate },
    outletCode: outlet?.code ?? "OUTLET",
    summary: {
      totalIncome: totalIncome.toString(), totalExpense: totalExpense.toString(),
      profitLoss: profitLoss.toString(), margin: margin.toDecimalPlaces(2).toString(),
      jfsIncome: total("INCOME", "JFS").toString(),
      pickupDfod: pickupDfodTotal.toString(), pickupCash: pickupCashTotal.toString(),
      jfsExpense: total("EXPENSE", "JFS").toString(),
      operational: [...operationalDaily.values()].reduce((sum, value) => sum.plus(value), zero()).toString(),
      grossSalary: grossSalary.toString(), kasbon: kasbonTotal.toString(), salaryNet: salaryNet.toString(),
      manualAdjustment: rows.filter((row) => ["MANUAL", "ADJUSTMENT"].includes(row.source)).reduce((sum, row) => row.direction === "INCOME" ? sum.plus(row.amount) : sum.minus(row.amount), zero()).toString(),
    },
    daily,
    sourceSummary,
    categories: [...new Set(rows.map((row) => row.category))].sort(),
    transactions: filtered.slice(startIndex, startIndex + query.pageSize).map(serialize),
    pagination: { page: query.page, pageSize: query.pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / query.pageSize)) },
    anomalies: [
      "Pemasukan JFS dan Omzet Pickup ditampilkan berdasarkan masing-masing sumber analisis.",
      "Salary periode ditempatkan pada tanggal akhir periode karena calculator existing tidak menyediakan nominal harian yang dapat diaudit.",
      ...(salaryNet.isNegative() ? ["Salary setelah Kasbon bernilai negatif; nilai dipertahankan tanpa dipaksa menjadi nol."] : []),
    ],
  };
}

type EntryInput = { date: string; direction: ProfitLossDirection; category: string; description: string; amount: number; reference?: string | null };
type AdjustmentInput = EntryInput & { reason: string };
const audit = (tx: Prisma.TransactionClient, context: Context, action: AuditAction, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) =>
  tx.auditLog.create({ data: { tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId, action, entityType, entityId, metadata } });

export async function createManualEntry(context: Context, input: EntryInput) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.profitLossManualEntry.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId,
      entryDate: dateValue(input.date), entryType: input.direction,
      category: input.category, description: input.description,
      amount: new Prisma.Decimal(input.amount), reference: input.reference || null,
      createdByUserId: context.actorId,
    } });
    await audit(tx, context, "CREATE", "PROFIT_LOSS_MANUAL_CREATED", row.id);
    return row;
  });
}

export async function updateManualEntry(context: Context, id: string, input: EntryInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.profitLossManualEntry.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId, status: "ACTIVE" } });
    if (!current) throw new Error("PROFIT_LOSS_ENTRY_NOT_FOUND");
    const row = await tx.profitLossManualEntry.update({ where: { id }, data: { entryDate: dateValue(input.date), entryType: input.direction, category: input.category, description: input.description, amount: new Prisma.Decimal(input.amount), reference: input.reference || null } });
    await audit(tx, context, "UPDATE", "PROFIT_LOSS_MANUAL_UPDATED", id);
    return row;
  });
}

export async function voidManualEntry(context: Context, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.profitLossManualEntry.updateMany({ where: { id, tenantId: context.tenantId, outletId: context.outletId, status: "ACTIVE" }, data: { status: "VOID", voidedAt: new Date(), voidedByUserId: context.actorId, voidReason: reason } });
    if (!result.count) throw new Error("PROFIT_LOSS_ENTRY_NOT_FOUND");
    await audit(tx, context, "DELETE", "PROFIT_LOSS_MANUAL_VOIDED", id, { reason });
    return { id, status: "VOID" as const };
  });
}

export async function createAdjustment(context: Context, input: AdjustmentInput) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.profitLossAdjustment.create({ data: { tenantId: context.tenantId, outletId: context.outletId, adjustmentDate: dateValue(input.date), direction: input.direction, category: input.category, description: input.description, amount: new Prisma.Decimal(input.amount), reason: input.reason, createdByUserId: context.actorId } });
    await audit(tx, context, "CREATE", "PROFIT_LOSS_ADJUSTMENT_CREATED", row.id);
    return row;
  });
}

export async function updateAdjustment(context: Context, id: string, input: AdjustmentInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.profitLossAdjustment.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId, status: "ACTIVE" } });
    if (!current) throw new Error("PROFIT_LOSS_ENTRY_NOT_FOUND");
    const row = await tx.profitLossAdjustment.update({ where: { id }, data: { adjustmentDate: dateValue(input.date), direction: input.direction, category: input.category, description: input.description, amount: new Prisma.Decimal(input.amount), reason: input.reason } });
    await audit(tx, context, "UPDATE", "PROFIT_LOSS_ADJUSTMENT_UPDATED", id);
    return row;
  });
}

export async function voidAdjustment(context: Context, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.profitLossAdjustment.updateMany({ where: { id, tenantId: context.tenantId, outletId: context.outletId, status: "ACTIVE" }, data: { status: "VOID", voidedAt: new Date(), voidedByUserId: context.actorId, voidReason: reason } });
    if (!result.count) throw new Error("PROFIT_LOSS_ENTRY_NOT_FOUND");
    await audit(tx, context, "DELETE", "PROFIT_LOSS_ADJUSTMENT_VOIDED", id, { reason });
    return { id, status: "VOID" as const };
  });
}
