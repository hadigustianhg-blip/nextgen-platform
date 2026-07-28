import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPickupTransferAccounts } from "./transfer-accounts";

type SettlementContext = {
  tenantId: string;
  outletId: string;
  actorId: string;
  actorRoles?: string[];
};

type SettlementListInput = {
  tenantId: string;
  outletId: string;
  page: number;
  pageSize: number;
  search?: string;
  staff?: string;
  paymentStatus?: "" | "BELUM_BAYAR" | "SUDAH_BAYAR" | "LEBIH_BAYAR";
  paymentMethod?: "" | "TUNAI" | "TRANSFER";
};

type AdjustmentInput = {
  requestId: string;
  discountAmount: number | string;
  status: "BELUM_BAYAR" | "SUDAH_BAYAR";
  paymentMethod?: "TUNAI" | "TRANSFER" | null;
  transferAccountId?: string | null;
  note?: string | null;
};

type BulkAdjustmentInput = Omit<AdjustmentInput, "requestId"> & {
  batchRequestId: string;
  masterPickupIds: string[];
};

type PickupFinancialSource = {
  freightAmount: Prisma.Decimal;
  settlementRevisions: Array<{ discountAmount: Prisma.Decimal; reason?: string | null }>;
  payments: Array<{
    receivedAmount: Prisma.Decimal;
    paymentMethodRaw: string;
    transferAccount: string | null;
    note?: string | null;
  }>;
};

export function calculatePickupFinancials(source: PickupFinancialSource) {
  const discountAmount =
    source.settlementRevisions[0]?.discountAmount ?? new Prisma.Decimal(0);
  const finalObligation = source.freightAmount.minus(discountAmount);
  const totalPaid = source.payments.reduce(
    (total, payment) => total.plus(payment.receivedAmount),
    new Prisma.Decimal(0),
  );
  const remainingAmount = finalObligation.minus(totalPaid);
  const paymentStatus =
    remainingAmount.greaterThan(0)
      ? "BELUM_BAYAR"
      : remainingAmount.equals(0)
        ? "SUDAH_BAYAR"
        : "LEBIH_BAYAR";
  const methods = [...new Set(source.payments.map((payment) => payment.paymentMethodRaw))];
  const accounts = [...new Set(source.payments.map((payment) => payment.transferAccount).filter(Boolean))];
  return {
    discountAmount,
    finalObligation,
    totalPaid,
    remainingAmount,
    paymentStatus,
    paymentMethod: methods.length === 1 ? methods[0] : methods.length > 1 ? "MULTIPLE" : null,
    transferAccountId: accounts.length === 1 ? accounts[0] : null,
  };
}

function isCashSettlement(value: string | null) {
  return value?.trim().toLocaleLowerCase("id-ID") === "tunai";
}

function mapSettlementRow(row: {
  id: string;
  operationalDate: Date;
  waybillNo: string;
  staffName: string | null;
  senderName: string | null;
  freightAmount: Prisma.Decimal;
  syncStatus: string;
  updatedAt: Date;
  rawPickup: { settlementRaw: string | null };
  settlementRevisions: Array<{ discountAmount: Prisma.Decimal; reason: string | null }>;
  payments: Array<{ receivedAmount: Prisma.Decimal; paymentMethodRaw: string; transferAccount: string | null; note: string | null }>;
}) {
  const financial = calculatePickupFinancials(row);
  return {
    id: row.id,
    operationalDate: row.operationalDate,
    updatedAt: row.updatedAt,
    waybillNo: row.waybillNo,
    staff: row.staffName,
    sender: row.senderName,
    freightAmount: row.freightAmount.toString(),
    syncStatus: row.syncStatus,
    settlement: row.rawPickup.settlementRaw,
    discountAmount: financial.discountAmount.toString(),
    finalObligation: financial.finalObligation.toString(),
    totalPaid: financial.totalPaid.toString(),
    remainingAmount: financial.remainingAmount.toString(),
    paymentStatus: financial.paymentStatus,
    paymentMethod: financial.paymentMethod,
    transferAccountId: financial.transferAccountId,
    note: row.settlementRevisions[0]?.reason ?? row.payments[0]?.note ?? null,
  };
}

const financialInclude = {
  rawPickup: { select: { settlementRaw: true } },
  settlementRevisions: {
    where: { recordStatus: "VALID" as const },
    orderBy: { revision: "desc" as const },
    select: { discountAmount: true, reason: true },
  },
  payments: {
    where: { recordStatus: "VALID" as const },
    orderBy: [{ paymentDate: "desc" as const }, { revision: "desc" as const }],
    select: {
      receivedAmount: true,
      paymentMethodRaw: true,
      transferAccount: true,
      note: true,
    },
  },
};

export async function listPickupSettlements(input: SettlementListInput) {
  const candidates = await prisma.masterPickup.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      rawPickup: { settlementRaw: { not: null } },
      ...(input.search ? { waybillNo: { contains: input.search, mode: "insensitive" } } : {}),
      ...(input.staff ? { staffName: { contains: input.staff, mode: "insensitive" } } : {}),
    },
    include: financialInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  const filtered = candidates
    .filter((row) => isCashSettlement(row.rawPickup.settlementRaw))
    .map((source) => ({ source, row: mapSettlementRow(source) }))
    .filter(({ row }) => !input.paymentStatus || row.paymentStatus === input.paymentStatus)
    .filter(({ source }) =>
      !input.paymentMethod ||
      source.payments.some((payment) => {
        const method = payment.paymentMethodRaw.trim().toLocaleUpperCase("id-ID");
        return input.paymentMethod === "TUNAI"
          ? method === "TUNAI" || method === "CASH"
          : method === "TRANSFER";
      }),
    );
  const summary = filtered.reduce((result, { source, row }) => {
    result.nominalTotalPickup = result.nominalTotalPickup.plus(row.finalObligation);
    result.totalPickupCount += 1;
    if (row.paymentStatus === "BELUM_BAYAR") result.unpaidCount += 1;
    if (row.paymentStatus === "SUDAH_BAYAR") result.paidCount += 1;
    if (row.paymentStatus === "LEBIH_BAYAR") result.overpaidCount += 1;

    let hasCash = false;
    let hasTransfer = false;
    for (const payment of source.payments) {
      const method = payment.paymentMethodRaw.trim().toLocaleUpperCase("id-ID");
      if (method === "TUNAI" || method === "CASH") {
        result.totalCash = result.totalCash.plus(payment.receivedAmount);
        hasCash = true;
      }
      if (method === "TRANSFER") {
        result.totalTransfer = result.totalTransfer.plus(payment.receivedAmount);
        hasTransfer = true;
      }
    }
    if (hasCash) result.cashPickupCount += 1;
    if (hasTransfer) result.transferPickupCount += 1;
    return result;
  }, {
    nominalTotalPickup: new Prisma.Decimal(0),
    totalPickupCount: 0,
    unpaidCount: 0,
    paidCount: 0,
    overpaidCount: 0,
    totalCash: new Prisma.Decimal(0),
    cashPickupCount: 0,
    totalTransfer: new Prisma.Decimal(0),
    transferPickupCount: 0,
  });
  const start = (input.page - 1) * input.pageSize;
  return {
    rows: filtered.slice(start, start + input.pageSize).map(({ row }) => row),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / input.pageSize)),
    },
    summary: {
      ...summary,
      nominalTotalPickup: summary.nominalTotalPickup.toString(),
      totalCash: summary.totalCash.toString(),
      totalTransfer: summary.totalTransfer.toString(),
    },
  };
}

export async function getPickupSettlement(
  tenantId: string,
  outletId: string,
  masterPickupId: string,
) {
  const row = await prisma.masterPickup.findFirst({
    where: { id: masterPickupId, tenantId, outletId },
    include: financialInclude,
  });
  if (!row || !isCashSettlement(row.rawPickup.settlementRaw)) return null;
  return mapSettlementRow(row);
}

function auditData(
  context: SettlementContext,
  entityType: string,
  entityId: string,
  metadata: Prisma.InputJsonValue,
) {
  return {
    tenantId: context.tenantId,
    outletId: context.outletId,
    actorId: context.actorId,
    action: "UPDATE" as const,
    entityType,
    entityId,
    metadata,
  };
}

export async function adjustPickupSettlement(
  context: SettlementContext,
  masterPickupId: string,
  input: AdjustmentInput,
) {
  const configuredAccounts = getPickupTransferAccounts();
  const transferAccount =
    input.paymentMethod === "TRANSFER"
      ? configuredAccounts.find((account) => account.id === input.transferAccountId)
      : undefined;
  if (input.paymentMethod === "TRANSFER" && !transferAccount) {
    throw new Error("TRANSFER_ACCOUNT_REQUIRED");
  }

  try {
    await prisma.$transaction(async (tx) => {
    const previousRequest = await tx.pickupSettlementRevision.findUnique({
      where: {
        tenantId_outletId_requestKey: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          requestKey: input.requestId,
        },
      },
      select: { id: true },
    });
    if (previousRequest) return;

    const master = await tx.masterPickup.findFirst({
      where: { id: masterPickupId, tenantId: context.tenantId, outletId: context.outletId },
      include: {
        rawPickup: { select: { settlementRaw: true } },
        settlementRevisions: {
          where: { recordStatus: "VALID" },
          orderBy: { revision: "desc" },
        },
        payments: {
          where: { recordStatus: "VALID" },
          orderBy: [{ createdAt: "asc" }, { revision: "desc" }],
        },
      },
    });
    if (!master || !isCashSettlement(master.rawPickup.settlementRaw)) {
      throw new Error("PICKUP_NOT_FOUND");
    }

    const discountAmount = new Prisma.Decimal(String(input.discountAmount));
    if (discountAmount.isNegative() || discountAmount.greaterThan(master.freightAmount)) {
      throw new Error("INVALID_DISCOUNT");
    }
    const finalObligation = master.freightAmount.minus(discountAmount);
    const activeRevision = master.settlementRevisions[0];
    const latestRevision = await tx.pickupSettlementRevision.aggregate({
      where: { masterPickupId: master.id },
      _max: { revision: true },
    });
    if (activeRevision) {
      await tx.pickupSettlementRevision.update({
        where: { id: activeRevision.id },
        data: { recordStatus: "SUPERSEDED", updatedByUserId: context.actorId },
      });
    }
    const revision = await tx.pickupSettlementRevision.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        masterPickupId: master.id,
        requestKey: input.requestId,
        revision: (latestRevision._max.revision ?? 0) + 1,
        recordStatus: "VALID",
        supersedesRevisionId: activeRevision?.id,
        discountAmount,
        reason: input.note || null,
        createdByUserId: context.actorId,
        updatedByUserId: context.actorId,
      },
    });
    await tx.auditLog.create({
      data: auditData(context, "PICKUP_SETTLEMENT_REVISION_CREATED", revision.id, {
        masterPickupId: master.id,
        revision: revision.revision,
      }),
    });

    const activePayments = master.payments;
    if (input.status === "BELUM_BAYAR") {
      for (const payment of activePayments) {
        await tx.pickupPayment.update({
          where: { id: payment.id },
          data: {
            recordStatus: "VOID",
            voidedAt: new Date(),
            voidedByUserId: context.actorId,
            voidReason: "Pickup settlement adjusted to unpaid",
            updatedByUserId: context.actorId,
          },
        });
        await tx.auditLog.create({
          data: auditData(context, "PICKUP_PAYMENT_VOIDED", payment.id, {
            masterPickupId: master.id,
          }),
        });
      }
    } else {
      for (const payment of activePayments) {
        await tx.pickupPayment.update({
          where: { id: payment.id },
          data: { recordStatus: "SUPERSEDED", updatedByUserId: context.actorId },
        });
        await tx.auditLog.create({
          data: auditData(context, "PICKUP_PAYMENT_SUPERSEDED", payment.id, {
            masterPickupId: master.id,
          }),
        });
      }
      const previousPayment = activePayments[0];
      const payment = await tx.pickupPayment.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          masterPickupId: master.id,
          transactionKey: previousPayment?.transactionKey ?? input.requestId,
          revision: previousPayment ? previousPayment.revision + 1 : 1,
          recordStatus: "VALID",
          supersedesPaymentId: previousPayment?.id,
          paymentDate: master.operationalDate,
          receivedAmount: finalObligation,
          paymentMethodRaw: input.paymentMethod!,
          transferAccount: transferAccount?.id ?? null,
          note: input.note || null,
          createdByUserId: context.actorId,
          updatedByUserId: context.actorId,
        },
      });
      await tx.auditLog.create({
        data: auditData(context, "PICKUP_PAYMENT_CREATED", payment.id, {
          masterPickupId: master.id,
          method: input.paymentMethod!,
          accountId: transferAccount?.id ?? null,
        }),
      });
    }

    await tx.auditLog.create({
      data: auditData(context, "PICKUP_SETTLEMENT_ADJUSTED", master.id, {
        requestId: input.requestId,
        status: input.status,
        method: input.paymentMethod ?? null,
      }),
    });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingRequest = await prisma.pickupSettlementRevision.findUnique({
        where: {
          tenantId_outletId_requestKey: {
            tenantId: context.tenantId,
            outletId: context.outletId,
            requestKey: input.requestId,
          },
        },
        select: { id: true },
      });
      if (existingRequest) {
        return getPickupSettlement(context.tenantId, context.outletId, masterPickupId);
      }
    }
    throw error;
  }

  return getPickupSettlement(context.tenantId, context.outletId, masterPickupId);
}

function deriveBulkRequestKey(batchRequestId: string, masterPickupId: string) {
  const hex = createHash("sha256")
    .update(`${batchRequestId}:${masterPickupId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function bulkAdjustPickupSettlements(
  context: SettlementContext,
  input: BulkAdjustmentInput,
) {
  const masterPickupIds = [...new Set(input.masterPickupIds)];
  const requestKeys = masterPickupIds.map((id) =>
    deriveBulkRequestKey(input.batchRequestId, id),
  );
  const configuredAccounts = getPickupTransferAccounts();
  const transferAccount =
    input.paymentMethod === "TRANSFER"
      ? configuredAccounts.find((account) => account.id === input.transferAccountId)
      : undefined;
  if (input.paymentMethod === "TRANSFER" && !transferAccount) {
    throw new Error("TRANSFER_ACCOUNT_REQUIRED");
  }

  const bulkAudit = (
    entityType: string,
    metadata: Prisma.InputJsonValue,
  ) => prisma.auditLog.create({
    data: auditData(context, entityType, input.batchRequestId, metadata),
  });
  await bulkAudit("PICKUP_BULK_ADJUSTMENT_STARTED", {
    batchRequestId: input.batchRequestId,
    pickupCount: masterPickupIds.length,
    masterPickupIds,
    actorId: context.actorId,
    actorRoles: context.actorRoles ?? [],
    startedAt: new Date().toISOString(),
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingRequests = await tx.pickupSettlementRevision.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          requestKey: { in: requestKeys },
        },
        select: { requestKey: true },
      });
      if (existingRequests.length === masterPickupIds.length) {
        await tx.auditLog.create({
          data: auditData(
            context,
            "PICKUP_BULK_ADJUSTMENT_COMPLETED",
            input.batchRequestId,
            {
              batchRequestId: input.batchRequestId,
              pickupCount: masterPickupIds.length,
              totalNominal: "0",
              actorId: context.actorId,
              completedAt: new Date().toISOString(),
              idempotent: true,
            },
          ),
        });
        return {
          batchRequestId: input.batchRequestId,
          adjustedCount: masterPickupIds.length,
          idempotent: true,
          totalNominal: "0",
        };
      }
      if (existingRequests.length > 0) {
        throw new Error("BULK_IDEMPOTENCY_CONFLICT");
      }

      const masters = await tx.masterPickup.findMany({
        where: {
          id: { in: masterPickupIds },
          tenantId: context.tenantId,
          outletId: context.outletId,
        },
        include: {
          rawPickup: { select: { settlementRaw: true } },
          settlementRevisions: {
            where: { recordStatus: "VALID" },
            orderBy: { revision: "desc" },
          },
          payments: {
            where: { recordStatus: "VALID" },
            orderBy: [{ createdAt: "asc" }, { revision: "desc" }],
          },
        },
      });
      if (
        masters.length !== masterPickupIds.length ||
        masters.some((master) => !isCashSettlement(master.rawPickup.settlementRaw))
      ) {
        throw new Error("PICKUP_NOT_FOUND");
      }

      const discountAmount = new Prisma.Decimal(String(input.discountAmount));
      const invalidMaster = masters.find(
        (master) =>
          discountAmount.isNegative() ||
          discountAmount.greaterThan(master.freightAmount),
      );
      if (invalidMaster) {
        const error = new Error("INVALID_DISCOUNT");
        Object.assign(error, { waybillNo: invalidMaster.waybillNo });
        throw error;
      }

      const totalNominal = masters.reduce(
        (total, master) => total.plus(master.freightAmount.minus(discountAmount)),
        new Prisma.Decimal(0),
      );

      for (const master of masters) {
        const requestKey = deriveBulkRequestKey(input.batchRequestId, master.id);
        const activeRevision = master.settlementRevisions[0];
        const latestRevision = await tx.pickupSettlementRevision.aggregate({
          where: { masterPickupId: master.id },
          _max: { revision: true },
        });
        if (activeRevision) {
          await tx.pickupSettlementRevision.update({
            where: { id: activeRevision.id },
            data: {
              recordStatus: "SUPERSEDED",
              updatedByUserId: context.actorId,
            },
          });
        }
        const revision = await tx.pickupSettlementRevision.create({
          data: {
            tenantId: context.tenantId,
            outletId: context.outletId,
            masterPickupId: master.id,
            requestKey,
            revision: (latestRevision._max.revision ?? 0) + 1,
            recordStatus: "VALID",
            supersedesRevisionId: activeRevision?.id,
            discountAmount,
            reason: input.note || null,
            createdByUserId: context.actorId,
            updatedByUserId: context.actorId,
          },
        });
        await tx.auditLog.create({
          data: auditData(
            context,
            "PICKUP_SETTLEMENT_REVISION_CREATED",
            revision.id,
            { masterPickupId: master.id, revision: revision.revision },
          ),
        });

        if (input.status === "BELUM_BAYAR") {
          for (const payment of master.payments) {
            await tx.pickupPayment.update({
              where: { id: payment.id },
              data: {
                recordStatus: "VOID",
                voidedAt: new Date(),
                voidedByUserId: context.actorId,
                voidReason: "Pickup bulk settlement adjusted to unpaid",
                updatedByUserId: context.actorId,
              },
            });
            await tx.auditLog.create({
              data: auditData(context, "PICKUP_PAYMENT_VOIDED", payment.id, {
                masterPickupId: master.id,
              }),
            });
          }
        } else {
          for (const payment of master.payments) {
            await tx.pickupPayment.update({
              where: { id: payment.id },
              data: {
                recordStatus: "SUPERSEDED",
                updatedByUserId: context.actorId,
              },
            });
          }
          const previousPayment = master.payments[0];
          const payment = await tx.pickupPayment.create({
            data: {
              tenantId: context.tenantId,
              outletId: context.outletId,
              masterPickupId: master.id,
              transactionKey: previousPayment?.transactionKey ?? requestKey,
              revision: previousPayment ? previousPayment.revision + 1 : 1,
              recordStatus: "VALID",
              supersedesPaymentId: previousPayment?.id,
              paymentDate: master.operationalDate,
              receivedAmount: master.freightAmount.minus(discountAmount),
              paymentMethodRaw: input.paymentMethod!,
              transferAccount: transferAccount?.id ?? null,
              note: input.note || null,
              createdByUserId: context.actorId,
              updatedByUserId: context.actorId,
            },
          });
          await tx.auditLog.create({
            data: auditData(context, "PICKUP_PAYMENT_CREATED", payment.id, {
              masterPickupId: master.id,
              method: input.paymentMethod!,
              accountId: transferAccount?.id ?? null,
            }),
          });
        }

        await tx.auditLog.create({
          data: auditData(context, "PICKUP_SETTLEMENT_ADJUSTED", master.id, {
            batchRequestId: input.batchRequestId,
            requestKey,
            status: input.status,
            method: input.paymentMethod ?? null,
          }),
        });
      }

      await tx.auditLog.create({
        data: auditData(
          context,
          "PICKUP_BULK_ADJUSTMENT_COMPLETED",
          input.batchRequestId,
          {
            batchRequestId: input.batchRequestId,
            pickupCount: masterPickupIds.length,
            totalNominal: totalNominal.toString(),
            actorId: context.actorId,
            completedAt: new Date().toISOString(),
            idempotent: false,
          },
        ),
      });
      return {
        batchRequestId: input.batchRequestId,
        adjustedCount: masterPickupIds.length,
        idempotent: false,
        totalNominal: totalNominal.toString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return result;
  } catch (error) {
    await bulkAudit("PICKUP_BULK_ADJUSTMENT_FAILED", {
      batchRequestId: input.batchRequestId,
      pickupCount: masterPickupIds.length,
      actorId: context.actorId,
      failedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : "UNKNOWN",
    });
    throw error;
  }
}
