import { Prisma } from "@prisma/client";
import {
  selectLatestDispatchRecords,
} from "@/modules/delivery-settlement/dispatch-deduplication";

export const DELIVERY_TARGET = 95;

export type DeliveryAggregate = {
  operationalDate: Date;
  courierNameRaw: string | null;
  _count: { waybillNo: number };
};

export type PickupAggregate = {
  operationalDate: Date;
  staffNameRaw: string | null;
  _count: { waybillNo: number };
  _sum: { totalFreight: Prisma.Decimal | null; weight: Prisma.Decimal | null };
};

export type DeliverySourceRecord = {
  id: string;
  operationalDate: Date;
  waybillNo: string;
  courierNameRaw: string | null;
  deliveryStatusRaw: string | null;
  syncStatus: string;
  isActive: boolean;
  sourceRecordKey: string;
  sourceFetchedAt: Date;
  dispatchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const nameKey = (value: string | null) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
const aggregateKey = (date: Date, name: string | null) =>
  `${dateKey(date)}\u0000${nameKey(name).toLocaleUpperCase("id-ID")}`;
const decimal = (value: Prisma.Decimal | null | undefined) =>
  value ?? new Prisma.Decimal(0);
const canonical = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");

export function selectFinalDeliveryRecords(
  records: DeliverySourceRecord[],
  businessDate: string,
) {
  return selectLatestDispatchRecords(records.filter((record) =>
    dateKey(record.operationalDate) === businessDate &&
    record.syncStatus === "NORMALIZED" && record.isActive
  ));
}

export function buildDeliveryMonitoring(
  records: DeliverySourceRecord[],
  businessDate: string,
) {
  const finalRecords = selectFinalDeliveryRecords(records, businessDate);
  const byTeam = new Map<string, {
    teamName: string;
    totalDelivery: number;
    totalTtd: number;
  }>();
  for (const record of finalRecords) {
    const normalizedName = nameKey(record.courierNameRaw);
    const teamKey = canonical(normalizedName);
    const team = byTeam.get(teamKey) ?? {
      teamName: normalizedName || "Team Belum Terpetakan",
      totalDelivery: 0,
      totalTtd: 0,
    };
    team.totalDelivery += 1;
    if (canonical(record.deliveryStatusRaw) === "PENERIMAAN NORMAL") {
      team.totalTtd += 1;
    }
    byTeam.set(teamKey, team);
  }
  const rows = [...byTeam.values()].map((team) => {
    const totalPending = team.totalDelivery - team.totalTtd;
    const achievement = calculateAchievement(
      team.totalTtd,
      team.totalDelivery,
    );
    return {
      businessDate,
      ...team,
      totalPending,
      achievement,
      target: DELIVERY_TARGET,
      status: achievement >= DELIVERY_TARGET
        ? ("ACHIEVE" as const)
        : ("NOT ACHIEVE" as const),
    };
  }).sort((left, right) =>
    right.achievement - left.achievement ||
    right.totalDelivery - left.totalDelivery ||
    left.teamName.localeCompare(right.teamName, "id-ID")
  );
  const totalDelivery = finalRecords.length;
  const totalTtd = rows.reduce((sum, row) => sum + row.totalTtd, 0);
  const totalPending = totalDelivery - totalTtd;
  const teamDelivery = rows.reduce((sum, row) => sum + row.totalDelivery, 0);
  const teamPending = rows.reduce((sum, row) => sum + row.totalPending, 0);
  assertDeliveryInvariant(!(
    totalDelivery !== totalTtd + totalPending ||
    teamDelivery !== totalDelivery ||
    teamPending !== totalPending
  ));
  return {
    finalRecords,
    rows,
    summary: {
      totalDelivery,
      totalTtd,
      totalPending,
      deliveryAchievement: calculateAchievement(totalTtd, totalDelivery),
    },
  };
}

export function calculateAchievement(totalTtd: number, totalDelivery: number) {
  return totalDelivery === 0 ? 0 : (totalTtd / totalDelivery) * 100;
}

export function assertDeliveryInvariant(
  valid: boolean,
  options: {
    environment?: string;
    warn?: (message: string) => void;
  } = {},
) {
  if (valid) return;
  const message = "MONITORING_DAILY_DELIVERY_INVARIANT_FAILED";
  if ((options.environment ?? process.env.NODE_ENV) === "production") {
    (options.warn ?? console.warn)(message);
    return;
  }
  throw new Error(message);
}

export function buildDeliveryRows(
  totals: DeliveryAggregate[],
  received: DeliveryAggregate[],
  pending: DeliveryAggregate[],
) {
  const receivedByGroup = new Map(
    received.map((row) => [
      aggregateKey(row.operationalDate, row.courierNameRaw),
      row._count.waybillNo,
    ]),
  );
  void pending;
  return totals
    .map((row) => {
      const key = aggregateKey(row.operationalDate, row.courierNameRaw);
      const totalDelivery = row._count.waybillNo;
      const totalTtd = receivedByGroup.get(key) ?? 0;
      const achievement = calculateAchievement(totalTtd, totalDelivery);
      return {
        businessDate: dateKey(row.operationalDate),
        teamName: nameKey(row.courierNameRaw) || "Tanpa Team",
        totalDelivery,
        totalTtd,
        totalPending: totalDelivery - totalTtd,
        achievement,
        target: DELIVERY_TARGET,
        status:
          achievement >= DELIVERY_TARGET
            ? ("ACHIEVE" as const)
            : ("NOT ACHIEVE" as const),
      };
    })
    .sort(
      (left, right) =>
        right.achievement - left.achievement ||
        right.totalDelivery - left.totalDelivery,
    );
}

export function buildPickupRows(
  totals: PickupAggregate[],
  marketplace: PickupAggregate[],
) {
  const marketplaceByGroup = new Map(
    marketplace.map((row) => [
      aggregateKey(row.operationalDate, row.staffNameRaw),
      decimal(row._sum.weight),
    ]),
  );
  return totals
    .map((row) => {
      const totalWeight = decimal(row._sum.weight);
      const marketplaceWeight =
        marketplaceByGroup.get(
          aggregateKey(row.operationalDate, row.staffNameRaw),
        ) ?? new Prisma.Decimal(0);
      return {
        businessDate: dateKey(row.operationalDate),
        staffName: nameKey(row.staffNameRaw) || "Tanpa Staff",
        totalWaybills: row._count.waybillNo,
        regularRevenue: decimal(row._sum.totalFreight).toString(),
        regularWeight: totalWeight.minus(marketplaceWeight).toString(),
        marketplaceWeight: marketplaceWeight.toString(),
        totalWeight: totalWeight.toString(),
      };
    })
    .sort(
      (left, right) =>
        Number(right.regularRevenue) - Number(left.regularRevenue),
    );
}

type SyncSourceResult = {
  success: boolean;
  processed?: number;
  received?: number;
  unique?: number;
  created?: number;
  updated?: number;
  duplicateIgnored?: number;
  error?: string;
};

type SyncSourceCounts = Omit<SyncSourceResult, "success" | "error">;

export async function orchestrateMonitoringSync(
  syncDispatch: () => Promise<SyncSourceCounts>,
  syncPickup: () => Promise<SyncSourceCounts>,
): Promise<{
  success: boolean;
  dispatch: SyncSourceResult;
  pickup: SyncSourceResult;
}> {
  let dispatch: SyncSourceResult;
  let pickup: SyncSourceResult;
  try {
    dispatch = { success: true, ...(await syncDispatch()) };
  } catch {
    dispatch = {
      success: false,
      error: "Sinkronisasi Dispatch gagal.",
    };
  }
  try {
    pickup = { success: true, ...(await syncPickup()) };
  } catch {
    pickup = {
      success: false,
      error: "Sinkronisasi Pickup gagal.",
    };
  }
  return {
    success: dispatch.success && pickup.success,
    dispatch,
    pickup,
  };
}
