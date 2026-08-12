import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { getActiveDispatchDataset } from "@/modules/delivery-settlement/active-dispatch-dataset";
import {
  DELIVERY_TARGET,
  selectFinalDeliveryRecords,
} from "./monitoring-daily.calculation";
import {
  aggregateDeliveryMonitoringMetrics,
  aggregatePickupMonitoringMetrics,
  summarizeMonitoringMetrics,
} from "./monitoring-metrics";
import { getEffectiveOperationalTargets } from "@/modules/settings/target-kpi.service";

const canonical = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getMonitoringDaily(input: {
  tenantId: string;
  outletId: string;
  businessDate?: string;
  deliveryPage: number;
  pickupPage: number;
  pageSize: number;
}) {
  const businessDate = input.businessDate || jakartaOperationalDate();
  const operationalDate = new Date(`${businessDate}T00:00:00.000Z`);
  const whereScope = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    operationalDate,
    syncStatus: "NORMALIZED" as const,
  };

  const [
    deliveryRecords,
    pickupRecords,
    targets,
  ] = await Promise.all([
    getActiveDispatchDataset({
      tenantId: input.tenantId,
      outletId: input.outletId,
      operationalDate,
    }),
    prisma.rawPickup.findMany({
      where: whereScope,
      select: {
        id: true, operationalDate: true, waybillNo: true, staffNameRaw: true,
        settlementRaw: true, freight: true, weight: true,
        sourceFetchedAt: true, updatedAt: true,
      },
    }),
    getEffectiveOperationalTargets(input),
  ]);

  const achievementTarget = targets.achievementDeliveryTarget.value ?? DELIVERY_TARGET;
  const deliveryRows = aggregateDeliveryMonitoringMetrics(deliveryRecords).map((row) => ({
    ...row,
    target: achievementTarget,
    status: row.achievement >= achievementTarget ? "ACHIEVE" as const : "NOT ACHIEVE" as const,
  }));
  const pickupRows = aggregatePickupMonitoringMetrics(pickupRecords);
  const metrics = summarizeMonitoringMetrics(deliveryRows, pickupRows);
  const totalDelivery = deliveryRows.reduce((sum, row) => sum + row.totalDelivery, 0);
  const totalTtd = deliveryRows.reduce((sum, row) => sum + row.totalTtd, 0);

  return {
    businessDate,
    target: achievementTarget,
    targetSource: targets.achievementDeliveryTarget.source,
    summary: {
      deliveryAchievement: totalDelivery === 0 ? 0 : totalTtd / totalDelivery * 100,
      totalDelivery,
      totalTtd,
      totalPending: totalDelivery - totalTtd,
      totalDeliveryWeight: metrics.deliveryWeight,
      totalPickupWaybills: metrics.totalPickupWaybills,
      pickupRevenue: metrics.regularRevenue,
      pickupRegularWeight: metrics.regularWeight,
      pickupMarketplaceWeight: metrics.marketplaceWeight,
      pickupWeight: metrics.totalPickupWeight,
    },
    delivery: paginate(deliveryRows, input.deliveryPage, input.pageSize),
    pickup: paginate(pickupRows, input.pickupPage, input.pageSize),
  };
}

export async function getMonitoringDailyDiagnostic(input: {
  tenantId: string;
  outletId: string;
  businessDate: string;
  waybill?: string;
}) {
  const operationalDate = new Date(`${input.businessDate}T00:00:00.000Z`);
  const [records, latestRun] = await Promise.all([
    prisma.rawDispatch.findMany({
      where: {
        tenantId: input.tenantId,
        outletId: input.outletId,
        operationalDate,
      },
      select: {
        id: true,
        operationalDate: true,
        waybillNo: true,
        courierNameRaw: true,
        deliveryStatusRaw: true,
        syncStatus: true,
        isActive: true,
        sourceRecordKey: true,
        sourceFetchedAt: true,
        dispatchAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.syncRun.findFirst({
      where: {
        tenantId: input.tenantId,
        outletId: input.outletId,
        operationalDate,
        runType: "FULL",
      },
      orderBy: { startedAt: "desc" },
      select: {
        dispatchFetchedCount: true,
        dispatchCreatedCount: true,
        dispatchUpdatedCount: true,
        duplicateCount: true,
        anomalyCount: true,
        metadata: true,
      },
    }),
  ]);
  const allNormalizedRecords = records.filter((record) =>
    record.syncStatus === "NORMALIZED"
  );
  const activeRecords = allNormalizedRecords.filter((record) =>
    record.isActive
  );
  const finalRecords = selectFinalDeliveryRecords(records, input.businessDate);
  const versions = new Map<string, typeof records>();
  for (const record of allNormalizedRecords) {
    const key = canonical(record.waybillNo);
    versions.set(key, [...(versions.get(key) ?? []), record]);
  }
  const duplicateGroups = [...versions.entries()]
    .filter(([, rows]) => rows.length > 1);
  const statusBreakdown = Object.entries(finalRecords.reduce<Record<string, number>>(
    (result, record) => {
      const status = canonical(record.deliveryStatusRaw) || "(KOSONG)";
      result[status] = (result[status] ?? 0) + 1;
      return result;
    },
    {},
  )).map(([status, count]) => ({ status, count }));
  const totalTtd = finalRecords.filter((record) =>
    canonical(record.deliveryStatusRaw) === "PENERIMAAN NORMAL"
  ).length;
  const metadata = latestRun?.metadata &&
    typeof latestRun.metadata === "object" &&
    !Array.isArray(latestRun.metadata)
      ? latestRun.metadata as Record<string, unknown>
      : {};
  const inspected = input.waybill
    ? (versions.get(canonical(input.waybill)) ?? []).map((record) => ({
      waybill: record.waybillNo,
      sourceKey: record.sourceRecordKey,
      operationalDate: record.operationalDate.toISOString().slice(0, 10),
      fetchedAt: record.sourceFetchedAt,
      recordStatus: record.syncStatus,
      deliveryStatus: record.deliveryStatusRaw,
      courierName: record.courierNameRaw,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }))
    : [];
  return {
    businessDate: input.businessDate,
    rawResponseCount: latestRun?.dispatchFetchedCount ?? null,
    uniqueEndpointWaybillCount:
      typeof metadata.dispatchUniqueWaybillCount === "number"
        ? metadata.dispatchUniqueWaybillCount
        : null,
    insertedCount: latestRun?.dispatchCreatedCount ?? null,
    updatedCount: latestRun?.dispatchUpdatedCount ?? null,
    skippedCount: latestRun?.anomalyCount ?? null,
    duplicateIgnoredCount: latestRun?.duplicateCount ?? null,
    databaseActiveRecordCount: activeRecords.length,
    databaseUniqueWaybillCount: finalRecords.length,
    duplicateWaybillCount: duplicateGroups.length,
    duplicateExtraRecordCount:
      allNormalizedRecords.length - versions.size,
    penerimaanNormalCount: totalTtd,
    pendingCalculatedCount: finalRecords.length - totalTtd,
    unmatchedCourierCount: finalRecords.filter((record) =>
      !canonical(record.courierNameRaw)
    ).length,
    statusBreakdown,
    inspectedWaybill: inspected,
  };
}
