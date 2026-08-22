import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildMonitoringDailyDetail, type MonitoringDetailMetric } from "./monitoring-daily-detail";

const date = new Date("2026-08-22T00:00:00.000Z");
const delivery = (waybill: string, team: string, status: string, weight: number) => ({
  id: waybill, operationalDate: date, waybillNo: waybill, courierNameRaw: team,
  deliveryStatusRaw: status, receiverName: `Receiver ${waybill}`, chargeWeight: new Prisma.Decimal(weight),
  syncStatus: "NORMALIZED" as const, isActive: true, sourceRecordKey: waybill,
  sourceFetchedAt: new Date("2026-08-22T10:00:00.000Z"), dispatchAt: null,
  createdAt: date, updatedAt: date,
});
const pickup = (waybill: string, staff: string, settlement: string, freight: number, weight: number) => ({
  id: waybill, operationalDate: date, waybillNo: waybill, staffNameRaw: staff,
  senderName: `Sender ${waybill}`, settlementRaw: settlement, freight: new Prisma.Decimal(freight),
  weight: new Prisma.Decimal(weight), sourceFetchedAt: new Date("2026-08-22T11:00:00.000Z"), updatedAt: date,
});
const deliveryRows = [
  delivery("D1", "Team A", "Penerimaan Normal", 2.5),
  delivery("D2", "Team A", "Dalam Pengantaran", 4),
  delivery("D3", "Team B", "Penerimaan Normal", 1.5),
];
const pickupRows = [
  pickup("P1", "Team A", "TUNAI", 10000, 2),
  pickup("P2", "Team A", "BULANAN", 50000, 3),
  pickup("P3", "Team B", "LAINNYA", 70000, 9),
];
const build = (metric: MonitoringDetailMetric, team?: string) => buildMonitoringDailyDetail({
  businessDate: "2026-08-22", metric, team, deliveryRecords: deliveryRows, pickupRecords: pickupRows,
});

describe("Monitoring Daily detail drilldown", () => {
  it("keeps delivery detail counts, TTD, pending, weight, and achievement equal to the existing rules", () => {
    expect(build("DELIVERY_TOTAL").rows).toHaveLength(3);
    expect(build("DELIVERY_TTD").rows.map((row) => row.waybill)).toEqual(["D1", "D3"]);
    expect(build("DELIVERY_PENDING").rows.map((row) => row.waybill)).toEqual(["D2"]);
    expect(build("DELIVERY_WEIGHT").summary.deliveryWeight).toBe("4");
    expect(build("DELIVERY_ACHIEVEMENT").summary).toMatchObject({ totalDelivery: 3, totalTtd: 2, totalPending: 1 });
    expect(build("DELIVERY_ACHIEVEMENT").summary.achievement).toBeCloseTo(66.6667, 3);
  });

  it("keeps pickup revenue and weight contributors equal to settlement rules", () => {
    expect(build("PICKUP_TOTAL").rows).toHaveLength(3);
    expect(build("PICKUP_REVENUE").summary.pickupRevenue).toBe("10000");
    expect(build("PICKUP_WEIGHT").summary.pickupWeight).toBe("5");
    expect(build("PICKUP_WEIGHT").rows.map((row) => row.waybill)).toEqual(["P1", "P2"]);
  });

  it("filters by canonical team name and remains safe for zero data", () => {
    expect(build("DELIVERY_TOTAL", " team a ").rows).toHaveLength(2);
    expect(build("PICKUP_REVENUE", "TEAM A").summary.pickupRevenue).toBe("10000");
    expect(buildMonitoringDailyDetail({ businessDate: "2026-08-22", metric: "DELIVERY_TOTAL", deliveryRecords: [], pickupRecords: [] }).summary.achievement).toBe(0);
  });
});
