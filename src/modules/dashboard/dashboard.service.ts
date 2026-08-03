import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  calculateAchievement,
  DELIVERY_TARGET,
} from "@/modules/monitoring";
import {
  aggregateDeliveryMonitoringMetrics,
  aggregatePickupMonitoringMetrics,
  summarizeMonitoringMetrics,
} from "@/modules/monitoring/monitoring-metrics";
import { getActiveDispatchRecords } from "@/modules/delivery-settlement/active-dispatch-dataset";
import {
  calculateDeliveryFinancials,
  summarizeDeliveryRows,
} from "@/modules/delivery-settlement";
import {
  calculateOperationalSummary,
} from "@/modules/operational-settlement/operational-settlement.service";
import {
  calculatePickupFinancials,
  isCashSettlement,
} from "@/modules/pickup/pickup-settlement.service";
import {
  getPaymentSettlement,
  listPickupPayment,
} from "@/modules/payment";
import { getSlaCutOff } from "@/modules/quality-control";
import type {
  DashboardOverview,
  DashboardPeriod,
  DashboardSection,
  DeliveryDashboardData,
  MonitoringDashboardData,
  OperationalDashboardData,
  PaymentDashboardData,
  PickupPaymentDashboardData,
  SlaDashboardData,
  StuckDeliveryDashboardData,
} from "./dashboard.types";

type Scope = { tenantId: string; outletId: string };
type Loader<T> = (scope: Scope, period: DashboardPeriod) => Promise<{
  data: T;
  updatedAt?: Date | string | null;
}>;

export type DashboardLoaders = {
  monitoring: Loader<MonitoringDashboardData>;
  deliverySettlement: Loader<DeliveryDashboardData>;
  operationalSettlement: Loader<OperationalDashboardData>;
  paymentSettlement: Loader<PaymentDashboardData>;
  pickupPayment: Loader<PickupPaymentDashboardData>;
  sla: Loader<SlaDashboardData>;
  stuckDelivery: Loader<StuckDeliveryDashboardData>;
};

const zero = () => new Prisma.Decimal(0);
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const rangeWhere = (period: DashboardPeriod) => ({
  gte: dateValue(period.startDate),
  lte: dateValue(period.endDate),
});
const isCashPayment = (value: string) =>
  ["TUNAI", "CASH"].includes(value.normalize("NFKC").trim().toLocaleUpperCase("id-ID"));

function latestDate(values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  return dates.length
    ? new Date(Math.max(...dates.map((value) => value.valueOf())))
    : null;
}

function sumStrings(values: string[]) {
  return values.reduce((total, value) => total.plus(value), zero()).toString();
}

export async function loadMonitoringDashboard(
  scope: Scope,
  period: DashboardPeriod,
) {
  const [dispatch, pickup] = await Promise.all([
    getActiveDispatchRecords({
      ...scope,
      periodStart: dateValue(period.startDate),
      periodEnd: dateValue(period.endDate),
    }),
    prisma.rawPickup.findMany({
      where: {
        ...scope,
        operationalDate: rangeWhere(period),
        syncStatus: "NORMALIZED",
      },
      select: {
        id: true,
        operationalDate: true,
        waybillNo: true,
        staffNameRaw: true,
        settlementRaw: true,
        freight: true,
        weight: true,
        sourceFetchedAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const deliveryRows = aggregateDeliveryMonitoringMetrics(dispatch);
  const pickupRows = aggregatePickupMonitoringMetrics(pickup);
  const metrics = summarizeMonitoringMetrics(deliveryRows, pickupRows);
  const dates = [...new Set([
    ...deliveryRows.map((row) => row.businessDate),
    ...pickupRows.map((row) => row.businessDate),
  ])].sort();
  const daily = dates.map((date) => {
    const delivery = deliveryRows.filter((row) => row.businessDate === date);
    const pickups = pickupRows.filter((row) => row.businessDate === date);
    const totalDelivery = delivery.reduce((sum, row) => sum + row.totalDelivery, 0);
    const totalTtd = delivery.reduce((sum, row) => sum + row.totalTtd, 0);
    return {
      date,
      achievement: calculateAchievement(totalTtd, totalDelivery),
      target: DELIVERY_TARGET,
      totalTtd,
      pending: delivery.reduce((sum, row) => sum + row.totalPending, 0),
      pickupRevenue: sumStrings(pickups.map((row) => row.regularRevenue)),
      pickupWeight: sumStrings(pickups.map((row) => row.totalWeight)),
    };
  });
  const totalDelivery = deliveryRows.reduce((sum, row) => sum + row.totalDelivery, 0);
  const totalTtd = deliveryRows.reduce((sum, row) => sum + row.totalTtd, 0);
  return {
    data: {
      target: DELIVERY_TARGET,
      summary: {
        achievement: calculateAchievement(totalTtd, totalDelivery),
        totalTtd,
        totalPending: deliveryRows.reduce((sum, row) => sum + row.totalPending, 0),
        pickupRevenue: metrics.regularRevenue,
        pickupWeight: metrics.totalPickupWeight,
      },
      daily,
    },
    updatedAt: latestDate([
      ...dispatch.map((row) => row.sourceFetchedAt),
      ...pickup.map((row) => row.sourceFetchedAt),
    ]),
  };
}

const deliveryInclude = {
  payments: {
    where: { recordStatus: "VALID" as const },
    include: {
      transfers: { where: { recordStatus: "VALID" as const } },
    },
  },
};

export async function loadDeliveryDashboard(
  scope: Scope,
  period: DashboardPeriod,
) {
  const masters = await prisma.masterSetoran.findMany({
    where: { ...scope, operationalDate: rangeWhere(period) },
    include: deliveryInclude,
    orderBy: { operationalDate: "asc" },
  });
  const rows = masters.map((row) => {
    const financial = calculateDeliveryFinancials(row);
    return {
      date: dateKey(row.operationalDate),
      totalSettlement: row.totalSettlementAmount.toString(),
      cashPaidAmount: financial.cashPaidAmount.toString(),
      transferPaidAmount: financial.transferPaidAmount.toString(),
      outstandingAmount: financial.remainingAmount.isPositive()
        ? financial.remainingAmount.toString()
        : "0",
      codCashAmount: row.codCashAmount.toString(),
      codQrisAmount: row.codQrisAmount.toString(),
      dfodAmount: row.dfodAmount.toString(),
      paymentStatus: financial.paymentStatus,
    };
  });
  const summary = summarizeDeliveryRows(rows);
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  return {
    data: {
      summary: {
        codCash: summary.totalCod.toString(),
        codQris: summary.totalCodQris.toString(),
        dfod: summary.totalDfod.toString(),
        totalSettlement: summary.totalSettlement.toString(),
      },
      daily: dates.map((date) => {
        const dailySummary = summarizeDeliveryRows(rows.filter((row) => row.date === date));
        return {
          date,
          codCash: dailySummary.totalCod.toString(),
          codQris: dailySummary.totalCodQris.toString(),
          dfod: dailySummary.totalDfod.toString(),
          totalSettlement: dailySummary.totalSettlement.toString(),
        };
      }),
    },
    updatedAt: latestDate(masters.map((row) => row.updatedAt)),
  };
}

const operationalPickupInclude = {
  rawPickup: { select: { settlementRaw: true } },
  settlementRevisions: {
    where: { recordStatus: "VALID" as const },
    orderBy: { revision: "desc" as const },
    take: 1,
    select: { discountAmount: true },
  },
  payments: {
    where: { recordStatus: "VALID" as const },
    select: { receivedAmount: true, paymentMethodRaw: true, transferAccount: true },
  },
};

export async function loadOperationalDashboard(
  scope: Scope,
  period: DashboardPeriod,
) {
  const [pickups, deliveries, expenses, closings] = await Promise.all([
    prisma.masterPickup.findMany({
      where: { ...scope, operationalDate: rangeWhere(period) },
      include: operationalPickupInclude,
    }),
    prisma.masterSetoran.findMany({
      where: { ...scope, operationalDate: rangeWhere(period) },
      include: deliveryInclude,
    }),
    prisma.operationalExpense.groupBy({
      by: ["operationalDate"],
      where: { ...scope, operationalDate: rangeWhere(period), status: "VALID" },
      _sum: { amount: true },
      _max: { updatedAt: true },
    }),
    prisma.operationalClosing.findMany({
      where: { ...scope, operationalDate: rangeWhere(period) },
      orderBy: { operationalDate: "asc" },
    }),
  ]);
  const dates = [...new Set([
    ...pickups.map((row) => dateKey(row.operationalDate)),
    ...deliveries.map((row) => dateKey(row.operationalDate)),
    ...expenses.map((row) => dateKey(row.operationalDate)),
    ...closings.map((row) => dateKey(row.operationalDate)),
  ])].sort();
  const closingByDate = new Map(closings.map((row) => [dateKey(row.operationalDate), row]));
  const expenseByDate = new Map(expenses.map((row) => [dateKey(row.operationalDate), row._sum.amount ?? zero()]));
  const daily = dates.map((date) => {
    const closing = closingByDate.get(date);
    if (closing?.status === "CLOSED" && closing.snapshotVersion > 0) {
      return {
        date,
        cashReceived: closing.cashCollectedSnapshot.toString(),
        cashAvailable: closing.cashAvailableBeforeDepositSnapshot.toString(),
        operationalExpense: closing.operationalExpenseSnapshot.toString(),
        outstanding: closing.outstandingSnapshot.toString(),
      };
    }
    let pickupCash = zero();
    let pickupOutstanding = zero();
    for (const row of pickups.filter((item) => dateKey(item.operationalDate) === date)) {
      if (!isCashSettlement(row.rawPickup.settlementRaw)) continue;
      const financial = calculatePickupFinancials(row);
      pickupCash = pickupCash.plus(row.payments
        .filter((payment) => isCashPayment(payment.paymentMethodRaw))
        .reduce((sum, payment) => sum.plus(payment.receivedAmount), zero()));
      if (financial.remainingAmount.isPositive()) {
        pickupOutstanding = pickupOutstanding.plus(financial.remainingAmount);
      }
    }
    let deliveryCash = zero();
    let deliveryOutstanding = zero();
    for (const row of deliveries.filter((item) => dateKey(item.operationalDate) === date)) {
      const financial = calculateDeliveryFinancials(row);
      deliveryCash = deliveryCash.plus(financial.cashPaidAmount);
      if (financial.remainingAmount.isPositive()) {
        deliveryOutstanding = deliveryOutstanding.plus(financial.remainingAmount);
      }
    }
    const summary = calculateOperationalSummary({
      pickupCash,
      deliveryCash,
      pickupTransfer: zero(),
      deliveryTransfer: zero(),
      pickupOutstanding,
      deliveryOutstanding,
      expense: expenseByDate.get(date) ?? zero(),
    });
    return {
      date,
      cashReceived: summary.cashCollected.toString(),
      cashAvailable: summary.cashAvailable.toString(),
      operationalExpense: summary.operationalExpense.toString(),
      outstanding: summary.outstanding.toString(),
    };
  });
  return {
    data: {
      summary: {
        cashReceived: sumStrings(daily.map((row) => row.cashReceived)),
        cashAvailable: sumStrings(daily.map((row) => row.cashAvailable)),
        operationalExpense: sumStrings(daily.map((row) => row.operationalExpense)),
        outstanding: sumStrings(daily.map((row) => row.outstanding)),
      },
      daily,
    },
    updatedAt: latestDate([
      ...pickups.map((row) => row.updatedAt),
      ...deliveries.map((row) => row.updatedAt),
      ...expenses.map((row) => row._max.updatedAt),
      ...closings.map((row) => row.updatedAt),
    ]),
  };
}

function monthsInPeriod(period: DashboardPeriod) {
  const months: Array<{ month: number; year: number }> = [];
  const current = new Date(`${period.startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${period.endDate.slice(0, 7)}-01T00:00:00.000Z`);
  while (current <= end) {
    months.push({ month: current.getUTCMonth() + 1, year: current.getUTCFullYear() });
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
}

export async function loadPaymentDashboard(scope: Scope, period: DashboardPeriod) {
  const results = await Promise.all(monthsInPeriod(period).map((month) =>
    getPaymentSettlement(scope, month)));
  const latest = results.at(-1);
  const daily = results.flatMap((result) => result.dailyRows)
    .filter((row) => row.businessDate >= period.startDate && row.businessDate <= period.endDate)
    .sort((left, right) => left.businessDate.localeCompare(right.businessDate))
    .map((row) => ({ date: row.businessDate, cashOnHand: row.closingCash }));
  return {
    data: { cashOnHand: latest?.summary.cashOnHand ?? "0", daily },
    updatedAt: null,
  };
}

export async function loadPickupPaymentDashboard(
  scope: Scope,
  period: DashboardPeriod,
) {
  const result = await listPickupPayment({
    ...scope,
    page: 1,
    pageSize: 1_000_000,
    pickupDate: "",
    waybill: "",
    customer: "",
    staff: "",
    status: "",
    age: "",
    method: "",
    search: "",
  });
  const rows = result.data.filter((row) => {
    const date = dateKey(row.pickupDate);
    return date >= period.startDate && date <= period.endDate;
  });
  const overdueOver7 = rows.filter((row) => row.ageDays > 7 && Number(row.outstanding) > 0).length;
  return {
    data: {
      summary: {
        outstanding: sumStrings(rows.map((row) => row.outstanding)),
        outstandingWaybills: rows.length,
        overdueOver7,
        notOverdue: Math.max(0, rows.length - overdueOver7),
      },
    },
    updatedAt: null,
  };
}

export async function loadSlaDashboard(scope: Scope, period: DashboardPeriod) {
  const result = await getSlaCutOff({
    ...scope,
    periodStart: period.startDate,
    periodEnd: period.endDate,
  });
  return {
    data: {
      target: result.period.target,
      averageSla: result.summary.averageSla,
      daily: result.items.slice().reverse().map((row) => ({
        date: row.businessDate,
        sla: row.sla,
        target: result.period.target,
      })),
    },
    updatedAt: null,
  };
}

export async function loadStuckDeliveryDashboard(
  scope: Scope,
  period: DashboardPeriod,
) {
  const rows = await prisma.rawInventoryDetail.groupBy({
    by: ["businessDate"],
    where: { ...scope, businessDate: rangeWhere(period) },
    _count: { _all: true },
    _max: { updatedAt: true },
    orderBy: { businessDate: "asc" },
  });
  return {
    data: {
      totalInventory: rows.reduce((sum, row) => sum + row._count._all, 0),
      daily: rows.map((row) => ({
        date: dateKey(row.businessDate),
        totalInventory: row._count._all,
      })),
    },
    updatedAt: latestDate(rows.map((row) => row._max.updatedAt)),
  };
}

export const dashboardLoaders: DashboardLoaders = {
  monitoring: loadMonitoringDashboard,
  deliverySettlement: loadDeliveryDashboard,
  operationalSettlement: loadOperationalDashboard,
  paymentSettlement: loadPaymentDashboard,
  pickupPayment: loadPickupPaymentDashboard,
  sla: loadSlaDashboard,
  stuckDelivery: loadStuckDeliveryDashboard,
};

function success<T>(value: { data: T; updatedAt?: Date | string | null }): DashboardSection<T> {
  return {
    status: "success",
    data: value.data,
    updatedAt: value.updatedAt
      ? new Date(value.updatedAt).toISOString()
      : null,
  };
}

function failure<T>(): DashboardSection<T> {
  return {
    status: "error",
    data: null,
    updatedAt: null,
    error: {
      code: "SOURCE_UNAVAILABLE",
      message: "Data sumber belum dapat dimuat.",
    },
  };
}

export async function getDashboardOverview(
  scope: Scope,
  period: DashboardPeriod,
  loaders: DashboardLoaders = dashboardLoaders,
): Promise<DashboardOverview> {
  const [
    monitoring,
    deliverySettlement,
    operationalSettlement,
    paymentSettlement,
    pickupPayment,
    sla,
    stuckDelivery,
  ] = await Promise.allSettled([
    loaders.monitoring(scope, period),
    loaders.deliverySettlement(scope, period),
    loaders.operationalSettlement(scope, period),
    loaders.paymentSettlement(scope, period),
    loaders.pickupPayment(scope, period),
    loaders.sla(scope, period),
    loaders.stuckDelivery(scope, period),
  ] as const);
  const section = <T>(result: PromiseSettledResult<{
    data: T;
    updatedAt?: Date | string | null;
  }>) => result.status === "fulfilled" ? success(result.value) : failure<T>();
  return {
    period,
    updatedAt: new Date().toISOString(),
    monitoring: section(monitoring),
    deliverySettlement: section(deliverySettlement),
    operationalSettlement: section(operationalSettlement),
    paymentSettlement: section(paymentSettlement),
    pickupPayment: section(pickupPayment),
    sla: section(sla),
    stuckDelivery: section(stuckDelivery),
  };
}
