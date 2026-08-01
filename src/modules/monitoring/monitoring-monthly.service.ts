import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  calculateAchievement,
  DELIVERY_TARGET,
} from "./monitoring-daily.calculation";
import { getActiveDispatchRecords } from "@/modules/delivery-settlement/active-dispatch-dataset";
import {
  buildMonthlyDeliveryRows,
  buildMonthlyPickupRows,
  paginateMonthly,
} from "./monitoring-monthly.calculation";
import {
  aggregateDeliveryMonitoringMetrics,
  aggregatePickupMonitoringMetrics,
  summarizeMonitoringMetrics,
} from "./monitoring-metrics";

const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);

export async function getMonitoringMonthly(input: {
  tenantId: string;
  outletId: string;
  startDate: string;
  endDate: string;
  deliveryPage: number;
  pickupPage: number;
  pageSize: number;
}) {
  const whereScope = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    operationalDate: {
      gte: dateValue(input.startDate),
      lte: dateValue(input.endDate),
    },
    syncStatus: "NORMALIZED" as const,
  };
  const [
    deliveryRecords,
    pickupRecords,
  ] = await Promise.all([
    getActiveDispatchRecords({
      tenantId: input.tenantId,
      outletId: input.outletId,
      periodStart: dateValue(input.startDate),
      periodEnd: dateValue(input.endDate),
    }),
    prisma.rawPickup.findMany({
      where: whereScope,
      select: {
        id: true, operationalDate: true, waybillNo: true, staffNameRaw: true,
        settlementRaw: true, freight: true, weight: true,
        sourceFetchedAt: true, updatedAt: true,
      },
    }),
  ]);

  const dailyDeliveryRows = aggregateDeliveryMonitoringMetrics(deliveryRecords);
  const dailyPickupRows = aggregatePickupMonitoringMetrics(pickupRecords);
  const deliveryRows = buildMonthlyDeliveryRows(
    dailyDeliveryRows,
  );
  const pickupRows = buildMonthlyPickupRows(
    dailyPickupRows,
  );
  const totalDelivery = deliveryRows.reduce(
    (sum, row) => sum + row.totalDelivery,
    0,
  );
  const totalTtd = deliveryRows.reduce((sum, row) => sum + row.totalTtd, 0);
  const metrics = summarizeMonitoringMetrics(dailyDeliveryRows, dailyPickupRows);

  return {
    period: { startDate: input.startDate, endDate: input.endDate },
    target: DELIVERY_TARGET,
    summary: {
      deliveryAchievement: calculateAchievement(totalTtd, totalDelivery),
      totalDelivery,
      totalTtd,
      totalPending: deliveryRows.reduce(
        (sum, row) => sum + row.totalPending,
        0,
      ),
      totalDeliveryWeight: metrics.deliveryWeight,
      totalPickupWaybills: metrics.totalPickupWaybills,
      pickupRevenue: metrics.regularRevenue,
      pickupRegularWeight: metrics.regularWeight,
      pickupMarketplaceWeight: metrics.marketplaceWeight,
      pickupWeight: metrics.totalPickupWeight,
    },
    delivery: paginateMonthly(deliveryRows, input.deliveryPage, input.pageSize),
    pickup: paginateMonthly(pickupRows, input.pickupPage, input.pageSize),
  };
}
