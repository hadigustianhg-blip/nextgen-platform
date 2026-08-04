import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pickupFindMany: vi.fn(),
  getActiveDispatchDataset: vi.fn(),
  getActiveDispatchRecords: vi.fn(),
  getEffectiveOperationalTargets: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { rawPickup: { findMany: mocks.pickupFindMany } } }));
vi.mock("@/modules/delivery-settlement/active-dispatch-dataset", () => ({
  getActiveDispatchDataset: mocks.getActiveDispatchDataset,
  getActiveDispatchRecords: mocks.getActiveDispatchRecords,
}));
vi.mock("@/modules/settings/target-kpi.service", () => ({
  getEffectiveOperationalTargets: mocks.getEffectiveOperationalTargets,
}));

import { getMonitoringDaily } from "./monitoring-daily.service";
import { getMonitoringMonthly } from "./monitoring-monthly.service";

const targets = {
  achievementDeliveryTarget: { value: 97, source: "CUSTOM" },
  pendingMaximum: { value: null, source: "UNSET" },
  slaTarget: { value: 95, source: "CANONICAL" },
  pickupRevenueTarget: { value: null, source: "UNSET" },
  pickupWeightTarget: { value: null, source: "UNSET" },
  waybillStuckMaximum: { value: null, source: "UNSET" },
};

describe("Monitoring effective target integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pickupFindMany.mockResolvedValue([]);
    mocks.getActiveDispatchDataset.mockResolvedValue([]);
    mocks.getActiveDispatchRecords.mockResolvedValue([]);
    mocks.getEffectiveOperationalTargets.mockResolvedValue(targets);
  });

  it("uses a custom Achievement target in Monitoring Daily without changing metrics", async () => {
    const result = await getMonitoringDaily({
      tenantId: "tenant-1", outletId: "outlet-1", businessDate: "2026-08-01",
      deliveryPage: 1, pickupPage: 1, pageSize: 10,
    });
    expect(result.target).toBe(97);
    expect(result.targetSource).toBe("CUSTOM");
    expect(result.summary).toMatchObject({ totalDelivery: 0, totalTtd: 0, totalPending: 0, pickupRevenue: "0" });
  });

  it("uses the same custom target in Monitoring Monthly", async () => {
    const result = await getMonitoringMonthly({
      tenantId: "tenant-1", outletId: "outlet-1", startDate: "2026-08-01", endDate: "2026-08-31",
      deliveryPage: 1, pickupPage: 1, pageSize: 10,
    });
    expect(result.target).toBe(97);
    expect(result.targetSource).toBe("CUSTOM");
    expect(result.summary.totalDelivery).toBe(0);
  });
});
