import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type SyncRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAutomaticCashMovement, voidAutomaticCashMovements } from "@/modules/payment/cash-flow.service";
import { fetchDeliverySource, DeliverySourceError } from "./delivery-settlement.client";
import { codRecordSchema, dispatchRecordSchema } from "./delivery-settlement.validation";

type Scope = { tenantId: string; outletId: string };
type Context = Scope & { actorId: string };
type SourceFetcher = typeof fetchDeliverySource;

const zero = () => new Prisma.Decimal(0);
const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(String(value));

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sourceHash(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function normalizeComparison(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");
}

function sourceKey(prefix: "dispatch" | "cod", parts: Array<string | number | null | undefined>) {
  return `v1:${prefix}:${parts.map((part) => String(part ?? "").trim()).join(":")}`;
}

function parseSourceDate(value: string) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(" ", "T");
  const result = new Date(`${normalized}${/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? "" : "+07:00"}`);
  return Number.isNaN(result.valueOf()) ? null : result;
}

type Aggregate = {
  courierKey: string;
  courierName: string;
  dfod: Prisma.Decimal;
  codCash: Prisma.Decimal;
  codQris: Prisma.Decimal;
};

export function aggregateDeliveryRecords(
  dispatches: Array<{ courierNameRaw: string | null; deliveryStatusRaw: string | null; freightAmount: Prisma.Decimal }>,
  cods: Array<{ courierNameRaw: string | null; repaymentTypeCode: number | null; repaymentTypeLabel: string | null; codAmount: Prisma.Decimal }>,
) {
  const aggregates = new Map<string, Aggregate>();
  let anomaly = 0;
  const get = (name: string | null) => {
    const courierKey = normalizeComparison(name);
    if (!courierKey) return null;
    const existing = aggregates.get(courierKey);
    if (existing) return existing;
    const created = { courierKey, courierName: name!.trim().replace(/\s+/g, " "), dfod: zero(), codCash: zero(), codQris: zero() };
    aggregates.set(courierKey, created);
    return created;
  };

  for (const row of dispatches) {
    if (normalizeComparison(row.deliveryStatusRaw) !== "PENERIMAAN NORMAL") continue;
    const target = get(row.courierNameRaw);
    if (!target) anomaly += 1;
    else target.dfod = target.dfod.plus(row.freightAmount);
  }
  for (const row of cods) {
    const target = get(row.courierNameRaw);
    if (!target) {
      anomaly += 1;
      continue;
    }
    const label = normalizeComparison(row.repaymentTypeLabel);
    if (row.repaymentTypeCode === 2 || label === "QRIS COD") target.codQris = target.codQris.plus(row.codAmount);
    else if (row.repaymentTypeCode === 0 || row.repaymentTypeCode === 1 || (row.repaymentTypeCode === null && label && label !== "QRIS COD")) {
      target.codCash = target.codCash.plus(row.codAmount);
    } else anomaly += 1;
  }
  return { rows: [...aggregates.values()], anomaly };
}

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function syncDeliverySettlement(
  context: Context,
  options: { operationalDate?: string; fetchSource?: SourceFetcher } = {},
) {
  const operationalDate = options.operationalDate ?? todayJakarta();
  const date = new Date(`${operationalDate}T00:00:00.000Z`);
  const startedAt = new Date();
  const run = await prisma.syncRun.create({ data: {
    tenantId: context.tenantId, outletId: context.outletId, runType: "FULL",
    operationalDate: date, status: "RUNNING", startedAt, triggeredByUserId: context.actorId,
  } });
  await prisma.auditLog.create({ data: {
    tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
    action: "CREATE", entityType: "DELIVERY_SETTLEMENT_SYNC_STARTED", entityId: run.id,
    metadata: { operationalDate },
  } });

  try {
    const fetchSource = options.fetchSource ?? fetchDeliverySource;
    // Both reads must finish successfully before the first financial write.
    const [dispatchEnvelope, codEnvelope] = await Promise.all([
      fetchSource("/jfs-dispatch", operationalDate),
      fetchSource("/jfs-cod", operationalDate),
    ]);
    let dispatchCreated = 0, dispatchUpdated = 0, codCreated = 0, codUpdated = 0, duplicate = 0, anomaly = 0;

    await prisma.$transaction(async (tx) => {
      for (const rawValue of dispatchEnvelope.data) {
        const parsed = dispatchRecordSchema.safeParse(rawValue);
        if (!parsed.success) { anomaly += 1; continue; }
        const record = parsed.data;
        const key = sourceKey("dispatch", [record.waybillNo, record.waktu]);
        const hash = sourceHash(record);
        const existing = await tx.rawDispatch.findUnique({ where: { tenantId_outletId_sourceRecordKey: {
          tenantId: context.tenantId, outletId: context.outletId, sourceRecordKey: key,
        } } });
        const common = {
          operationalDate: date, sourceEndpoint: "/jfs-dispatch", sourceFetchedAt: startedAt,
          syncedAt: new Date(), syncStatus: "NORMALIZED" as const, syncError: null,
          sourceRecordHash: hash, sourcePayload: record as unknown as Prisma.InputJsonValue,
          lastSeenRunId: run.id, waybillNo: record.waybillNo, courierNameRaw: record.kurir || null,
          freightAmount: decimal(record.ongkir), dispatchTimeRaw: record.waktu || null,
          dispatchAt: parseSourceDate(record.waktu), receiverName: record.receiver || null,
          receiverAddress: record.address || null, deliveryStatusRaw: record.status || null,
          chargeWeight: decimal(record.berat), settlementTypeRaw: record.pembayaran || null,
          serviceRaw: record.service || null, codStatusRaw: record.codStatus || null,
          codValue: decimal(record.codValue), goodsDescription: record.barang || null,
        };
        if (!existing) {
          await tx.rawDispatch.create({ data: { tenantId: context.tenantId, outletId: context.outletId, sourceRecordKey: key, firstSeenRunId: run.id, ...common } });
          dispatchCreated += 1;
        } else if (existing.sourceRecordHash === hash) {
          await tx.rawDispatch.update({ where: { id: existing.id }, data: { sourceFetchedAt: startedAt, syncedAt: new Date(), lastSeenRunId: run.id } });
          duplicate += 1;
        } else {
          await tx.rawDispatch.update({ where: { id: existing.id }, data: common });
          dispatchUpdated += 1;
        }
      }

      for (const rawValue of codEnvelope.data) {
        const parsed = codRecordSchema.safeParse(rawValue);
        if (!parsed.success) { anomaly += 1; continue; }
        const record = parsed.data;
        const typeCode = record.repaymentTypeCode ?? (typeof record.repaymentType === "number" ? record.repaymentType : null);
        const typeLabel = record.repaymentTypeLabel ?? (typeof record.repaymentType === "string" ? record.repaymentType : null);
        const key = sourceKey("cod", [record.waybillNo, typeCode, record.signTime]);
        const hash = sourceHash(record);
        const existing = await tx.rawCod.findUnique({ where: { tenantId_outletId_sourceRecordKey: {
          tenantId: context.tenantId, outletId: context.outletId, sourceRecordKey: key,
        } } });
        const common = {
          operationalDate: date, sourceEndpoint: "/jfs-cod", sourceFetchedAt: startedAt,
          syncedAt: new Date(), syncStatus: "NORMALIZED" as const, syncError: null,
          sourceRecordHash: hash, sourcePayload: record as unknown as Prisma.InputJsonValue,
          lastSeenRunId: run.id, waybillNo: record.waybillNo, codAmount: decimal(record.codAmount),
          repaymentStatusRaw: record.repaymentStatus as Prisma.InputJsonValue,
          repaymentStatusCode: typeof record.repaymentStatus === "number" ? record.repaymentStatus : null,
          repaymentTypeRaw: record.repaymentType as Prisma.InputJsonValue,
          repaymentTypeCode: typeCode, repaymentTypeLabel: typeLabel,
          signTimeRaw: record.signTime || null, signedAt: parseSourceDate(record.signTime),
          courierNameRaw: record.dispatchStaffName || null,
        };
        if (!existing) {
          await tx.rawCod.create({ data: { tenantId: context.tenantId, outletId: context.outletId, sourceRecordKey: key, firstSeenRunId: run.id, ...common } });
          codCreated += 1;
        } else if (existing.sourceRecordHash === hash) {
          await tx.rawCod.update({ where: { id: existing.id }, data: { sourceFetchedAt: startedAt, syncedAt: new Date(), lastSeenRunId: run.id } });
          duplicate += 1;
        } else {
          await tx.rawCod.update({ where: { id: existing.id }, data: common });
          codUpdated += 1;
        }
      }

      const [dispatches, cods] = await Promise.all([
        tx.rawDispatch.findMany({ where: { tenantId: context.tenantId, outletId: context.outletId, operationalDate: date, syncStatus: "NORMALIZED" } }),
        tx.rawCod.findMany({ where: { tenantId: context.tenantId, outletId: context.outletId, operationalDate: date, syncStatus: "NORMALIZED" } }),
      ]);
      const aggregate = aggregateDeliveryRecords(dispatches, cods);
      anomaly += aggregate.anomaly;
      for (const candidate of aggregate.rows) {
        const total = candidate.dfod.plus(candidate.codCash);
        const where = { tenantId_outletId_operationalDate_courierKey: {
          tenantId: context.tenantId, outletId: context.outletId, operationalDate: date, courierKey: candidate.courierKey,
        } };
        const existing = await tx.masterSetoran.findUnique({ where });
        if (!existing) {
          await tx.masterSetoran.create({ data: {
            tenantId: context.tenantId, outletId: context.outletId, operationalDate: date,
            courierKey: candidate.courierKey, courierName: candidate.courierName,
            dfodAmount: candidate.dfod, codCashAmount: candidate.codCash, codQrisAmount: candidate.codQris,
            totalSettlementAmount: total, sourceFetchedFrom: startedAt, sourceFetchedTo: new Date(),
          } });
        } else if (total.lessThan(existing.totalSettlementAmount)) {
          await tx.masterSetoran.update({ where: { id: existing.id }, data: {
            previousObligationAmount: existing.totalSettlementAmount, proposedDfodAmount: candidate.dfod,
            proposedCodCashAmount: candidate.codCash, proposedCodQrisAmount: candidate.codQris,
            proposedObligationAmount: total, needsReview: true, reviewDecision: null,
            reviewedAt: null, reviewedByUserId: null, sourceFetchedTo: new Date(),
          } });
          await tx.auditLog.create({ data: {
            tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
            action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_OBLIGATION_DECREASE_REVIEW_REQUIRED",
            entityId: existing.id, metadata: { previous: existing.totalSettlementAmount.toString(), proposed: total.toString(), delta: total.minus(existing.totalSettlementAmount).toString() },
          } });
        } else {
          await tx.masterSetoran.update({ where: { id: existing.id }, data: {
            courierName: candidate.courierName, dfodAmount: candidate.dfod, codCashAmount: candidate.codCash,
            codQrisAmount: candidate.codQris, totalSettlementAmount: total,
            previousObligationAmount: existing.totalSettlementAmount, needsReview: false,
            proposedDfodAmount: null, proposedCodCashAmount: null, proposedCodQrisAmount: null,
            proposedObligationAmount: null, obligationVersion: total.equals(existing.totalSettlementAmount) ? existing.obligationVersion : { increment: 1 },
            sourceFetchedTo: new Date(),
          } });
          if (total.greaterThan(existing.totalSettlementAmount)) await tx.auditLog.create({ data: {
            tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
            action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_OBLIGATION_INCREASED",
            entityId: existing.id, metadata: { previous: existing.totalSettlementAmount.toString(), current: total.toString(), delta: total.minus(existing.totalSettlementAmount).toString() },
          } });
        }
      }
    });

    const completedAt = new Date();
    const status: SyncRunStatus = anomaly ? "PARTIAL_SUCCESS" : "SUCCESS";
    await prisma.syncRun.update({ where: { id: run.id }, data: {
      status, completedAt, dispatchFetchedCount: dispatchEnvelope.total, dispatchCreatedCount: dispatchCreated,
      dispatchUpdatedCount: dispatchUpdated, codFetchedCount: codEnvelope.total, codCreatedCount: codCreated,
      codUpdatedCount: codUpdated, duplicateCount: duplicate, anomalyCount: anomaly,
    } });
    await prisma.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
      action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_SYNC_COMPLETED", entityId: run.id,
      metadata: { status, dispatchFetched: dispatchEnvelope.total, codFetched: codEnvelope.total, duplicate, anomaly },
    } });
    return { runId: run.id, status, startedAt, completedAt, dispatch: { fetched: dispatchEnvelope.total, created: dispatchCreated, updated: dispatchUpdated }, cod: { fetched: codEnvelope.total, created: codCreated, updated: codUpdated }, duplicate, anomaly };
  } catch (error) {
    const completedAt = new Date();
    await prisma.syncRun.update({ where: { id: run.id }, data: {
      status: "FAILED", completedAt, errorMessage: "Sinkronisasi Delivery Settlement gagal.",
    } });
    await prisma.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
      action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_SYNC_FAILED", entityId: run.id,
      metadata: { errorCode: error instanceof DeliverySourceError ? "UPSTREAM_ERROR" : "INTERNAL_ERROR" },
    } });
    throw new DeliverySourceError();
  }
}

type FinancialSource = {
  totalSettlementAmount: Prisma.Decimal;
  payments: Array<{ cashAmount: Prisma.Decimal; transfers: Array<{ amount: Prisma.Decimal }> }>;
};

export function calculateDeliveryFinancials(source: FinancialSource) {
  const cashPaidAmount = source.payments.reduce((sum, item) => sum.plus(item.cashAmount), zero());
  const transferPaidAmount = source.payments.reduce(
    (sum, item) => sum.plus(item.transfers.reduce(
      (transferSum, transfer) => transferSum.plus(transfer.amount),
      zero(),
    )),
    zero(),
  );
  const totalReceived = cashPaidAmount.plus(transferPaidAmount);
  const remainingAmount = source.totalSettlementAmount.minus(totalReceived);
  return {
    cashPaidAmount, transferPaidAmount, totalReceived, remainingAmount,
    overpaidAmount: remainingAmount.isNegative() ? remainingAmount.abs() : zero(),
    paymentStatus: remainingAmount.greaterThan(0) ? "UNCLEARED" : remainingAmount.isZero() ? "CLEAR" : "OVERPAID",
    paymentMethodSummary: totalReceived.isZero() ? "UNPAID" : cashPaidAmount.greaterThan(0) && transferPaidAmount.greaterThan(0) ? "CASH_TRANSFER" : cashPaidAmount.greaterThan(0) ? "CASH" : "TRANSFER",
  } as const;
}

const paymentInclude = {
  payments: {
    where: { recordStatus: "VALID" as const },
    orderBy: [{ paymentDate: "desc" as const }, { revision: "desc" as const }],
    include: { transfers: { where: { recordStatus: "VALID" as const }, orderBy: { sequence: "asc" as const } } },
  },
};

function mapMaster(row: Prisma.MasterSetoranGetPayload<{ include: typeof paymentInclude }>) {
  const financial = calculateDeliveryFinancials(row);
  return {
    id: row.id, updatedAt: row.updatedAt, operationalDate: row.operationalDate,
    courierName: row.courierName, dfodAmount: row.dfodAmount.toString(),
    codCashAmount: row.codCashAmount.toString(), codQrisAmount: row.codQrisAmount.toString(),
    totalSettlement: row.totalSettlementAmount.toString(),
    cashPaidAmount: financial.cashPaidAmount.toString(), transferPaidAmount: financial.transferPaidAmount.toString(),
    totalReceived: financial.totalReceived.toString(), remainingAmount: financial.remainingAmount.toString(),
    outstandingAmount: financial.remainingAmount.isPositive() ? financial.remainingAmount.toString() : "0",
    overpaidAmount: financial.overpaidAmount.toString(), paymentStatus: financial.paymentStatus,
    paymentMethodSummary: financial.paymentMethodSummary, needsReview: row.needsReview,
    note: row.payments[0]?.note ?? null,
    transfers: row.payments.flatMap((payment) => payment.transfers.map((transfer) => ({ sequence: transfer.sequence, amount: transfer.amount.toString() }))),
  };
}

export async function listDeliverySettlements(input: Scope & {
  page: number; pageSize: number; operationalDate?: string; search?: string;
  paymentStatus?: string; paymentMethod?: string;
}) {
  const candidates = await prisma.masterSetoran.findMany({
    where: {
      tenantId: input.tenantId, outletId: input.outletId,
      ...(input.operationalDate ? { operationalDate: new Date(`${input.operationalDate}T00:00:00.000Z`) } : {}),
      ...(input.search ? { courierName: { contains: input.search, mode: "insensitive" } } : {}),
    },
    include: paymentInclude, orderBy: [{ operationalDate: "desc" }, { courierName: "asc" }, { id: "desc" }],
  });
  const filtered = candidates.map(mapMaster)
    .filter((row) => !input.paymentStatus || row.paymentStatus === input.paymentStatus)
    .filter((row) => !input.paymentMethod || row.paymentMethodSummary === input.paymentMethod);
  const summary = filtered.reduce((sum, row) => {
    sum.totalSettlement = sum.totalSettlement.plus(row.totalSettlement);
    sum.totalCashReceived = sum.totalCashReceived.plus(row.cashPaidAmount);
    sum.totalTransferReceived = sum.totalTransferReceived.plus(row.transferPaidAmount);
    sum.totalOutstanding = sum.totalOutstanding.plus(row.outstandingAmount);
    sum.totalCodQris = sum.totalCodQris.plus(row.codQrisAmount);
    if (row.paymentStatus === "CLEAR") sum.clearCount += 1;
    else if (row.paymentStatus === "UNCLEARED") sum.unclearedCount += 1;
    else sum.overpaidCount += 1;
    return sum;
  }, { totalSettlement: zero(), totalCashReceived: zero(), totalTransferReceived: zero(), totalOutstanding: zero(), totalCodQris: zero(), clearCount: 0, unclearedCount: 0, overpaidCount: 0 });
  const start = (input.page - 1) * input.pageSize;
  return {
    data: filtered.slice(start, start + input.pageSize),
    pagination: { page: input.page, pageSize: input.pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / input.pageSize) },
    summary: {
      totalSettlement: summary.totalSettlement.toString(), totalCashReceived: summary.totalCashReceived.toString(),
      totalTransferReceived: summary.totalTransferReceived.toString(), totalOutstanding: summary.totalOutstanding.toString(),
      totalCodQris: summary.totalCodQris.toString(), courierCount: filtered.length,
      clearCount: summary.clearCount, unclearedCount: summary.unclearedCount, overpaidCount: summary.overpaidCount,
    },
  };
}

export async function getDeliverySettlement(scope: Scope, id: string) {
  const row = await prisma.masterSetoran.findFirst({ where: { id, ...scope }, include: paymentInclude });
  return row ? mapMaster(row) : null;
}

export async function adjustDeliverySettlement(
  context: Context,
  id: string,
  input: { requestKey: string; status?: "BELUM_BAYAR" | "SUDAH_BAYAR"; cashAmount: string | number; transfers: Array<{ sequence: number; amount: string | number }>; note?: string | null },
) {
  try {
    return await prisma.$transaction(async (tx) => {
    const duplicate = await tx.courierSettlementPayment.findUnique({ where: { transactionKey_revision: { transactionKey: input.requestKey, revision: 1 } } });
    if (duplicate) {
      const row = await tx.masterSetoran.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId }, include: paymentInclude });
      return row ? mapMaster(row) : null;
    }
    const master = await tx.masterSetoran.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId }, include: paymentInclude });
    if (!master) return null;
    const cancelPayment = input.status === "BELUM_BAYAR";
    if (cancelPayment && master.payments.length > 0 && !input.note?.trim()) {
      throw new Error("CANCELLATION_REASON_REQUIRED");
    }
    const cash = decimal(input.cashAmount);
    const transfers = input.transfers.filter((item) => decimal(item.amount).greaterThan(0));
    if (cash.isNegative() || transfers.some((item) => decimal(item.amount).isNegative())) throw new Error("INVALID_AMOUNT");
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
      action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_ADJUSTMENT_STARTED", entityId: id,
      metadata: { requestKey: input.requestKey },
    } });
    for (const old of master.payments) {
      await voidAutomaticCashMovements(tx, context, "CourierSettlementPayment", old.id);
      await tx.courierSettlementTransfer.updateMany({ where: { settlementPaymentId: old.id, recordStatus: "VALID" }, data: { recordStatus: "SUPERSEDED" } });
      await tx.courierSettlementPayment.update({ where: { id: old.id }, data: { recordStatus: "SUPERSEDED", updatedByUserId: context.actorId } });
    }
    if (cancelPayment) {
      await tx.auditLog.create({ data: {
        tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
        action: "UPDATE", entityType: "DELIVERY_PAYMENT_CANCELLED", entityId: id,
        metadata: {
          requestKey: input.requestKey,
          statusBefore: master.payments.length > 0 ? "SUDAH_BAYAR" : "BELUM_BAYAR",
          statusAfter: "BELUM_BAYAR",
          paymentIds: master.payments.map((payment) => payment.id),
          previousPaidAmount: master.payments.reduce((sum, payment) => sum.plus(payment.paidAmountSnapshot), zero()).toString(),
          previousTransferIds: master.payments.flatMap((payment) => payment.transfers.map((transfer) => transfer.id)),
          reason: input.note!.trim(),
        },
      } });
      const row = await tx.masterSetoran.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId }, include: paymentInclude });
      return row ? mapMaster(row) : null;
    }
    const transferTotal = transfers.reduce((sum, item) => sum.plus(item.amount), zero());
    const paid = cash.plus(transferTotal);
    const payment = await tx.courierSettlementPayment.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, masterSetoranId: id,
      transactionKey: input.requestKey, revision: 1, paymentDate: master.operationalDate,
      cashAmount: cash, transferAmountSnapshot: transferTotal, paidAmountSnapshot: paid,
      supersedesPaymentId: master.payments[0]?.id ?? null,
      note: input.note || null, createdByUserId: context.actorId, updatedByUserId: context.actorId,
    } });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: payment.paymentDate, direction: "IN", channel: "CASH",
      movementType: "DELIVERY_PAYMENT", amount: cash, description: "Pembayaran delivery tunai",
      reference: master.courierName, sourceType: "CourierSettlementPayment",
      sourceId: payment.id, requestKey: payment.id,
    });
    await createAutomaticCashMovement(tx, {
      ...context, businessDate: payment.paymentDate, direction: "IN", channel: "BANK",
      movementType: "DELIVERY_PAYMENT", amount: transferTotal, description: "Pembayaran delivery transfer",
      reference: master.courierName, sourceType: "CourierSettlementPayment",
      sourceId: payment.id, requestKey: payment.id,
    });
    for (const item of transfers) await tx.courierSettlementTransfer.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, settlementPaymentId: payment.id,
      transactionKey: randomUUID(), sequence: item.sequence, revision: 1,
      supersedesTransferId: master.payments.flatMap((old) => old.transfers).find((old) => old.sequence === item.sequence)?.id ?? null,
      amount: decimal(item.amount), createdByUserId: context.actorId, updatedByUserId: context.actorId,
    } });
    const remaining = master.totalSettlementAmount.minus(paid);
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
      action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_ADJUSTMENT_COMPLETED", entityId: id,
      metadata: { requestKey: input.requestKey, cashAmount: cash.toString(), transferTotal: transferTotal.toString(), remainingAmount: remaining.toString(), paymentStatus: remaining.greaterThan(0) ? "UNCLEARED" : remaining.isZero() ? "CLEAR" : "OVERPAID" },
    } });
    const row = await tx.masterSetoran.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId }, include: paymentInclude });
    return row ? mapMaster(row) : null;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
  } catch (error) {
    await prisma.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId, actorId: context.actorId,
      action: "UPDATE", entityType: "DELIVERY_SETTLEMENT_ADJUSTMENT_FAILED", entityId: id,
      metadata: { requestKey: input.requestKey, errorCode: "TRANSACTION_ROLLED_BACK" },
    } });
    throw error;
  }
}

export function getLatestDeliveryRun(scope: Scope) {
  return prisma.syncRun.findFirst({ where: { ...scope, runType: "FULL" }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
}

export function getDeliveryRun(scope: Scope, runId: string) {
  return prisma.syncRun.findFirst({ where: { ...scope, id: runId, runType: "FULL" } });
}
