import "server-only";
import {
  CashChannel,
  CashDirection,
  CashMovementStatus,
  CashMovementType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type Scope = { tenantId: string; outletId: string };
type Context = Scope & { actorId: string };

const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(String(value));
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const zero = () => new Prisma.Decimal(0);

export function channelBalances(input: Array<{
  direction: CashDirection;
  channel: CashChannel;
  amount: Prisma.Decimal;
}>) {
  let cash = zero(), bank = zero();
  for (const row of input) {
    const signed = row.direction === "IN" ? row.amount : row.amount.negated();
    if (row.channel === "CASH") cash = cash.plus(signed);
    else bank = bank.plus(signed);
  }
  return { cash, bank };
}

export function cashBalance(input: Array<{
  direction: CashDirection;
  channel: CashChannel;
  amount: Prisma.Decimal;
  recordStatus: CashMovementStatus;
}>) {
  return channelBalances(input.filter((row) => row.recordStatus === "VALID"));
}

export function runningBalances(input: Array<{
  direction: CashDirection;
  channel: CashChannel;
  amount: Prisma.Decimal;
  recordStatus: CashMovementStatus;
}>) {
  let total = zero();
  return input.map((row) => {
    if (row.recordStatus === "VALID") {
      total = row.direction === "IN" ? total.plus(row.amount) : total.minus(row.amount);
    }
    return total;
  });
}

export async function createAutomaticCashMovement(
  tx: Prisma.TransactionClient,
  input: Context & {
    businessDate: Date;
    occurredAt?: Date;
    direction: CashDirection;
    channel: CashChannel;
    movementType: CashMovementType;
    amount: Prisma.Decimal;
    description?: string | null;
    reference?: string | null;
    sourceType: string;
    sourceId: string;
    requestKey: string;
    auditEntityType?: "CASH_MOVEMENT_CREATED" | "CASH_MOVEMENT_UPDATED";
  },
) {
  if (!input.amount.greaterThan(0)) return null;
  const movement = await tx.cashMovement.upsert({
    where: { tenantId_outletId_sourceType_sourceId_direction_channel: {
      tenantId: input.tenantId, outletId: input.outletId, sourceType: input.sourceType,
      sourceId: input.sourceId, direction: input.direction, channel: input.channel,
    } },
    create: {
      tenantId: input.tenantId, outletId: input.outletId, businessDate: input.businessDate,
      occurredAt: input.occurredAt ?? new Date(), direction: input.direction, channel: input.channel,
      movementType: input.movementType, amount: input.amount, description: input.description,
      reference: input.reference, sourceType: input.sourceType, sourceId: input.sourceId,
      requestKey: input.requestKey, createdByUserId: input.actorId,
    },
    update: {
      businessDate: input.businessDate, occurredAt: input.occurredAt ?? new Date(),
      movementType: input.movementType, amount: input.amount, description: input.description,
      reference: input.reference, requestKey: input.requestKey, recordStatus: "VALID",
    },
  });
  await tx.auditLog.create({ data: {
    tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
    action: input.auditEntityType === "CASH_MOVEMENT_UPDATED" ? "UPDATE" : "CREATE",
    entityType: input.auditEntityType ?? "CASH_MOVEMENT_CREATED", entityId: movement.id,
    metadata: {
      sourceType: input.sourceType, sourceId: input.sourceId, direction: input.direction,
      channel: input.channel, movementType: input.movementType, amount: input.amount.toString(),
    },
  } });
  return movement;
}

export function voidAutomaticCashMovements(
  tx: Prisma.TransactionClient,
  scope: Scope,
  sourceType: string,
  sourceId: string,
) {
  return tx.cashMovement.updateMany({
    where: { ...scope, sourceType, sourceId, recordStatus: "VALID" },
    data: { recordStatus: "VOID" },
  });
}

type ListInput = Scope & {
  page: number; pageSize: number; startDate?: string; endDate?: string;
  direction?: CashDirection | ""; channel?: CashChannel | "";
  movementType?: CashMovementType | ""; reference?: string; search?: string;
};

export async function listCashFlow(input: ListInput) {
  const where: Prisma.CashMovementWhereInput = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    ...(input.startDate || input.endDate ? { businessDate: {
      ...(input.startDate ? { gte: dateValue(input.startDate) } : {}),
      ...(input.endDate ? { lte: dateValue(input.endDate) } : {}),
    } } : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.movementType ? { movementType: input.movementType } : {}),
    ...(input.reference ? { reference: { contains: input.reference, mode: "insensitive" } } : {}),
    ...(input.search ? { OR: [
      { description: { contains: input.search, mode: "insensitive" } },
      { reference: { contains: input.search, mode: "insensitive" } },
      { sourceType: { contains: input.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [filtered, allValid] = await Promise.all([
    prisma.cashMovement.findMany({
      where, include: { createdBy: { select: { name: true } } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
    prisma.cashMovement.findMany({
      where: { tenantId: input.tenantId, outletId: input.outletId, recordStatus: "VALID" },
      select: { direction: true, channel: true, amount: true, recordStatus: true, businessDate: true },
    }),
  ]);
  const balances = runningBalances(filtered);
  const rows = filtered.map((row, index) => ({ row, runningBalance: balances[index]! })).reverse();
  const skip = (input.page - 1) * input.pageSize;
  const month = new Date().toISOString().slice(0, 7);
  const monthRows = allValid.filter((row) => row.businessDate.toISOString().slice(0, 7) === month);
  const balance = cashBalance(allValid);
  return {
    data: rows.slice(skip, skip + input.pageSize).map(({ row, runningBalance }) => ({
      ...row, amount: row.amount.toString(), runningBalance: runningBalance.toString(),
      createdBy: row.createdBy.name, isManual: row.sourceType === "MANUAL",
    })),
    pagination: {
      page: input.page, pageSize: input.pageSize, total: rows.length,
      totalPages: Math.ceil(rows.length / input.pageSize),
    },
    summary: {
      cashOnHand: balance.cash.toString(),
      bankBalance: balance.bank.toString(),
      monthlyIncome: monthRows.filter((row) => row.direction === "IN")
        .reduce((sum, row) => sum.plus(row.amount), zero()).toString(),
      monthlyExpense: monthRows.filter((row) => row.direction === "OUT")
        .reduce((sum, row) => sum.plus(row.amount), zero()).toString(),
    },
  };
}

type ManualInput = {
  requestKey: string; businessDate: string; occurredAt: string; channel: CashChannel;
  amount: string | number; category: string; reference?: string; source?: string;
  description?: string; recipient?: string;
};

async function createManual(context: Context, input: ManualInput, direction: CashDirection) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cashMovement.findUnique({
      where: { tenantId_outletId_requestKey_direction_channel: {
        tenantId: context.tenantId, outletId: context.outletId, requestKey: input.requestKey,
        direction, channel: input.channel,
      } },
    });
    if (existing) return existing;
    const amount = decimal(input.amount);
    if (!amount.isInteger() || !amount.greaterThan(0)) throw new Error("INVALID_AMOUNT");
    const movementType = direction === "IN"
      ? input.category === "Refund Pembelian" ? "REFUND" : input.category === "Koreksi Kas Masuk" ? "ADJUSTMENT" : "MANUAL_INCOME"
      : input.category === "Tarik Cash Owner" ? "CASH_WITHDRAWAL" : input.category === "Pindah Kas" ? "TRANSFER" : input.category === "Koreksi Kas Keluar" ? "ADJUSTMENT" : "MANUAL_EXPENSE";
    const movement = await tx.cashMovement.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId,
      businessDate: dateValue(input.businessDate), occurredAt: new Date(input.occurredAt),
      direction, channel: input.channel, movementType, amount,
      description: [input.category, input.source, input.recipient, input.description].filter(Boolean).join(" · "),
      reference: input.reference || null, sourceType: "MANUAL", requestKey: input.requestKey,
      createdByUserId: context.actorId,
    } });
    await tx.auditLog.create({ data: {
      ...context, action: "CREATE", entityType: "CASH_MOVEMENT_CREATED", entityId: movement.id,
      metadata: { direction, channel: input.channel, movementType, amount: amount.toString(), requestKey: input.requestKey },
    } });
    return movement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const createManualIncome = (context: Context, input: ManualInput) => createManual(context, input, "IN");
export const createManualExpense = (context: Context, input: ManualInput) => createManual(context, input, "OUT");

export async function updateManualMovement(context: Context, id: string, input: ManualInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cashMovement.findFirst({
      where: { id, tenantId: context.tenantId, outletId: context.outletId },
    });
    if (!existing) return null;
    if (existing.sourceType !== "MANUAL") throw new Error("AUTOMATIC_MOVEMENT_READ_ONLY");
    if (existing.recordStatus === "VOID") throw new Error("MOVEMENT_VOID");
    const amount = decimal(input.amount);
    if (!amount.isInteger() || !amount.greaterThan(0)) throw new Error("INVALID_AMOUNT");
    const movement = await tx.cashMovement.update({ where: { id }, data: {
      businessDate: dateValue(input.businessDate), occurredAt: new Date(input.occurredAt),
      channel: input.channel, amount, description: [input.category, input.source, input.description].filter(Boolean).join(" · "),
      reference: input.reference || null,
    } });
    await tx.auditLog.create({ data: {
      ...context, action: "UPDATE", entityType: "CASH_MOVEMENT_UPDATED", entityId: id,
      metadata: { requestKey: input.requestKey, amount: amount.toString() },
    } });
    return movement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidManualMovement(
  context: Context,
  id: string,
  input: { requestKey: string; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cashMovement.findFirst({
      where: { id, tenantId: context.tenantId, outletId: context.outletId },
    });
    if (!existing) return null;
    if (existing.sourceType !== "MANUAL") throw new Error("AUTOMATIC_MOVEMENT_READ_ONLY");
    if (existing.recordStatus === "VOID") return existing;
    const movement = await tx.cashMovement.update({ where: { id }, data: { recordStatus: "VOID" } });
    await tx.auditLog.create({ data: {
      ...context, action: "DELETE", entityType: "CASH_MOVEMENT_VOIDED", entityId: id,
      metadata: { requestKey: input.requestKey, reason: input.reason },
    } });
    return movement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
