import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveOperationalBusinessDate } from "@/modules/operational-settlement/operational-settlement.service";
import {
  buildDeliveryRows,
  buildPickupRows,
  calculateAchievement,
  DELIVERY_TARGET,
} from "./monitoring-daily.calculation";

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
  const businessDate =
    input.businessDate ??
    (
      await resolveOperationalBusinessDate({
        tenantId: input.tenantId,
        outletId: input.outletId,
      })
    ).activeBusinessDate;
  const operationalDate = new Date(`${businessDate}T00:00:00.000Z`);
  const whereScope = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    operationalDate,
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

  const deliveryRows = buildDeliveryRows(
    deliveryTotals,
    deliveryReceived,
    deliveryPending,
  );
  const pickupRows = buildPickupRows(pickupTotals, pickupMarketplace);
  const totalDelivery = deliveryRows.reduce(
    (total, row) => total + row.totalDelivery,
    0,
  );
  const totalTtd = deliveryRows.reduce((total, row) => total + row.totalTtd, 0);
  const pickupRevenue = pickupRows.reduce(
    (total, row) => total.plus(row.regularRevenue),
    new Prisma.Decimal(0),
  );
  const pickupWeight = pickupRows.reduce(
    (total, row) => total.plus(row.totalWeight),
    new Prisma.Decimal(0),
  );

  return {
    businessDate,
    target: DELIVERY_TARGET,
    summary: {
      deliveryAchievement: calculateAchievement(totalTtd, totalDelivery),
      totalDelivery,
      totalTtd,
      totalPending: deliveryRows.reduce(
        (total, row) => total + row.totalPending,
        0,
      ),
      pickupRevenue: pickupRevenue.toString(),
      pickupWeight: pickupWeight.toString(),
    },
    delivery: paginate(deliveryRows, input.deliveryPage, input.pageSize),
    pickup: paginate(pickupRows, input.pickupPage, input.pageSize),
  };
}
