import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregateDeliveryMonitoringMetrics,
  aggregatePickupMonitoringMetrics,
  summarizeMonitoringMetrics,
} from "./monitoring-metrics";

const decimal = (value: string | number) => new Prisma.Decimal(value);
const dispatch = (id: string, status: string | null, weight: string, date = "2026-08-01", team = "Team A") => ({
  operationalDate: new Date(`${date}T00:00:00Z`),
  courierNameRaw: team,
  deliveryStatusRaw: status,
  chargeWeight: decimal(weight),
  id,
});
const pickup = (id: string, settlement: string | null, freight: string, weight: string, date = "2026-08-01", staff = "Staff A") => ({
  id,
  operationalDate: new Date(`${date}T00:00:00Z`),
  waybillNo: id.replace(/-new$/, ""),
  staffNameRaw: staff,
  settlementRaw: settlement,
  freight: decimal(freight),
  weight: decimal(weight),
  sourceFetchedAt: new Date(id.endsWith("-new") ? "2026-08-01T12:00:00Z" : "2026-08-01T10:00:00Z"),
  updatedAt: new Date(id.endsWith("-new") ? "2026-08-01T12:00:00Z" : "2026-08-01T10:00:00Z"),
});

describe("shared Monitoring metrics", () => {
  it("counts weight only for canonical Penerimaan Normal with Decimal precision", () => {
    const rows = aggregateDeliveryMonitoringMetrics([
      dispatch("1", "Penerimaan Normal", "10.125"),
      dispatch("2", "  PENERIMAAN   NORMAL ", "0.025"),
      dispatch("3", "Belum diterima", "99.999"),
      dispatch("4", "Pereturan Penerimaan", "88.888"),
    ]);
    expect(rows[0]).toMatchObject({
      totalDelivery: 4,
      totalTtd: 2,
      totalPending: 2,
      deliveryWeight: "10.15",
    });
  });

  it("classifies DFOD/Tunai as regular and Bulanan as marketplace", () => {
    const rows = aggregatePickupMonitoringMetrics([
      pickup("DFOD-1", " dfod ", "10000.10", "1.125"),
      pickup("CASH-1", "TUNAI", "20000.20", "2.225"),
      pickup("MONTH-1", " bulanan ", "99999", "3.350"),
      pickup("OTHER-1", "Transfer", "88888", "9.999"),
    ]);
    expect(rows[0]).toMatchObject({
      totalWaybills: 4,
      regularRevenue: "30000.3",
      regularWeight: "3.35",
      marketplaceWeight: "3.35",
      totalWeight: "6.7",
    });
  });

  it("keeps only the deterministic final pickup waybill", () => {
    const rows = aggregatePickupMonitoringMetrics([
      pickup("WB-1", "DFOD", "100", "1"),
      pickup("WB-1-new", "Bulanan", "200", "2"),
    ]);
    expect(rows[0]).toMatchObject({
      totalWaybills: 1,
      regularRevenue: "0",
      regularWeight: "0",
      marketplaceWeight: "2",
      totalWeight: "2",
    });
  });

  it("makes monthly totals equal the sum of the shared daily rows", () => {
    const deliveryRows = aggregateDeliveryMonitoringMetrics([
      dispatch("1", "Penerimaan Normal", "1.1", "2026-08-01"),
      dispatch("2", "Penerimaan Normal", "2.2", "2026-08-02"),
      dispatch("3", "Pending", "100", "2026-08-02"),
    ]);
    const pickupRows = aggregatePickupMonitoringMetrics([
      pickup("A", "DFOD", "100.1", "1.1", "2026-08-01"),
      pickup("B", "Tunai", "200.2", "2.2", "2026-08-02"),
      pickup("C", "Bulanan", "999", "3.3", "2026-08-02"),
    ]);
    expect(summarizeMonitoringMetrics(deliveryRows, pickupRows)).toEqual({
      deliveryWeight: "3.3",
      totalPickupWaybills: 3,
      regularRevenue: "300.3",
      regularWeight: "3.3",
      marketplaceWeight: "3.3",
      totalPickupWeight: "6.6",
    });
  });

  it("keeps Daily and Monthly reads scoped without mutating raw sources", () => {
    for (const file of ["monitoring-daily.service.ts", "monitoring-monthly.service.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).toContain("tenantId: input.tenantId");
      expect(source).toContain("outletId: input.outletId");
      expect(source).toContain('syncStatus: "NORMALIZED"');
      expect(source).toContain("operationalDate");
      expect(source).toContain("prisma.rawPickup.findMany");
      expect(source).not.toMatch(/rawPickup\.(create|update|upsert|delete)/);
      expect(source).not.toContain("serviceRaw:");
    }
  });
});
