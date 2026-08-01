import { Prisma } from "@prisma/client";
import { calculateAchievement, DELIVERY_TARGET } from "./monitoring-daily.calculation";

const zero = () => new Prisma.Decimal(0);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const canonical = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");
const displayName = (value: string | null | undefined, fallback: string) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ") || fallback;

export type MonitoringDispatchRecord = {
  operationalDate: Date;
  courierNameRaw: string | null;
  deliveryStatusRaw: string | null;
  chargeWeight: Prisma.Decimal | null;
};

export type MonitoringPickupRecord = {
  id: string;
  operationalDate: Date;
  waybillNo: string;
  staffNameRaw: string | null;
  settlementRaw: string | null;
  freight: Prisma.Decimal;
  weight: Prisma.Decimal;
  sourceFetchedAt: Date;
  updatedAt: Date;
};

export function aggregateDeliveryMonitoringMetrics(records: MonitoringDispatchRecord[]) {
  const groups = new Map<string, {
    businessDate: string;
    teamName: string;
    totalDelivery: number;
    totalTtd: number;
    deliveryWeight: Prisma.Decimal;
  }>();
  for (const record of records) {
    const businessDate = dateKey(record.operationalDate);
    const teamName = displayName(record.courierNameRaw, "Team Belum Terpetakan");
    const key = `${businessDate}\u0000${canonical(teamName)}`;
    const group = groups.get(key) ?? {
      businessDate,
      teamName,
      totalDelivery: 0,
      totalTtd: 0,
      deliveryWeight: zero(),
    };
    group.totalDelivery += 1;
    if (canonical(record.deliveryStatusRaw) === "PENERIMAAN NORMAL") {
      group.totalTtd += 1;
      if (record.chargeWeight) group.deliveryWeight = group.deliveryWeight.plus(record.chargeWeight);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const totalPending = group.totalDelivery - group.totalTtd;
    const achievement = calculateAchievement(group.totalTtd, group.totalDelivery);
    return {
      businessDate: group.businessDate,
      teamName: group.teamName,
      totalDelivery: group.totalDelivery,
      totalTtd: group.totalTtd,
      totalPending,
      deliveryWeight: group.deliveryWeight.toString(),
      achievement,
      target: DELIVERY_TARGET,
      status: achievement >= DELIVERY_TARGET
        ? ("ACHIEVE" as const)
        : ("NOT ACHIEVE" as const),
    };
  }).sort((left, right) =>
    left.businessDate.localeCompare(right.businessDate) ||
    right.achievement - left.achievement ||
    right.totalDelivery - left.totalDelivery ||
    left.teamName.localeCompare(right.teamName, "id-ID")
  );
}

export function aggregatePickupMonitoringMetrics(records: MonitoringPickupRecord[]) {
  const finalByWaybill = new Map<string, MonitoringPickupRecord>();
  for (const record of records) {
    const key = `${dateKey(record.operationalDate)}\u0000${canonical(record.waybillNo)}`;
    if (!canonical(record.waybillNo)) continue;
    const existing = finalByWaybill.get(key);
    if (!existing || record.sourceFetchedAt > existing.sourceFetchedAt ||
      (record.sourceFetchedAt.getTime() === existing.sourceFetchedAt.getTime() &&
        (record.updatedAt > existing.updatedAt ||
          (record.updatedAt.getTime() === existing.updatedAt.getTime() && record.id > existing.id)))) {
      finalByWaybill.set(key, record);
    }
  }
  const groups = new Map<string, {
    businessDate: string;
    staffName: string;
    totalWaybills: number;
    regularRevenue: Prisma.Decimal;
    regularWeight: Prisma.Decimal;
    marketplaceWeight: Prisma.Decimal;
  }>();
  for (const record of finalByWaybill.values()) {
    const businessDate = dateKey(record.operationalDate);
    const staffName = displayName(record.staffNameRaw, "Staff Belum Terpetakan");
    const key = `${businessDate}\u0000${canonical(staffName)}`;
    const group = groups.get(key) ?? {
      businessDate,
      staffName,
      totalWaybills: 0,
      regularRevenue: zero(),
      regularWeight: zero(),
      marketplaceWeight: zero(),
    };
    group.totalWaybills += 1;
    const settlement = canonical(record.settlementRaw);
    if (settlement === "DFOD" || settlement === "TUNAI") {
      group.regularRevenue = group.regularRevenue.plus(record.freight);
      group.regularWeight = group.regularWeight.plus(record.weight);
    } else if (settlement === "BULANAN") {
      group.marketplaceWeight = group.marketplaceWeight.plus(record.weight);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    businessDate: group.businessDate,
    staffName: group.staffName,
    totalWaybills: group.totalWaybills,
    regularRevenue: group.regularRevenue.toString(),
    regularWeight: group.regularWeight.toString(),
    marketplaceWeight: group.marketplaceWeight.toString(),
    totalWeight: group.regularWeight.plus(group.marketplaceWeight).toString(),
  })).sort((left, right) =>
    left.businessDate.localeCompare(right.businessDate) ||
    Number(right.regularRevenue) - Number(left.regularRevenue) ||
    left.staffName.localeCompare(right.staffName, "id-ID")
  );
}

export function summarizeMonitoringMetrics(
  deliveryRows: ReturnType<typeof aggregateDeliveryMonitoringMetrics>,
  pickupRows: ReturnType<typeof aggregatePickupMonitoringMetrics>,
) {
  const deliveryWeight = deliveryRows.reduce((sum, row) => sum.plus(row.deliveryWeight), zero());
  const totalPickupWaybills = pickupRows.reduce((sum, row) => sum + row.totalWaybills, 0);
  const regularRevenue = pickupRows.reduce((sum, row) => sum.plus(row.regularRevenue), zero());
  const regularWeight = pickupRows.reduce((sum, row) => sum.plus(row.regularWeight), zero());
  const marketplaceWeight = pickupRows.reduce((sum, row) => sum.plus(row.marketplaceWeight), zero());
  return {
    deliveryWeight: deliveryWeight.toString(),
    totalPickupWaybills,
    regularRevenue: regularRevenue.toString(),
    regularWeight: regularWeight.toString(),
    marketplaceWeight: marketplaceWeight.toString(),
    totalPickupWeight: regularWeight.plus(marketplaceWeight).toString(),
  };
}
