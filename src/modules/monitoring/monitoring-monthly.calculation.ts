import { Prisma } from "@prisma/client";
import {
  calculateAchievement,
  DELIVERY_TARGET,
} from "./monitoring-daily.calculation";
import {
  canonicalDispatchText,
} from "@/modules/delivery-settlement/dispatch-deduplication";
import type {
  ActiveDispatchRecord,
} from "@/modules/delivery-settlement/active-dispatch-dataset";

export type DailyDeliveryRow = {
  businessDate: string;
  teamName: string;
  totalDelivery: number;
  totalTtd: number;
  totalPending: number;
  deliveryWeight?: string;
};

export type DailyPickupRow = {
  businessDate: string;
  staffName: string;
  totalWaybills: number;
  regularRevenue: string;
  regularWeight: string;
  marketplaceWeight: string;
  totalWeight: string;
};

const normalizedKey = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");

export function buildDailyActiveDeliveryRows(records: ActiveDispatchRecord[]) {
  const groups = new Map<string, DailyDeliveryRow>();
  for (const record of records) {
    const businessDate = record.operationalDate.toISOString().slice(0, 10);
    const normalizedCourier = (record.courierNameRaw ?? "")
      .normalize("NFKC").trim().replace(/\s+/g, " ");
    const teamName = normalizedCourier || "Team Belum Terpetakan";
    const key = `${businessDate}\u0000${canonicalDispatchText(teamName)}`;
    const row = groups.get(key) ?? {
      businessDate,
      teamName,
      totalDelivery: 0,
      totalTtd: 0,
      totalPending: 0,
      deliveryWeight: "0",
    };
    row.totalDelivery += 1;
    if (canonicalDispatchText(record.deliveryStatusRaw) === "PENERIMAAN NORMAL") {
      row.totalTtd += 1;
      row.deliveryWeight = new Prisma.Decimal(row.deliveryWeight ?? 0)
        .plus(record.chargeWeight).toString();
    } else {
      row.totalPending += 1;
    }
    groups.set(key, row);
  }
  return [...groups.values()].sort((left, right) =>
    left.businessDate.localeCompare(right.businessDate) ||
    left.teamName.localeCompare(right.teamName, "id-ID")
  );
}

export function buildMonthlyDeliveryRows(rows: DailyDeliveryRow[]) {
  const groups = new Map<
    string,
    {
      teamName: string;
      totalDelivery: number;
      totalTtd: number;
      totalPending: number;
      deliveryWeight: Prisma.Decimal;
      activeDates: Set<string>;
    }
  >();
  for (const row of rows) {
    const key = normalizedKey(row.teamName);
    const group = groups.get(key) ?? {
      teamName: row.teamName,
      totalDelivery: 0,
      totalTtd: 0,
      totalPending: 0,
      deliveryWeight: new Prisma.Decimal(0),
      activeDates: new Set<string>(),
    };
    group.totalDelivery += row.totalDelivery;
    group.totalTtd += row.totalTtd;
    group.totalPending += row.totalPending;
    group.deliveryWeight = group.deliveryWeight.plus(row.deliveryWeight ?? 0);
    group.activeDates.add(row.businessDate);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const achievement = calculateAchievement(
        group.totalTtd,
        group.totalDelivery,
      );
      return {
        teamName: group.teamName,
        totalDelivery: group.totalDelivery,
        totalTtd: group.totalTtd,
        totalPending: group.totalPending,
        deliveryWeight: group.deliveryWeight.toString(),
        achievement,
        target: DELIVERY_TARGET,
        status:
          achievement >= DELIVERY_TARGET
            ? ("ACHIEVE" as const)
            : ("NOT ACHIEVE" as const),
        activeDays: group.activeDates.size,
      };
    })
    .sort(
      (left, right) =>
        right.achievement - left.achievement ||
        right.totalDelivery - left.totalDelivery ||
        left.teamName.localeCompare(right.teamName, "id-ID"),
    );
}

export function buildMonthlyPickupRows(rows: DailyPickupRow[]) {
  const groups = new Map<
    string,
    {
      staffName: string;
      totalWaybills: number;
      regularRevenue: Prisma.Decimal;
      regularWeight: Prisma.Decimal;
      marketplaceWeight: Prisma.Decimal;
      totalWeight: Prisma.Decimal;
      activeDates: Set<string>;
    }
  >();
  for (const row of rows) {
    const key = normalizedKey(row.staffName);
    const group = groups.get(key) ?? {
      staffName: row.staffName,
      totalWaybills: 0,
      regularRevenue: new Prisma.Decimal(0),
      regularWeight: new Prisma.Decimal(0),
      marketplaceWeight: new Prisma.Decimal(0),
      totalWeight: new Prisma.Decimal(0),
      activeDates: new Set<string>(),
    };
    group.totalWaybills += row.totalWaybills;
    group.regularRevenue = group.regularRevenue.plus(row.regularRevenue);
    group.regularWeight = group.regularWeight.plus(row.regularWeight);
    group.marketplaceWeight = group.marketplaceWeight.plus(
      row.marketplaceWeight,
    );
    group.totalWeight = group.totalWeight.plus(row.totalWeight);
    group.activeDates.add(row.businessDate);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const activeDays = group.activeDates.size;
      return {
        staffName: group.staffName,
        totalWaybills: group.totalWaybills,
        regularRevenue: group.regularRevenue.toString(),
        regularWeight: group.regularWeight.toString(),
        marketplaceWeight: group.marketplaceWeight.toString(),
        totalWeight: group.totalWeight.toString(),
        activeDays,
        averageWaybillsPerDay:
          activeDays === 0 ? 0 : group.totalWaybills / activeDays,
        averageRevenuePerDay:
          activeDays === 0
            ? "0"
            : group.regularRevenue.dividedBy(activeDays).toString(),
      };
    })
    .sort(
      (left, right) =>
        Number(right.regularRevenue) - Number(left.regularRevenue) ||
        right.totalWaybills - left.totalWaybills ||
        left.staffName.localeCompare(right.staffName, "id-ID"),
    );
}

export function paginateMonthly<T>(rows: T[], page: number, pageSize: number) {
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    totalPages: Math.ceil(rows.length / pageSize),
  };
}
