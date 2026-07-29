import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { createAutomaticCashMovement, voidAutomaticCashMovements } from "./cash-flow.service";

type Scope = { tenantId: string; outletId: string };
type Context = Scope & { actorId: string };
const zero = () => new Prisma.Decimal(0);
const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(String(value));
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isCash = (value: string) => ["CASH", "TUNAI"].includes(value.trim().toUpperCase());
const prismaScope = (scope: Scope) => ({ tenantId: scope.tenantId, outletId: scope.outletId });

export function pickupReceivableStatus(obligation: Prisma.Decimal, paid: Prisma.Decimal) {
  if (paid.isZero()) return "BELUM_BAYAR" as const;
  if (paid.lessThan(obligation)) return "SEBAGIAN" as const;
  if (paid.equals(obligation)) return "LUNAS" as const;
  return "LEBIH_BAYAR" as const;
}

export function receivableAgeDays(pickupDate: Date, today = jakartaOperationalDate()) {
  return Math.max(0, Math.floor((dateValue(today).valueOf() - dateValue(pickupDate.toISOString().slice(0, 10)).valueOf()) / 86_400_000));
}

export function receivableAgeBucket(days: number) {
  if (days === 0) return "TODAY" as const;
  if (days <= 3) return "1_3" as const;
  if (days <= 7) return "4_7" as const;
  if (days > 30) return "OVER_30" as const;
  return "OVER_7" as const;
}

const pickupInclude = {
  rawPickup: { select: { receiverName: true, senderName: true } },
  settlementRevisions: {
    where: { recordStatus: "VALID" as const },
    orderBy: { revision: "desc" as const },
    take: 1,
    select: { discountAmount: true },
  },
  payments: {
    where: { recordStatus: "VALID" as const },
    orderBy: [{ paymentDate: "asc" as const }, { createdAt: "asc" as const }],
  },
};

type ListInput = Scope & {
  page: number; pageSize: number; pickupDate?: string; waybill?: string; customer?: string;
  staff?: string; status?: "" | "BELUM_BAYAR" | "SEBAGIAN" | "LUNAS" | "LEBIH_BAYAR";
  age?: "" | "TODAY" | "1_3" | "4_7" | "OVER_7" | "OVER_30";
  method?: "" | "CASH" | "TRANSFER"; search?: string;
};

export async function listPickupPayment(input: ListInput) {
  const rows = await prisma.masterPickup.findMany({
    where: {
      tenantId: input.tenantId, outletId: input.outletId,
      ...(input.pickupDate ? { operationalDate: dateValue(input.pickupDate) } : {}),
      ...(input.waybill ? { waybillNo: { contains: input.waybill, mode: "insensitive" } } : {}),
      ...(input.customer ? { senderName: { contains: input.customer, mode: "insensitive" } } : {}),
      ...(input.staff ? { staffName: { contains: input.staff, mode: "insensitive" } } : {}),
      ...(input.search ? { OR: [
        { waybillNo: { contains: input.search, mode: "insensitive" } },
        { senderName: { contains: input.search, mode: "insensitive" } },
        { staffName: { contains: input.search, mode: "insensitive" } },
        { rawPickup: { receiverName: { contains: input.search, mode: "insensitive" } } },
      ] } : {}),
    },
    include: pickupInclude,
    orderBy: [{ operationalDate: "asc" }, { waybillNo: "asc" }],
  });
  const mapped = rows.map((row) => {
    const obligation = row.freightAmount.minus(row.settlementRevisions[0]?.discountAmount ?? zero());
    const paid = row.payments.reduce((sum, payment) => sum.plus(payment.receivedAmount), zero());
    const outstanding = obligation.minus(paid);
    const status = pickupReceivableStatus(obligation, paid);
    const ageDays = receivableAgeDays(row.operationalDate);
    return {
      id: row.id, pickupDate: row.operationalDate, ageDays, ageBucket: receivableAgeBucket(ageDays),
      waybill: row.waybillNo, customer: row.senderName ?? row.rawPickup.senderName ?? row.rawPickup.receiverName ?? "—",
      sender: row.rawPickup.senderName, staff: row.staffName, freight: row.freightAmount.toString(),
      obligation: obligation.toString(), paid: paid.toString(), outstanding: outstanding.toString(), status,
      methods: [...new Set(row.payments.map((payment) => isCash(payment.paymentMethodRaw) ? "CASH" : "TRANSFER"))],
    };
  }).filter((row) =>
    (input.status ? row.status === input.status : decimal(row.outstanding).greaterThan(0)) &&
    (!input.age || row.ageBucket === input.age) &&
    (!input.method || row.methods.includes(input.method)));
  const skip = (input.page - 1) * input.pageSize;
  const allPayments = rows.flatMap((row) => row.payments);
  const month = jakartaOperationalDate().slice(0, 7);
  const monthly = allPayments.filter((payment) => payment.paymentDate.toISOString().slice(0, 7) === month);
  return {
    data: mapped.slice(skip, skip + input.pageSize),
    pagination: { page: input.page, pageSize: input.pageSize, total: mapped.length, totalPages: Math.ceil(mapped.length / input.pageSize) },
    summary: {
      totalOutstanding: mapped.reduce((sum, row) => sum.plus(Prisma.Decimal.max(decimal(row.outstanding), zero())), zero()).toString(),
      outstandingWaybills: mapped.filter((row) => decimal(row.outstanding).greaterThan(0)).length,
      cashPaymentMonth: monthly.filter((payment) => isCash(payment.paymentMethodRaw)).reduce((sum, payment) => sum.plus(payment.receivedAmount), zero()).toString(),
      transferPaymentMonth: monthly.filter((payment) => !isCash(payment.paymentMethodRaw)).reduce((sum, payment) => sum.plus(payment.receivedAmount), zero()).toString(),
      overdueOver7: mapped.filter((row) => row.ageDays > 7 && decimal(row.outstanding).greaterThan(0)).length,
    },
  };
}

export async function getPickupPaymentDetail(scope: Scope, masterPickupId: string) {
  const row = await prisma.masterPickup.findFirst({
    where: { id: masterPickupId, ...scope },
    include: {
      ...pickupInclude,
      payments: {
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        include: { createdBy: { select: { name: true } } },
      },
    },
  });
  if (!row) return null;
  const obligation = row.freightAmount.minus(row.settlementRevisions[0]?.discountAmount ?? zero());
  const paid = row.payments.filter((payment) => payment.recordStatus === "VALID")
    .reduce((sum, payment) => sum.plus(payment.receivedAmount), zero());
  return {
    id: row.id, waybill: row.waybillNo, customer: row.senderName ?? row.rawPickup.receiverName ?? "—",
    pickupDate: row.operationalDate, freight: row.freightAmount.toString(),
    obligation: obligation.toString(), paid: paid.toString(), outstanding: obligation.minus(paid).toString(),
    status: pickupReceivableStatus(obligation, paid),
    history: row.payments.map((payment) => ({
      id: payment.id, paymentDate: payment.paymentDate, method: isCash(payment.paymentMethodRaw) ? "CASH" : "TRANSFER",
      amount: payment.receivedAmount.toString(), reference: payment.reference, bank: payment.transferAccount,
      note: payment.note, status: payment.recordStatus, createdBy: payment.createdBy.name,
    })),
  };
}

type PaymentInput = {
  requestKey: string; masterPickupId: string; paymentDate: string; method: "CASH" | "TRANSFER";
  amount: string | number; reference?: string; bank?: string; note?: string; confirmOverpayment?: boolean;
};

async function validatePayment(
  tx: Prisma.TransactionClient,
  scope: Scope,
  masterPickupId: string,
  amount: Prisma.Decimal,
  excludedPaymentId?: string,
) {
  const master = await tx.masterPickup.findFirst({
    where: { id: masterPickupId, ...prismaScope(scope) },
    include: pickupInclude,
  });
  if (!master) return null;
  const obligation = master.freightAmount.minus(master.settlementRevisions[0]?.discountAmount ?? zero());
  const paid = master.payments.filter((payment) => payment.id !== excludedPaymentId)
    .reduce((sum, payment) => sum.plus(payment.receivedAmount), zero());
  return { master, obligation, paid, resultingOutstanding: obligation.minus(paid.plus(amount)) };
}

export async function createPickupPayment(context: Context, input: PaymentInput) {
  return prisma.$transaction(async (tx) => {
    const replay = await tx.pickupPayment.findUnique({
      where: { transactionKey_revision: { transactionKey: input.requestKey, revision: 1 } },
    });
    if (replay) return replay;
    const amount = decimal(input.amount);
    if (!amount.isInteger() || !amount.greaterThan(0)) throw new Error("INVALID_AMOUNT");
    const calculated = await validatePayment(tx, context, input.masterPickupId, amount);
    if (!calculated) return null;
    if (calculated.resultingOutstanding.isNegative() && !input.confirmOverpayment) throw new Error("OVERPAYMENT_CONFIRMATION_REQUIRED");
    const payment = await tx.pickupPayment.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, masterPickupId: input.masterPickupId,
      transactionKey: input.requestKey, revision: 1, paymentDate: dateValue(input.paymentDate),
      receivedAmount: amount, paymentMethodRaw: input.method, transferAccount: input.method === "TRANSFER" ? input.bank : null,
      reference: input.reference || null, note: input.note || null,
      createdByUserId: context.actorId, updatedByUserId: context.actorId,
    } });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: payment.paymentDate, direction: "IN",
      channel: input.method === "CASH" ? "CASH" : "BANK", movementType: "PICKUP_PAYMENT",
      amount, description: "Pembayaran pickup", reference: calculated.master.waybillNo,
      sourceType: "PickupPayment", sourceId: payment.id, requestKey: payment.id,
    });
    await tx.auditLog.create({ data: {
      ...context, action: "CREATE", entityType: "PICKUP_PAYMENT_CREATED", entityId: payment.id,
      metadata: { requestKey: input.requestKey, masterPickupId: input.masterPickupId, method: input.method, amount: amount.toString() },
    } });
    return payment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updatePickupPayment(context: Context, id: string, input: Omit<PaymentInput, "masterPickupId">) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.pickupPayment.findFirst({ where: { id, ...prismaScope(context), recordStatus: "VALID" } });
    if (!old) return null;
    const amount = decimal(input.amount);
    if (!amount.isInteger() || !amount.greaterThan(0)) throw new Error("INVALID_AMOUNT");
    const calculated = await validatePayment(tx, context, old.masterPickupId, amount, old.id);
    if (!calculated) return null;
    if (calculated.resultingOutstanding.isNegative() && !input.confirmOverpayment) throw new Error("OVERPAYMENT_CONFIRMATION_REQUIRED");
    await tx.pickupPayment.update({ where: { id }, data: { recordStatus: "SUPERSEDED", updatedByUserId: context.actorId } });
    await voidAutomaticCashMovements(tx, context, "PickupPayment", id);
    const payment = await tx.pickupPayment.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, masterPickupId: old.masterPickupId,
      transactionKey: old.transactionKey, revision: old.revision + 1, supersedesPaymentId: old.id,
      paymentDate: dateValue(input.paymentDate), receivedAmount: amount, paymentMethodRaw: input.method,
      transferAccount: input.method === "TRANSFER" ? input.bank : null, reference: input.reference || null,
      note: input.note || null, createdByUserId: context.actorId, updatedByUserId: context.actorId,
    } });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: payment.paymentDate, direction: "IN",
      channel: input.method === "CASH" ? "CASH" : "BANK", movementType: "PICKUP_PAYMENT",
      amount, description: "Koreksi pembayaran pickup", reference: calculated.master.waybillNo,
      sourceType: "PickupPayment", sourceId: payment.id, requestKey: payment.id,
    });
    await tx.auditLog.create({ data: {
      ...context, action: "UPDATE", entityType: "PICKUP_PAYMENT_UPDATED", entityId: payment.id,
      metadata: { requestKey: input.requestKey, supersedesPaymentId: old.id, amount: amount.toString() },
    } });
    return payment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidPickupPayment(context: Context, id: string, input: { requestKey: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.pickupPayment.findFirst({ where: { id, ...prismaScope(context) } });
    if (!payment) return null;
    if (payment.recordStatus === "VOID") return payment;
    const voided = await tx.pickupPayment.update({ where: { id }, data: {
      recordStatus: "VOID", voidedAt: new Date(), voidedByUserId: context.actorId,
      voidReason: input.reason, updatedByUserId: context.actorId,
    } });
    await voidAutomaticCashMovements(tx, context, "PickupPayment", id);
    await tx.auditLog.create({ data: {
      ...context, action: "DELETE", entityType: "PICKUP_PAYMENT_VOIDED", entityId: id,
      metadata: { requestKey: input.requestKey, reason: input.reason },
    } });
    return voided;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
