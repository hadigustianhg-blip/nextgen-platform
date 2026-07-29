import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { createAutomaticCashMovement, voidAutomaticCashMovements } from "@/modules/payment/cash-flow.service";

type Scope = { tenantId: string; outletId: string };
type Context = Scope & { actorId: string };

const zero = () => new Prisma.Decimal(0);
const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(String(value));
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const operationalPrismaScope = (scope: Scope) => ({
  tenantId: scope.tenantId,
  outletId: scope.outletId,
});
export const operationalPrismaPagination = (page: number, pageSize: number) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export function normalizeTeamName(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");
}

export function resolveBusinessDateCandidates(
  calendarDate: string,
  candidates: Array<{ operationalDate: string; status?: "OPEN" | "REOPENED" | "CLOSED" }>,
) {
  const statusByDate = new Map(candidates.filter((item) => item.status).map((item) => [
    item.operationalDate, item.status!,
  ]));
  const openBusinessDates = [...new Set(candidates.map((item) => item.operationalDate))]
    .filter((date) => date <= calendarDate && statusByDate.get(date) !== "CLOSED")
    .sort()
    .map((operationalDate) => ({
      operationalDate,
      status: statusByDate.get(operationalDate) === "REOPENED" ? "REOPENED" as const : "OPEN" as const,
    }));
  const activeBusinessDate = openBusinessDates[0]?.operationalDate ?? calendarDate;
  return {
    activeBusinessDate, calendarDate, openBusinessDates,
    openDayCount: openBusinessDates.length,
    isPastDueOpenDay: activeBusinessDate < calendarDate,
  };
}

export function calculateOperationalSummary(input: {
  pickupCash: Prisma.Decimal;
  deliveryCash: Prisma.Decimal;
  pickupTransfer: Prisma.Decimal;
  deliveryTransfer: Prisma.Decimal;
  pickupOutstanding: Prisma.Decimal;
  deliveryOutstanding: Prisma.Decimal;
  expense: Prisma.Decimal;
  bankDepositAmount?: Prisma.Decimal;
  physicalCash?: Prisma.Decimal | null;
}) {
  const cashCollected = input.pickupCash.plus(input.deliveryCash);
  const transferCollected = input.pickupTransfer.plus(input.deliveryTransfer);
  const operationalExpense = input.expense;
  const cashAvailable = cashCollected.minus(operationalExpense);
  const bankDepositAmount = input.bankDepositAmount ?? zero();
  const remainingCashAfterDeposit = cashAvailable.minus(bankDepositAmount);
  const outstanding = input.pickupOutstanding.plus(input.deliveryOutstanding);
  const cashVariance = input.physicalCash == null
    ? null
    : input.physicalCash.minus(remainingCashAfterDeposit);
  return {
    cashCollected,
    transferCollected,
    operationalExpense,
    cashAvailable,
    bankDepositAmount,
    remainingCashAfterDeposit,
    outstanding,
    cashVariance,
    varianceStatus: cashVariance == null
      ? "NOT_SET"
      : cashVariance.isZero()
        ? "MATCH"
        : cashVariance.isNegative()
          ? "SHORT"
          : "OVER",
  } as const;
}

const pickupFinancialInclude = {
  rawPickup: { select: { settlementRaw: true } },
  settlementRevisions: {
    where: { recordStatus: "VALID" as const },
    orderBy: { revision: "desc" as const },
    take: 1,
    select: { discountAmount: true },
  },
  payments: {
    where: { recordStatus: "VALID" as const },
    select: { receivedAmount: true, paymentMethodRaw: true },
  },
};

const deliveryFinancialInclude = {
  payments: {
    where: { recordStatus: "VALID" as const },
    select: {
      cashAmount: true,
      transfers: {
        where: { recordStatus: "VALID" as const },
        select: { amount: true },
      },
    },
  },
};

function isCashPickup(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID") === "TUNAI";
}

export async function resolveOperationalBusinessDate(
  scope: Scope,
  calendarDate = jakartaOperationalDate(),
) {
  const calendar = dateValue(calendarDate);
  const whereScope = operationalPrismaScope(scope);
  const [closings, expenses, pickups, deliveries] = await Promise.all([
    prisma.operationalClosing.findMany({
      where: { ...whereScope, operationalDate: { lte: calendar } },
      select: { operationalDate: true, status: true },
      orderBy: { operationalDate: "asc" },
    }),
    prisma.operationalExpense.findMany({
      where: { ...whereScope, operationalDate: { lte: calendar } },
      select: { operationalDate: true },
      distinct: ["operationalDate"],
    }),
    prisma.masterPickup.findMany({
      where: { ...whereScope, operationalDate: { lte: calendar } },
      select: { operationalDate: true },
      distinct: ["operationalDate"],
    }),
    prisma.masterSetoran.findMany({
      where: { ...whereScope, operationalDate: { lte: calendar } },
      select: { operationalDate: true },
      distinct: ["operationalDate"],
    }),
  ]);
  return resolveBusinessDateCandidates(calendarDate, [
    ...expenses.map((row) => ({ operationalDate: row.operationalDate.toISOString().slice(0, 10) })),
    ...pickups.map((row) => ({ operationalDate: row.operationalDate.toISOString().slice(0, 10) })),
    ...deliveries.map((row) => ({ operationalDate: row.operationalDate.toISOString().slice(0, 10) })),
    ...closings.map((row) => ({
      operationalDate: row.operationalDate.toISOString().slice(0, 10),
      status: row.status,
    })),
  ]);
}

export async function auditOperationalBusinessDate(
  context: Context,
  resolution: Awaited<ReturnType<typeof resolveOperationalBusinessDate>>,
) {
  await prisma.auditLog.create({ data: {
    ...context,
    action: "UPDATE",
    entityType: "OPERATIONAL_BUSINESS_DATE_RESOLVED",
    metadata: {
      activeBusinessDate: resolution.activeBusinessDate,
      calendarDate: resolution.calendarDate,
      openDayCount: resolution.openDayCount,
    },
  } });
  if (resolution.isPastDueOpenDay) {
    await prisma.auditLog.create({ data: {
      ...context,
      action: "UPDATE",
      entityType: "OPERATIONAL_PAST_DUE_OPEN_DAY_DETECTED",
      metadata: {
        activeBusinessDate: resolution.activeBusinessDate,
        calendarDate: resolution.calendarDate,
        openDayCount: resolution.openDayCount,
      },
    } });
  }
}

async function calculateDateFinancials(
  tx: Prisma.TransactionClient,
  scope: Scope,
  operationalDate: Date,
) {
  const where = { ...operationalPrismaScope(scope), operationalDate };
  const [pickupRows, deliveryRows, validExpenses] = await Promise.all([
    tx.masterPickup.findMany({ where, include: pickupFinancialInclude }),
    tx.masterSetoran.findMany({ where, include: deliveryFinancialInclude }),
    tx.operationalExpense.findMany({
      where: { ...where, status: "VALID" },
      select: { amount: true },
    }),
  ]);
  let pickupCash = zero(), pickupTransfer = zero(), pickupOutstanding = zero();
  for (const row of pickupRows) {
    if (!isCashPickup(row.rawPickup.settlementRaw)) continue;
    const obligation = row.freightAmount.minus(row.settlementRevisions[0]?.discountAmount ?? zero());
    let paid = zero();
    for (const payment of row.payments) {
      paid = paid.plus(payment.receivedAmount);
      const method = payment.paymentMethodRaw.trim().toLocaleUpperCase("id-ID");
      if (method === "TUNAI" || method === "CASH") pickupCash = pickupCash.plus(payment.receivedAmount);
      if (method === "TRANSFER") pickupTransfer = pickupTransfer.plus(payment.receivedAmount);
    }
    const remaining = obligation.minus(paid);
    if (remaining.greaterThan(0)) pickupOutstanding = pickupOutstanding.plus(remaining);
  }
  let deliveryCash = zero(), deliveryTransfer = zero(), deliveryOutstanding = zero();
  for (const row of deliveryRows) {
    let paid = zero();
    for (const payment of row.payments) {
      deliveryCash = deliveryCash.plus(payment.cashAmount);
      paid = paid.plus(payment.cashAmount);
      for (const transfer of payment.transfers) {
        deliveryTransfer = deliveryTransfer.plus(transfer.amount);
        paid = paid.plus(transfer.amount);
      }
    }
    const remaining = row.totalSettlementAmount.minus(paid);
    if (remaining.greaterThan(0)) deliveryOutstanding = deliveryOutstanding.plus(remaining);
  }
  return {
    pickupCash, deliveryCash, pickupTransfer, deliveryTransfer,
    pickupOutstanding, deliveryOutstanding,
    expense: validExpenses.reduce((sum, row) => sum.plus(row.amount), zero()),
  };
}

type OperationalListInput = Scope & {
  page: number;
  pageSize: number;
  operationalDate?: string;
  category?: string;
  team?: string;
  search?: string;
};

export async function listOperationalSettlement(input: OperationalListInput) {
  const scope = operationalPrismaScope(input);
  const business = await resolveOperationalBusinessDate(scope);
  const viewDate = input.operationalDate || business.activeBusinessDate;
  const dateFilter = dateValue(viewDate);
  const expenseWhere: Prisma.OperationalExpenseWhereInput = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    operationalDate: dateFilter,
    ...(input.category ? { category: input.category } : {}),
    ...(input.team ? { teamName: { contains: input.team, mode: "insensitive" } } : {}),
    ...(input.search ? {
      OR: [
        { description: { contains: input.search, mode: "insensitive" } },
        { vehiclePlate: { contains: input.search, mode: "insensitive" } },
        { teamName: { contains: input.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const pagination = operationalPrismaPagination(input.page, input.pageSize);
  const [expenses, totalExpenses, financial, closing] = await Promise.all([
    prisma.operationalExpense.findMany({
      where: expenseWhere,
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination,
    }),
    prisma.operationalExpense.count({ where: expenseWhere }),
    prisma.$transaction((tx) => calculateDateFinancials(tx, scope, dateFilter)),
    prisma.operationalClosing.findUnique({
          where: { tenantId_outletId_operationalDate: {
            tenantId: input.tenantId,
            outletId: input.outletId,
            operationalDate: dateFilter,
          } },
        }),
  ]);
  const liveSummary = calculateOperationalSummary({ ...financial, physicalCash: closing?.physicalCash });
  const summary = closing?.status === "CLOSED" && closing.snapshotVersion > 0 ? {
    cashCollected: closing.cashCollectedSnapshot,
    transferCollected: closing.transferCollectedSnapshot,
    operationalExpense: closing.operationalExpenseSnapshot,
    cashAvailable: closing.cashAvailableBeforeDepositSnapshot,
    outstanding: closing.outstandingSnapshot,
    bankDepositAmount: closing.bankDepositAmount,
    remainingCashAfterDeposit: closing.remainingCashAfterDepositSnapshot,
    cashVariance: closing.cashVariance,
    varianceStatus: closing.varianceStatus,
  } : liveSummary;
  return {
    ...business,
    selectedOperationalDate: viewDate,
    status: closing?.status ?? "OPEN",
    data: expenses.map((row) => ({
      id: row.id,
      operationalDate: row.operationalDate,
      createdAt: row.createdAt,
      category: row.category,
      amount: row.amount.toString(),
      description: row.description,
      teamName: row.teamName,
      cashAdvanceCategory: row.cashAdvanceCategory,
      vehiclePlate: row.vehiclePlate,
      status: row.status,
      createdBy: row.createdBy.name,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: totalExpenses,
      totalPages: Math.ceil(totalExpenses / input.pageSize),
    },
    summary: {
      cashCollected: summary.cashCollected.toString(),
      operationalExpense: summary.operationalExpense.toString(),
      cashAvailable: summary.cashAvailable.toString(),
      transferCollected: summary.transferCollected.toString(),
      outstanding: summary.outstanding.toString(),
    },
    closing: {
      status: closing?.status ?? "OPEN",
      bankDepositAmount: closing?.bankDepositAmount.toString() ?? "0",
      bankDepositAccount: closing?.bankDepositAccount ?? null,
      bankDepositReference: closing?.bankDepositReference ?? null,
      bankDepositNote: closing?.bankDepositNote ?? null,
      remainingCashAfterDeposit: summary.remainingCashAfterDeposit.toString(),
      physicalCash: closing?.physicalCash.toString() ?? "0",
      cashVariance: summary.cashVariance?.toString() ?? null,
      varianceStatus: summary.varianceStatus,
      closedAt: closing?.closedAt ?? null,
      reopenReason: closing?.reopenReason ?? null,
    },
  };
}

export async function listOperationalTeams(scope: Scope) {
  const where = operationalPrismaScope(scope);
  const [pickup, delivery] = await Promise.all([
    prisma.masterPickup.findMany({
      where,
      select: { staffName: true },
      distinct: ["staffName"],
    }),
    prisma.masterSetoran.findMany({
      where,
      select: { courierName: true },
      distinct: ["courierName"],
    }),
  ]);
  const names = new Map<string, string>();
  for (const value of [
    ...pickup.map((row) => row.staffName),
    ...delivery.map((row) => row.courierName),
  ]) {
    const key = normalizeTeamName(value);
    if (key && !names.has(key)) names.set(key, key);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "id-ID"));
}

async function ensureOpen(
  tx: Prisma.TransactionClient,
  scope: Scope,
  operationalDate: Date,
) {
  const closing = await tx.operationalClosing.findUnique({
    where: { tenantId_outletId_operationalDate: {
      tenantId: scope.tenantId, outletId: scope.outletId, operationalDate,
    } },
  });
  if (closing?.status === "CLOSED") throw new Error("OPERATIONAL_CLOSED");
}

async function previousRequest(
  tx: Prisma.TransactionClient,
  scope: Scope,
  requestKey: string,
) {
  return tx.operationalActionRequest.findUnique({
    where: { tenantId_outletId_requestKey: {
      tenantId: scope.tenantId, outletId: scope.outletId, requestKey,
    } },
  });
}

type ExpenseInput = {
  requestKey: string;
  operationalDate: string;
  category: string;
  amount: string | number;
  description?: string | null;
  teamName?: string | null;
  cashAdvanceCategory?: string | null;
  vehiclePlate?: string | null;
};

export async function createOperationalExpense(context: Context, input: ExpenseInput) {
  return prisma.$transaction(async (tx) => {
    const replay = await previousRequest(tx, context, input.requestKey);
    if (replay?.entityId) return tx.operationalExpense.findFirst({ where: { id: replay.entityId, tenantId: context.tenantId, outletId: context.outletId } });
    const operationalDate = dateValue(input.operationalDate);
    await ensureOpen(tx, context, operationalDate);
    const expense = await tx.operationalExpense.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      operationalDate,
      category: input.category,
      amount: decimal(input.amount),
      description: input.description || null,
      teamName: input.category === "Kasbon" && input.teamName ? normalizeTeamName(input.teamName) : null,
      cashAdvanceCategory: input.category === "Kasbon" ? input.cashAdvanceCategory || null : null,
      vehiclePlate: input.category === "BBM" ? input.vehiclePlate?.replace(/\s+/g, "").toLocaleUpperCase("id-ID") || null : null,
      createdByUserId: context.actorId,
      updatedByUserId: context.actorId,
    } });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: expense.operationalDate, occurredAt: expense.createdAt,
      direction: "OUT", channel: "CASH", movementType: "OPERATIONAL_EXPENSE",
      amount: expense.amount, description: expense.description || expense.category,
      reference: expense.vehiclePlate || expense.teamName, sourceType: "OperationalExpense",
      sourceId: expense.id, requestKey: expense.id,
    });
    await tx.operationalActionRequest.create({ data: { tenantId: context.tenantId, outletId: context.outletId, requestKey: input.requestKey, action: "EXPENSE_CREATED", entityId: expense.id } });
    await tx.auditLog.create({ data: {
      ...context, action: "CREATE", entityType: "OPERATIONAL_EXPENSE_CREATED", entityId: expense.id,
      metadata: { operationalDate: input.operationalDate, category: input.category, amount: expense.amount.toString() },
    } });
    return expense;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateOperationalExpense(
  context: Context,
  id: string,
  input: Omit<ExpenseInput, "operationalDate">,
) {
  return prisma.$transaction(async (tx) => {
    const replay = await previousRequest(tx, context, input.requestKey);
    if (replay) return tx.operationalExpense.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId } });
    const existing = await tx.operationalExpense.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId } });
    if (!existing) return null;
    if (existing.status === "VOID") throw new Error("EXPENSE_VOID");
    await ensureOpen(tx, context, existing.operationalDate);
    const updated = await tx.operationalExpense.update({ where: { id }, data: {
      category: input.category,
      amount: decimal(input.amount),
      description: input.description || null,
      teamName: input.category === "Kasbon" && input.teamName ? normalizeTeamName(input.teamName) : null,
      cashAdvanceCategory: input.category === "Kasbon" ? input.cashAdvanceCategory || null : null,
      vehiclePlate: input.category === "BBM" ? input.vehiclePlate?.replace(/\s+/g, "").toLocaleUpperCase("id-ID") || null : null,
      updatedByUserId: context.actorId,
    } });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: updated.operationalDate, occurredAt: updated.createdAt,
      direction: "OUT", channel: "CASH", movementType: "OPERATIONAL_EXPENSE",
      amount: updated.amount, description: updated.description || updated.category,
      reference: updated.vehiclePlate || updated.teamName, sourceType: "OperationalExpense",
      sourceId: updated.id, requestKey: updated.id, auditEntityType: "CASH_MOVEMENT_UPDATED",
    });
    await tx.operationalActionRequest.create({ data: { tenantId: context.tenantId, outletId: context.outletId, requestKey: input.requestKey, action: "EXPENSE_UPDATED", entityId: id } });
    await tx.auditLog.create({ data: {
      ...context, action: "UPDATE", entityType: "OPERATIONAL_EXPENSE_UPDATED", entityId: id,
      metadata: { previousAmount: existing.amount.toString(), amount: updated.amount.toString(), category: updated.category },
    } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidOperationalExpense(
  context: Context,
  id: string,
  input: { requestKey: string; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    const replay = await previousRequest(tx, context, input.requestKey);
    if (replay) return tx.operationalExpense.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId } });
    const existing = await tx.operationalExpense.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId } });
    if (!existing) return null;
    await ensureOpen(tx, context, existing.operationalDate);
    if (existing.status === "VOID") return existing;
    const updated = await tx.operationalExpense.update({ where: { id }, data: {
      status: "VOID", voidedAt: new Date(), voidedByUserId: context.actorId,
      voidReason: input.reason, updatedByUserId: context.actorId,
    } });
    await voidAutomaticCashMovements(tx, context, "OperationalExpense", id);
    await tx.operationalActionRequest.create({ data: { tenantId: context.tenantId, outletId: context.outletId, requestKey: input.requestKey, action: "EXPENSE_VOID", entityId: id } });
    await tx.auditLog.create({ data: {
      ...context, action: "DELETE", entityType: "OPERATIONAL_EXPENSE_VOID", entityId: id,
      metadata: { reason: input.reason, amount: existing.amount.toString() },
    } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function closeOperational(
  context: Context,
  input: {
    requestKey: string;
    operationalDate: string;
    bankDepositAmount?: string | number;
    bankDepositAccount?: string | null;
    bankDepositReference?: string | null;
    bankDepositNote?: string | null;
    physicalCash: string | number;
  },
) {
  const closing = await prisma.$transaction(async (tx) => {
    const replay = await previousRequest(tx, context, input.requestKey);
    const operationalDate = dateValue(input.operationalDate);
    const key = { tenantId: context.tenantId, outletId: context.outletId, operationalDate };
    if (replay) return tx.operationalClosing.findUnique({ where: { tenantId_outletId_operationalDate: key } });
    const financial = await calculateDateFinancials(tx, context, operationalDate);
    const bankDepositAmount = decimal(input.bankDepositAmount ?? 0);
    const physicalCash = decimal(input.physicalCash);
    const calculated = calculateOperationalSummary({
      ...financial, bankDepositAmount, physicalCash,
    });
    if (
      bankDepositAmount.greaterThan(0) &&
      bankDepositAmount.greaterThan(calculated.cashAvailable)
    ) {
      throw new Error("BANK_DEPOSIT_EXCEEDS_AVAILABLE_CASH");
    }
    if (bankDepositAmount.greaterThan(0) && !input.bankDepositAccount) {
      throw new Error("BANK_ACCOUNT_REQUIRED");
    }
    const snapshot = {
      snapshotVersion: 1,
      cashCollectedSnapshot: calculated.cashCollected,
      transferCollectedSnapshot: calculated.transferCollected,
      outstandingSnapshot: calculated.outstanding,
      operationalExpenseSnapshot: calculated.operationalExpense,
      cashAvailableBeforeDepositSnapshot: calculated.cashAvailable,
      bankDepositAmount,
      bankDepositAccount: input.bankDepositAccount || null,
      bankDepositReference: input.bankDepositReference || null,
      bankDepositNote: input.bankDepositNote || null,
      remainingCashAfterDepositSnapshot: calculated.remainingCashAfterDeposit,
      physicalCash,
      cashVariance: calculated.cashVariance ?? zero(),
      varianceStatus: calculated.varianceStatus,
    };
    const closing = await tx.operationalClosing.upsert({
      where: { tenantId_outletId_operationalDate: key },
      create: {
        tenantId: context.tenantId, outletId: context.outletId, operationalDate,
        ...snapshot, status: "CLOSED",
        closedByUserId: context.actorId, closedAt: new Date(),
      },
      update: {
        ...snapshot, status: "CLOSED",
        closedByUserId: context.actorId, closedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: operationalDate, direction: "OUT", channel: "CASH",
      movementType: "BANK_DEPOSIT", amount: bankDepositAmount,
      description: "Setoran bank dari kas", reference: input.bankDepositReference,
      sourceType: "OperationalClosing", sourceId: closing.id, requestKey: closing.id,
    });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: operationalDate, direction: "IN", channel: "BANK",
      movementType: "BANK_DEPOSIT", amount: bankDepositAmount,
      description: "Setoran bank masuk", reference: input.bankDepositReference,
      sourceType: "OperationalClosing", sourceId: closing.id, requestKey: closing.id,
    });
    await tx.operationalActionRequest.create({ data: { tenantId: context.tenantId, outletId: context.outletId, requestKey: input.requestKey, action: "OPERATIONAL_CLOSED", entityId: closing.id } });
    await tx.auditLog.create({ data: {
      ...context, action: "UPDATE", entityType: "OPERATIONAL_CLOSED", entityId: closing.id,
      metadata: {
        operationalDate: input.operationalDate,
        calendarDateAtClosing: jakartaOperationalDate(),
        cashCollected: calculated.cashCollected.toString(),
        transferCollected: calculated.transferCollected.toString(),
        operationalExpense: calculated.operationalExpense.toString(),
        cashAvailableBeforeDeposit: calculated.cashAvailable.toString(),
        bankDepositAmount: bankDepositAmount.toString(),
        bankDepositAccount: input.bankDepositAccount ? input.bankDepositAccount.slice(0, 50) : null,
        remainingCashAfterDeposit: calculated.remainingCashAfterDeposit.toString(),
        physicalCash: physicalCash.toString(),
        cashVariance: calculated.cashVariance?.toString() ?? "0",
        varianceStatus: calculated.varianceStatus,
        requestKey: input.requestKey,
      },
    } });
    return closing;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const next = await resolveOperationalBusinessDate(context);
  return { closing, nextBusinessDate: next.activeBusinessDate };
}

export async function reopenOperational(
  context: Context,
  input: { requestKey: string; operationalDate: string; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    const replay = await previousRequest(tx, context, input.requestKey);
    const operationalDate = dateValue(input.operationalDate);
    const key = { tenantId: context.tenantId, outletId: context.outletId, operationalDate };
    if (replay) return tx.operationalClosing.findUnique({ where: { tenantId_outletId_operationalDate: key } });
    const existing = await tx.operationalClosing.findUnique({ where: { tenantId_outletId_operationalDate: key } });
    if (!existing) throw new Error("CLOSING_NOT_FOUND");
    const closing = await tx.operationalClosing.update({ where: { id: existing.id }, data: {
      status: "REOPENED", reopenedByUserId: context.actorId, reopenedAt: new Date(),
      reopenReason: input.reason, version: { increment: 1 },
    } });
    await voidAutomaticCashMovements(tx, context, "OperationalClosing", closing.id);
    await tx.operationalActionRequest.create({ data: { tenantId: context.tenantId, outletId: context.outletId, requestKey: input.requestKey, action: "OPERATIONAL_REOPENED", entityId: closing.id } });
    await tx.auditLog.create({ data: {
      ...context, action: "UPDATE", entityType: "OPERATIONAL_REOPENED", entityId: closing.id,
      metadata: { operationalDate: input.operationalDate, reason: input.reason },
    } });
    return closing;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
