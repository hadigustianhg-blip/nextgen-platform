import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildDeliveryRows,
  buildPickupRows,
  calculateAchievement,
  DELIVERY_TARGET,
} from "./monitoring-daily.calculation";
import {
  buildMonthlyDeliveryRows,
  buildMonthlyPickupRows,
  paginateMonthly,
} from "./monitoring-monthly.calculation";

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
    deliveryTotals,
    deliveryReceived,
    deliveryPending,
    pickupTotals,
    pickupMarketplace,
  ] = await Promise.all([
    prisma.rawDispatch.groupBy({
      by: ["operationalDate", "courierNameRaw"],
      where: whereScope,
      _count: { waybillNo: true },
    }),
    prisma.rawDispatch.groupBy({
      by: ["operationalDate", "courierNameRaw"],
      where: {
        ...whereScope,
        deliveryStatusRaw: {
          equals: "Penerimaan Normal",
          mode: "insensitive",
        },
      },
      _count: { waybillNo: true },
    }),
    prisma.rawDispatch.groupBy({
      by: ["operationalDate", "courierNameRaw"],
      where: {
        ...whereScope,
        deliveryStatusRaw: {
          equals: "Belum diterima",
          mode: "insensitive",
        },
      },
      _count: { waybillNo: true },
    }),
    prisma.rawPickup.groupBy({
      by: ["operationalDate", "staffNameRaw"],
      where: whereScope,
      _count: { waybillNo: true },
      _sum: { totalFreight: true, weight: true },
    }),
    prisma.rawPickup.groupBy({
      by: ["operationalDate", "staffNameRaw"],
      where: {
        ...whereScope,
        serviceRaw: { equals: "Marketplace", mode: "insensitive" },
      },
      _count: { waybillNo: true },
      _sum: { totalFreight: true, weight: true },
    }),
  ]);

  const deliveryRows = buildMonthlyDeliveryRows(
    buildDeliveryRows(deliveryTotals, deliveryReceived, deliveryPending),
  );
  const pickupRows = buildMonthlyPickupRows(
    buildPickupRows(pickupTotals, pickupMarketplace),
  );
  const totalDelivery = deliveryRows.reduce(
    (sum, row) => sum + row.totalDelivery,
    0,
  );
  const totalTtd = deliveryRows.reduce((sum, row) => sum + row.totalTtd, 0);
  const pickupRevenue = pickupRows.reduce(
    (sum, row) => sum.plus(row.regularRevenue),
    new Prisma.Decimal(0),
  );
  const pickupWeight = pickupRows.reduce(
    (sum, row) => sum.plus(row.totalWeight),
    new Prisma.Decimal(0),
  );

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
      pickupRevenue: pickupRevenue.toString(),
      pickupWeight: pickupWeight.toString(),
    },
    delivery: paginateMonthly(deliveryRows, input.deliveryPage, input.pageSize),
    pickup: paginateMonthly(pickupRows, input.pickupPage, input.pageSize),
  };
}
