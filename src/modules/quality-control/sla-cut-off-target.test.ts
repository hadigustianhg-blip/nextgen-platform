import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { rawSlaCutOff: { findMany: mocks.findMany } } }));

import { getSlaCutOff } from "./sla-cut-off.service";

describe("SLA effective target integration", () => {
  it("evaluates SLA against the supplied custom target without altering source metrics", async () => {
    mocks.findMany.mockResolvedValue([{
      businessDate: new Date("2026-08-01T00:00:00.000Z"),
      sla: 96,
      paketSampai: 100,
      sudahTandaTerima: 96,
      belumTandaTerima: 4,
      lewatSla: 0,
    }]);
    const result = await getSlaCutOff({
      tenantId: "tenant-1", outletId: "outlet-1", periodStart: "2026-08-01", periodEnd: "2026-08-31",
    }, {
      achievementDeliveryTarget: { value: 95, source: "CANONICAL" },
      pendingMaximum: { value: null, source: "UNSET" },
      slaTarget: { value: 97, source: "CUSTOM" },
      pickupRevenueTarget: { value: null, source: "UNSET" },
      pickupWeightTarget: { value: null, source: "UNSET" },
      waybillStuckMaximum: { value: null, source: "UNSET" },
    });
    expect(result.period).toMatchObject({ target: 97, targetSource: "CUSTOM" });
    expect(result.items[0]).toMatchObject({ sla: 96, status: "NOT_ACHIEVE" });
    expect(result.summary).toMatchObject({ averageSla: 96, hariAchieve: 0, hariNotAchieve: 1 });
  });
});
