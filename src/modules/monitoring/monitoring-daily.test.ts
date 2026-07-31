import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildDeliveryRows,
  buildDeliveryMonitoring,
  buildPickupRows,
  calculateAchievement,
  assertDeliveryInvariant,
  DELIVERY_TARGET,
  orchestrateMonitoringSync,
} from "./monitoring-daily.calculation";
import { monitoringDailyQuerySchema } from "./monitoring-daily.validation";

const date = new Date("2026-07-29T00:00:00.000Z");
const count = (waybillNo: number) => ({ waybillNo });
const sum = (totalFreight: number, weight: number) => ({
  totalFreight: new Prisma.Decimal(totalFreight),
  weight: new Prisma.Decimal(weight),
});
const deliveryRecord = (
  id: string,
  overrides: Partial<{
    operationalDate: string;
    waybillNo: string;
    courierNameRaw: string | null;
    deliveryStatusRaw: string | null;
    syncStatus: string;
    isActive: boolean;
    sourceFetchedAt: string;
    dispatchAt: string | null;
  }> = {},
) => ({
  id,
  operationalDate: new Date(`${overrides.operationalDate ?? "2026-07-31"}T00:00:00.000Z`),
  waybillNo: overrides.waybillNo ?? id,
  courierNameRaw: overrides.courierNameRaw === undefined
    ? "TEAM A"
    : overrides.courierNameRaw,
  deliveryStatusRaw: overrides.deliveryStatusRaw === undefined
    ? "Penerimaan Normal"
    : overrides.deliveryStatusRaw,
  syncStatus: overrides.syncStatus ?? "NORMALIZED",
  isActive: overrides.isActive ?? true,
  sourceRecordKey: `v1:dispatch:${id}`,
  sourceFetchedAt: new Date(overrides.sourceFetchedAt ?? "2026-07-31T12:00:00.000Z"),
  dispatchAt: overrides.dispatchAt === undefined
    ? new Date("2026-07-31T11:00:00.000Z")
    : overrides.dispatchAt ? new Date(overrides.dispatchAt) : null,
  createdAt: new Date("2026-07-31T12:00:00.000Z"),
  updatedAt: new Date("2026-07-31T12:00:00.000Z"),
});

describe("Monitoring Daily", () => {
  it("calculates delivery achievement safely", () => {
    expect(calculateAchievement(340, 356)).toBeCloseTo(95.5056);
    expect(calculateAchievement(0, 0)).toBe(0);
    expect(DELIVERY_TARGET).toBe(95);
  });

  it("maps, evaluates, and sorts delivery aggregates", () => {
    const rows = buildDeliveryRows(
      [
        { operationalDate: date, courierNameRaw: "TEAM B", _count: count(10) },
        { operationalDate: date, courierNameRaw: "TEAM A", _count: count(20) },
      ],
      [
        { operationalDate: date, courierNameRaw: "TEAM B", _count: count(10) },
        { operationalDate: date, courierNameRaw: "TEAM A", _count: count(18) },
      ],
      [{ operationalDate: date, courierNameRaw: "TEAM A", _count: count(2) }],
    );

    expect(rows.map((row) => row.teamName)).toEqual(["TEAM B", "TEAM A"]);
    expect(rows[0]).toMatchObject({
      totalDelivery: 10,
      totalTtd: 10,
      totalPending: 0,
      status: "ACHIEVE",
    });
    expect(rows[1]).toMatchObject({
      achievement: 90,
      totalPending: 2,
      status: "NOT ACHIEVE",
    });
  });

  it("uses one final unique-waybill dataset for summary and every team", () => {
    const result = buildDeliveryMonitoring([
      deliveryRecord("old", {
        waybillNo: "WB-1",
        deliveryStatusRaw: "Belum diterima",
        sourceFetchedAt: "2026-07-31T08:00:00.000Z",
      }),
      deliveryRecord("new", {
        waybillNo: "WB-1",
        deliveryStatusRaw: "  penerimaan   normal ",
        sourceFetchedAt: "2026-07-31T12:00:00.000Z",
      }),
      deliveryRecord("pending", {
        waybillNo: "WB-2",
        deliveryStatusRaw: "Gagal Antar",
      }),
      deliveryRecord("unmapped", {
        waybillNo: "WB-3",
        courierNameRaw: " ",
        deliveryStatusRaw: null,
      }),
    ], "2026-07-31");
    expect(result.summary).toMatchObject({
      totalDelivery: 3,
      totalTtd: 1,
      totalPending: 2,
    });
    expect(result.rows.find((row) =>
      row.teamName === "Team Belum Terpetakan"
    )).toMatchObject({ totalDelivery: 1, totalTtd: 0, totalPending: 1 });
    expect(result.rows.reduce((sum, row) => sum + row.totalDelivery, 0)).toBe(3);
    expect(result.rows.reduce((sum, row) => sum + row.totalTtd, 0)).toBe(1);
    expect(result.rows.reduce((sum, row) => sum + row.totalPending, 0)).toBe(2);
  });

  it("excludes inactive, invalid-status, and adjacent business dates", () => {
    const result = buildDeliveryMonitoring([
      deliveryRecord("valid"),
      deliveryRecord("superseded", { isActive: false }),
      deliveryRecord("void", { syncStatus: "VOID" }),
      deliveryRecord("previous", { operationalDate: "2026-07-30" }),
      deliveryRecord("next", { operationalDate: "2026-08-01" }),
    ], "2026-07-31");
    expect(result.finalRecords.map((row) => row.id)).toEqual(["valid"]);
  });

  it.each(["Gagal Antar", "Retur", "Pending", "Dalam Proses", null, ""])(
    "never treats status %s as TTD",
    (deliveryStatusRaw) => {
      const result = buildDeliveryMonitoring([
        deliveryRecord("one", { deliveryStatusRaw }),
      ], "2026-07-31");
      expect(result.summary).toMatchObject({
        totalDelivery: 1,
        totalTtd: 0,
        totalPending: 1,
      });
    },
  );

  it("keeps the 429/401/28 regression invariant", () => {
    const records = Array.from({ length: 429 }, (_, index) =>
      deliveryRecord(`WB-${index}`, {
        deliveryStatusRaw: index < 401
          ? "Penerimaan Normal"
          : "Belum diterima",
      })
    );
    expect(buildDeliveryMonitoring(records, "2026-07-31").summary)
      .toMatchObject({ totalDelivery: 429, totalTtd: 401, totalPending: 28 });
  });

  it("throws invariant diagnostics outside production and warns safely in production", () => {
    expect(() => assertDeliveryInvariant(false, { environment: "test" }))
      .toThrow("MONITORING_DAILY_DELIVERY_INVARIANT_FAILED");
    const warnings: string[] = [];
    expect(() => assertDeliveryInvariant(false, {
      environment: "production",
      warn: (message) => warnings.push(message),
    })).not.toThrow();
    expect(warnings).toEqual(["MONITORING_DAILY_DELIVERY_INVARIANT_FAILED"]);
  });

  it("separates regular and marketplace pickup weight and sorts revenue", () => {
    const rows = buildPickupRows(
      [
        {
          operationalDate: date,
          staffNameRaw: "STAFF A",
          _count: count(3),
          _sum: sum(500_000, 20),
        },
        {
          operationalDate: date,
          staffNameRaw: "STAFF B",
          _count: count(2),
          _sum: sum(750_000, 10),
        },
      ],
      [
        {
          operationalDate: date,
          staffNameRaw: "STAFF A",
          _count: count(1),
          _sum: sum(100_000, 8),
        },
      ],
    );

    expect(rows.map((row) => row.staffName)).toEqual(["STAFF B", "STAFF A"]);
    expect(rows[1]).toMatchObject({
      totalWaybills: 3,
      regularRevenue: "500000",
      regularWeight: "12",
      marketplaceWeight: "8",
      totalWeight: "20",
    });
  });

  it("accepts empty optional filters and applies pagination defaults", () => {
    expect(
      monitoringDailyQuerySchema.parse({
        businessDate: "",
        outletId: "",
      }),
    ).toEqual({
      businessDate: undefined,
      outletId: undefined,
      deliveryPage: 1,
      pickupPage: 1,
      pageSize: 10,
    });
  });

  it("reports partial sync failure without a false success", async () => {
    const result = await orchestrateMonitoringSync(
      async () => ({ processed: 219 }),
      async () => {
        throw new Error("upstream");
      },
    );
    expect(result).toEqual({
      success: false,
      dispatch: { success: true, processed: 219 },
      pickup: {
        success: false,
        error: "Sinkronisasi Pickup gagal.",
      },
    });
  });

  it("runs Dispatch before Pickup", async () => {
    const order: string[] = [];
    await orchestrateMonitoringSync(
      async () => {
        order.push("dispatch");
        return { processed: 1 };
      },
      async () => {
        order.push("pickup");
        return { processed: 1 };
      },
    );
    expect(order).toEqual(["dispatch", "pickup"]);
  });
});
