import { Prisma } from "@prisma/client";

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

const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const nameKey = (value: string | null) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
const aggregateKey = (date: Date, name: string | null) =>
  `${dateKey(date)}\u0000${nameKey(name).toLocaleUpperCase("id-ID")}`;
const decimal = (value: Prisma.Decimal | null | undefined) =>
  value ?? new Prisma.Decimal(0);

export function calculateAchievement(totalTtd: number, totalDelivery: number) {
  return totalDelivery === 0 ? 0 : (totalTtd / totalDelivery) * 100;
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
  const pendingByGroup = new Map(
    pending.map((row) => [
      aggregateKey(row.operationalDate, row.courierNameRaw),
      row._count.waybillNo,
    ]),
  );
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
        totalPending: pendingByGroup.get(key) ?? 0,
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
  error?: string;
};

export async function orchestrateMonitoringSync(
  syncDispatch: () => Promise<{ processed: number }>,
  syncPickup: () => Promise<{ processed: number }>,
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
