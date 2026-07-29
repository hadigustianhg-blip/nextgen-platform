import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildDeliveryRows,
  buildPickupRows,
  calculateAchievement,
  DELIVERY_TARGET,
} from "./monitoring-daily.calculation";
import { monitoringDailyQuerySchema } from "./monitoring-daily.validation";

const date = new Date("2026-07-29T00:00:00.000Z");
const count = (waybillNo: number) => ({ waybillNo });
const sum = (totalFreight: number, weight: number) => ({
  totalFreight: new Prisma.Decimal(totalFreight),
  weight: new Prisma.Decimal(weight),
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
});
