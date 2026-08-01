import { Prisma, PrismaClient } from "@prisma/client";
import {
  canonicalCodWaybill,
  classifyCodSettlement,
  selectLatestCodRecords,
} from "../src/modules/delivery-settlement/cod-deduplication";

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const required = ["tenantId", "outletId", "date"] as const;
if (required.some((key) => !args[key])) {
  throw new Error("Usage: --tenantId=... --outletId=... --date=YYYY-MM-DD [--courier=...] [--waybill=...]");
}

const prisma = new PrismaClient();
const normalized = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");
const date = new Date(`${args.date}T00:00:00.000Z`);

try {
  const [rows, dispatches, pickups, settlements] = await Promise.all([
    prisma.rawCod.findMany({ where: {
      tenantId: args.tenantId,
      outletId: args.outletId,
      operationalDate: date,
      syncStatus: "NORMALIZED",
      ...(args.courier
        ? { courierNameRaw: { contains: args.courier, mode: "insensitive" } }
        : {}),
      ...(args.waybill
        ? { waybillNo: { contains: args.waybill, mode: "insensitive" } }
        : {}),
    }, orderBy: [{ sourceFetchedAt: "desc" }, { updatedAt: "desc" }] }),
    prisma.rawDispatch.findMany({ where: {
      tenantId: args.tenantId,
      outletId: args.outletId,
      operationalDate: date,
      syncStatus: "NORMALIZED",
      isActive: true,
      ...(args.courier
        ? { courierNameRaw: { contains: args.courier, mode: "insensitive" } }
        : {}),
      ...(args.waybill
        ? { waybillNo: { contains: args.waybill, mode: "insensitive" } }
        : {}),
    } }),
    prisma.masterPickup.findMany({
      where: {
        tenantId: args.tenantId,
        outletId: args.outletId,
        operationalDate: date,
        ...(args.courier
          ? { staffName: { contains: args.courier, mode: "insensitive" } }
          : {}),
        ...(args.waybill
          ? { waybillNo: { contains: args.waybill, mode: "insensitive" } }
          : {}),
      },
      select: {
        freightAmount: true,
        rawPickup: { select: { settlementRaw: true } },
      },
    }),
    prisma.masterSetoran.findMany({
      where: {
        tenantId: args.tenantId, outletId: args.outletId, operationalDate: date,
        ...(args.courier
          ? { courierName: { contains: args.courier, mode: "insensitive" } }
          : {}),
      },
      include: {
        payments: {
          where: { recordStatus: "VALID" },
          include: { transfers: { where: { recordStatus: "VALID" } } },
        },
      },
    }),
  ]);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = canonicalCodWaybill(row.waybillNo);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const finalRows = selectLatestCodRecords(rows);
  const total = (items: typeof rows) => items.reduce(
    (sum, row) => sum.plus(row.codAmount),
    new Prisma.Decimal(0),
  );
  const category = (row: typeof rows[number]) => classifyCodSettlement(row);
  const duplicates = [...groups.entries()].filter(([, versions]) => versions.length > 1);
  const payment = settlements.reduce((result, settlement) => {
    result.obligation = result.obligation.plus(settlement.totalSettlementAmount);
    for (const item of settlement.payments) {
      result.cash = result.cash.plus(item.cashAmount);
      for (const transfer of item.transfers) {
        result.transfer = result.transfer.plus(transfer.amount);
      }
    }
    return result;
  }, { obligation: new Prisma.Decimal(0), cash: new Prisma.Decimal(0), transfer: new Prisma.Decimal(0) });
  const received = payment.cash.plus(payment.transfer);
  const dfodTotal = dispatches.reduce(
    (sum, row) => normalized(row.deliveryStatusRaw) === "PENERIMAAN NORMAL"
      ? sum.plus(row.freightAmount)
      : sum,
    new Prisma.Decimal(0),
  );
  const codQrisTotal = total(finalRows.filter((row) => category(row) === "COD_QRIS"));
  const codTotal = total(finalRows.filter((row) => category(row) === "COD_CASH"));
  const pickupCashTotal = pickups.reduce(
    (sum, row) => normalized(row.rawPickup.settlementRaw) === "TUNAI"
      ? sum.plus(row.freightAmount)
      : sum,
    new Prisma.Decimal(0),
  );
  const finalObligation = pickupCashTotal.plus(dfodTotal).plus(codTotal);
  console.log(JSON.stringify({
    dryRun: true,
    date: args.date,
    rawCount: rows.length,
    uniqueCount: finalRows.length,
    duplicateWaybillCount: duplicates.length,
    extraDuplicateRows: rows.length - finalRows.length,
    rawObligationTotal: total(rows).toString(),
    uniqueSourceTotal: total(finalRows).toString(),
    codTotal: codTotal.toString(),
    qrisTotal: codQrisTotal.toString(),
    codCashTotal: codTotal.minus(codQrisTotal).toString(),
    pickupCashTotal: pickupCashTotal.toString(),
    dfodTotal: dfodTotal.toString(),
    finalObligationTotal: finalObligation.toString(),
    paymentTotal: payment.cash.toString(),
    transferTotal: payment.transfer.toString(),
    finalBalance: finalObligation.minus(received).toString(),
    joinMultiplicationDetected: false,
    joinAuditBasis: "COD, settlement, payment, and transfer are aggregated independently",
    duplicates: duplicates.map(([waybill, versions]) => ({
      waybill,
      versions: versions.map((row) => ({
        amount: row.codAmount.toString(),
        paymentMethod: row.repaymentTypeLabel ?? row.repaymentTypeCode,
        operationalDate: row.operationalDate.toISOString().slice(0, 10),
        sourceKey: row.sourceRecordKey,
        syncStatus: row.syncStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        fetchedAt: row.sourceFetchedAt,
      })),
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
