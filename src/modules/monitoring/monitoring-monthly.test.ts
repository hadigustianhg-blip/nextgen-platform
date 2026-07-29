import { describe, expect, it } from "vitest";
import {
  buildMonthlyDeliveryRows,
  buildMonthlyPickupRows,
  paginateMonthly,
} from "./monitoring-monthly.calculation";
import { monitoringMonthlyQuerySchema } from "./monitoring-monthly.validation";

describe("Monitoring Monthly", () => {
  it("accumulates 20 + 20 + 20 delivery into 60 with distinct active days", () => {
    const rows = buildMonthlyDeliveryRows(
      ["26", "27", "28"].map((day, index) => ({
        businessDate: `2026-07-${day}`,
        teamName: index === 1 ? "RIDWAN" : "Ridwan",
        totalDelivery: 20,
        totalTtd: [18, 20, 19][index],
        totalPending: [2, 0, 1][index],
      })),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      totalDelivery: 60,
      totalTtd: 57,
      totalPending: 3,
      achievement: 95,
      activeDays: 3,
      status: "ACHIEVE",
    });
  });

  it("calculates achievement from grand totals, not average daily percentages", () => {
    const [row] = buildMonthlyDeliveryRows([
      {
        businessDate: "2026-07-01",
        teamName: "A",
        totalDelivery: 1,
        totalTtd: 1,
        totalPending: 0,
      },
      {
        businessDate: "2026-07-02",
        teamName: "A",
        totalDelivery: 9,
        totalTtd: 0,
        totalPending: 9,
      },
    ]);
    expect(row.achievement).toBe(10);
  });

  it("accumulates only rows returned for ranges 1–15 and 16–20", () => {
    const dailyRows = Array.from({ length: 20 }, (_, index) => ({
      businessDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
      teamName: "Ridwan",
      totalDelivery: 2,
      totalTtd: 1,
      totalPending: 1,
    }));
    const firstHalf = buildMonthlyDeliveryRows(dailyRows.slice(0, 15))[0];
    const secondRange = buildMonthlyDeliveryRows(dailyRows.slice(15, 20))[0];
    expect(firstHalf).toMatchObject({
      totalDelivery: 30,
      totalTtd: 15,
      activeDays: 15,
    });
    expect(secondRange).toMatchObject({
      totalDelivery: 10,
      totalTtd: 5,
      activeDays: 5,
    });
  });

  it("accumulates pickup and calculates daily averages", () => {
    const [row] = buildMonthlyPickupRows([
      {
        businessDate: "2026-07-26",
        staffName: "Yogi",
        totalWaybills: 10,
        regularRevenue: "500000",
        regularWeight: "60",
        marketplaceWeight: "40",
        totalWeight: "100",
      },
      {
        businessDate: "2026-07-27",
        staffName: "YOGI",
        totalWaybills: 8,
        regularRevenue: "350000",
        regularWeight: "50",
        marketplaceWeight: "25",
        totalWeight: "75",
      },
    ]);
    expect(row).toMatchObject({
      totalWaybills: 18,
      regularRevenue: "850000",
      regularWeight: "110",
      marketplaceWeight: "65",
      totalWeight: "175",
      activeDays: 2,
      averageWaybillsPerDay: 9,
      averageRevenuePerDay: "425000",
    });
  });

  it("matches Daily totals for a one-day Monthly range", () => {
    const daily = {
      businessDate: "2026-07-26",
      teamName: "Ridwan",
      totalDelivery: 20,
      totalTtd: 18,
      totalPending: 2,
    };
    expect(buildMonthlyDeliveryRows([daily])[0]).toMatchObject({
      totalDelivery: daily.totalDelivery,
      totalTtd: daily.totalTtd,
      totalPending: daily.totalPending,
      activeDays: 1,
    });
  });

  it("paginates Delivery and Pickup independently", () => {
    const rows = Array.from({ length: 30 }, (_, index) => index + 1);
    expect(paginateMonthly(rows, 2, 10)).toMatchObject({
      items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      total: 30,
      page: 2,
      totalPages: 3,
    });
    expect(paginateMonthly(rows, 3, 5)).toMatchObject({
      items: [11, 12, 13, 14, 15],
      page: 3,
      pageSize: 5,
    });
  });

  it("accepts partial-month ranges and rejects invalid or cross-month ranges", () => {
    const base = {
      outletId: "11111111-1111-4111-8111-111111111111",
    };
    expect(
      monitoringMonthlyQuerySchema.safeParse({
        ...base,
        startDate: "2026-07-01",
        endDate: "2026-07-15",
      }).success,
    ).toBe(true);
    expect(
      monitoringMonthlyQuerySchema.safeParse({
        ...base,
        startDate: "2026-07-16",
        endDate: "2026-07-20",
      }).success,
    ).toBe(true);
    expect(
      monitoringMonthlyQuerySchema.safeParse({
        ...base,
        startDate: "2026-07-20",
        endDate: "2026-07-16",
      }).success,
    ).toBe(false);
    expect(
      monitoringMonthlyQuerySchema.safeParse({
        ...base,
        startDate: "2026-07-01",
        endDate: "2026-08-01",
      }).success,
    ).toBe(false);
  });
});
