import { Prisma } from "@prisma/client";
import type { ActiveDispatchRecord } from "@/modules/delivery-settlement/active-dispatch-dataset";
import {
  canonicalMonitoringText,
  isMonitoringMarketplacePickup,
  isMonitoringRegularPickup,
  isMonitoringTtd,
  selectFinalMonitoringPickupRecords,
  type MonitoringPickupRecord,
} from "./monitoring-metrics";

export const monitoringDetailMetrics = [
  "DELIVERY_ACHIEVEMENT", "DELIVERY_TOTAL", "DELIVERY_TTD", "DELIVERY_PENDING", "DELIVERY_WEIGHT",
  "PICKUP_TOTAL", "PICKUP_REVENUE", "PICKUP_REGULAR_WEIGHT", "PICKUP_MARKETPLACE_WEIGHT", "PICKUP_WEIGHT",
] as const;
export type MonitoringDetailMetric = typeof monitoringDetailMetrics[number];

export type MonitoringDetailPickupRecord = MonitoringPickupRecord & {
  senderName: string | null;
};

const sameName = (actual: string | null, requested?: string) =>
  !requested || canonicalMonitoringText(actual) === canonicalMonitoringText(requested);
const decimalSum = (values: Array<Prisma.Decimal | null>) =>
  values.reduce<Prisma.Decimal>((sum, value) => value ? sum.plus(value) : sum, new Prisma.Decimal(0)).toString();

export function buildMonitoringDailyDetail(input: {
  businessDate: string;
  metric: MonitoringDetailMetric;
  team?: string;
  deliveryRecords: ActiveDispatchRecord[];
  pickupRecords: MonitoringDetailPickupRecord[];
}) {
  const scopedDelivery = input.deliveryRecords.filter((row) => sameName(row.courierNameRaw, input.team));
  const finalPickup = selectFinalMonitoringPickupRecords(input.pickupRecords)
    .filter((row) => sameName(row.staffNameRaw, input.team));
  const ttd = scopedDelivery.filter((row) => isMonitoringTtd(row.deliveryStatusRaw));
  const pending = scopedDelivery.filter((row) => !isMonitoringTtd(row.deliveryStatusRaw));
  const deliveryForMetric = input.metric === "DELIVERY_TTD" || input.metric === "DELIVERY_WEIGHT"
    ? ttd
    : input.metric === "DELIVERY_PENDING" || input.metric === "DELIVERY_ACHIEVEMENT"
      ? pending
      : scopedDelivery;
  const regularPickup = finalPickup.filter((row) => isMonitoringRegularPickup(row.settlementRaw));
  const marketplacePickup = finalPickup.filter((row) => isMonitoringMarketplacePickup(row.settlementRaw));
  const pickupForMetric = input.metric === "PICKUP_REVENUE" || input.metric === "PICKUP_REGULAR_WEIGHT"
    ? regularPickup
    : input.metric === "PICKUP_MARKETPLACE_WEIGHT"
      ? marketplacePickup
      : input.metric === "PICKUP_WEIGHT"
        ? [...regularPickup, ...marketplacePickup]
        : finalPickup;

  const deliveryRows = deliveryForMetric.map((row) => ({
    kind: "DELIVERY" as const,
    waybill: row.waybillNo,
    businessDate: input.businessDate,
    team: row.courierNameRaw?.trim() || "Team Belum Terpetakan",
    customer: row.receiverName?.trim() || null,
    receiverAddress: row.receiverAddress?.trim() || null,
    status: row.deliveryStatusRaw?.trim() || "Status tidak tersedia",
    ttd: isMonitoringTtd(row.deliveryStatusRaw),
    weight: row.chargeWeight?.toString() ?? "0",
    lastActivityAt: (row.dispatchAt ?? row.sourceFetchedAt).toISOString(),
  }));
  const pickupRows = pickupForMetric.map((row) => ({
    kind: "PICKUP" as const,
    waybill: row.waybillNo,
    businessDate: input.businessDate,
    team: row.staffNameRaw?.trim() || "Staff Belum Terpetakan",
    customer: row.senderName?.trim() || null,
    settlement: row.settlementRaw?.trim() || null,
    revenue: isMonitoringRegularPickup(row.settlementRaw) ? row.freight.toString() : "0",
    weight: (isMonitoringRegularPickup(row.settlementRaw) || isMonitoringMarketplacePickup(row.settlementRaw))
      ? row.weight.toString()
      : "0",
    lastActivityAt: row.sourceFetchedAt.toISOString(),
  }));

  return {
    businessDate: input.businessDate,
    metric: input.metric,
    team: input.team ?? null,
    summary: {
      totalDelivery: scopedDelivery.length,
      totalTtd: ttd.length,
      totalPending: pending.length,
      achievement: scopedDelivery.length ? ttd.length / scopedDelivery.length * 100 : 0,
      deliveryCount: deliveryRows.length,
      deliveryWeight: decimalSum(deliveryForMetric.map((row) => isMonitoringTtd(row.deliveryStatusRaw) ? row.chargeWeight : null)),
      pickupCount: pickupRows.length,
      pickupRevenue: decimalSum(pickupForMetric.map((row) => isMonitoringRegularPickup(row.settlementRaw) ? row.freight : null)),
      pickupWeight: decimalSum(pickupForMetric.map((row) =>
        isMonitoringRegularPickup(row.settlementRaw) || isMonitoringMarketplacePickup(row.settlementRaw) ? row.weight : null)),
    },
    rows: input.metric.startsWith("DELIVERY_") ? deliveryRows : pickupRows,
  };
}
