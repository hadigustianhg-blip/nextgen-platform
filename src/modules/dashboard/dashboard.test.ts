import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  dashboardOverviewQuerySchema,
  getDashboardOverview,
  type DashboardLoaders,
} from ".";

const period = { startDate: "2026-08-01", endDate: "2026-08-31" };
const scope = { tenantId: "tenant-a", outletId: "outlet-a" };
const targets = {
  achievementDeliveryTarget: { value: 97, source: "CUSTOM" as const },
  pendingMaximum: { value: null, source: "UNSET" as const },
  slaTarget: { value: 96, source: "CUSTOM" as const },
  pickupRevenueTarget: { value: null, source: "UNSET" as const },
  pickupWeightTarget: { value: null, source: "UNSET" as const },
  waybillStuckMaximum: { value: null, source: "UNSET" as const },
};
const targetLoader = vi.fn(async () => targets);

function fixtures(): DashboardLoaders {
  return {
    monitoring: vi.fn(async () => ({ data: {
      target: 95,
      pendingMaximum: null,
      pickupRevenueTarget: null,
      pickupWeightTarget: null,
      summary: { achievement: 96, totalTtd: 96, totalPending: 4, pickupRevenue: "1000", pickupWeight: "25" },
      daily: [{ date: "2026-08-01", achievement: 96, target: 95, totalTtd: 96, pending: 4, pickupRevenue: "1000", pickupWeight: "25" }],
    } })),
    deliverySettlement: vi.fn(async () => ({ data: {
      summary: { codCash: "200", codQris: "30", dfod: "50", totalSettlement: "250" },
      daily: [{ date: "2026-08-01", codCash: "200", codQris: "30", dfod: "50", totalSettlement: "250" }],
    } })),
    operationalSettlement: vi.fn(async () => ({ data: {
      summary: { cashReceived: "175", cashAvailable: "150", operationalExpense: "25", outstanding: "75" },
      daily: [{ date: "2026-08-01", cashReceived: "175", cashAvailable: "150", operationalExpense: "25", outstanding: "75" }],
    } })),
    paymentSettlement: vi.fn(async () => ({ data: {
      cashOnHand: "150",
      daily: [{ date: "2026-08-01", cashOnHand: "150" }],
    } })),
    pickupPayment: vi.fn(async () => ({ data: {
      summary: { outstanding: "75", outstandingWaybills: 3, overdueOver7: 1, notOverdue: 2 },
    } })),
    sla: vi.fn(async () => ({ data: {
      target: 95,
      averageSla: 97,
      daily: [{ date: "2026-08-01", sla: 97, target: 95 }],
    } })),
    stuckDelivery: vi.fn(async () => ({ data: {
      totalInventory: 8,
      waybillStuckMaximum: null,
      daily: [{ date: "2026-08-01", totalInventory: 8 }],
    } })),
  };
}

describe("Operational executive dashboard", () => {
  it("mirrors every source contract without changing card values", async () => {
    const result = await getDashboardOverview(scope, period, fixtures(), targetLoader);
    expect(result.monitoring.status === "success" && result.monitoring.data.summary)
      .toMatchObject({ achievement: 96, totalTtd: 96, totalPending: 4, pickupRevenue: "1000", pickupWeight: "25" });
    expect(result.deliverySettlement.status === "success" && result.deliverySettlement.data.summary)
      .toEqual({ codCash: "200", codQris: "30", dfod: "50", totalSettlement: "250" });
    expect(result.operationalSettlement.status === "success" && result.operationalSettlement.data.summary)
      .toEqual({ cashReceived: "175", cashAvailable: "150", operationalExpense: "25", outstanding: "75" });
    expect(result.paymentSettlement.status === "success" && result.paymentSettlement.data.cashOnHand).toBe("150");
    expect(result.pickupPayment.status === "success" && result.pickupPayment.data.summary)
      .toMatchObject({ outstanding: "75", overdueOver7: 1 });
    expect(result.sla.status === "success" && result.sla.data.averageSla).toBe(97);
    expect(result.stuckDelivery.status === "success" && result.stuckDelivery.data.totalInventory).toBe(8);
  });

  it("passes tenant, outlet, and period to every source loader", async () => {
    const loaders = fixtures();
    await getDashboardOverview(scope, period, loaders, targetLoader);
    for (const loader of Object.values(loaders)) {
      expect(loader).toHaveBeenCalledWith(scope, period, targets);
    }
  });

  it("isolates a failed source while retaining every other section", async () => {
    const loaders = fixtures();
    loaders.deliverySettlement = vi.fn(async () => { throw new Error("private upstream detail"); });
    const result = await getDashboardOverview(scope, period, loaders, targetLoader);
    expect(result.deliverySettlement).toEqual({
      status: "error",
      data: null,
      updatedAt: null,
      error: { code: "SOURCE_UNAVAILABLE", message: "Data sumber belum dapat dimuat." },
    });
    expect(result.monitoring.status).toBe("success");
    expect(result.operationalSettlement.status).toBe("success");
  });

  it("defaults dates and rejects reversed or longer-than-366-day periods", () => {
    expect(dashboardOverviewQuerySchema.safeParse({ startDate: "2026-08-31", endDate: "2026-08-01" }).success).toBe(false);
    expect(dashboardOverviewQuerySchema.safeParse({ startDate: "2025-08-01", endDate: "2026-08-02" }).success).toBe(false);
    expect(dashboardOverviewQuerySchema.safeParse({ startDate: "2025-08-03", endDate: "2026-08-03" }).success).toBe(true);
    expect(dashboardOverviewQuerySchema.parse({})).toHaveProperty("startDate");
  });

  it("is read-only and follows the refined dashboard visualization contract", async () => {
    const service = await readFile(new URL("./dashboard.service.ts", import.meta.url), "utf8");
    const client = await readFile(new URL("../../components/dashboard/dashboard-overview-client.tsx", import.meta.url), "utf8");
    const monitoringIndex = client.indexOf('title="Monitoring Performance"');
    const slaIndex = client.indexOf('title="SLA Cut Off"');
    const stuckIndex = client.indexOf('title="Waybill Stuck Delivery"');
    const deliveryIndex = client.indexOf('title="Delivery Settlement"');
    const operationalIndex = client.indexOf('title="Operational Settlement"');
    const paymentIndex = client.indexOf('title="Payment Settlement"');
    const pickupIndex = client.indexOf('title="Pickup Payment"');
    expect(service).not.toMatch(/prisma\.[A-Za-z]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(service).not.toContain("prisma.$transaction");
    expect(monitoringIndex).toBeGreaterThan(-1);
    expect(slaIndex).toBeGreaterThan(monitoringIndex);
    expect(stuckIndex).toBeGreaterThan(slaIndex);
    expect(deliveryIndex).toBeGreaterThan(stuckIndex);
    expect(operationalIndex).toBeGreaterThan(deliveryIndex);
    expect(paymentIndex).toBeGreaterThan(operationalIndex);
    expect(pickupIndex).toBeGreaterThan(paymentIndex);
    expect(client.match(/<Donut\s/g)).toHaveLength(1);
    expect(client.match(/variant="bar"/g)).toHaveLength(3);
    expect(client.match(/<MonitoringKpi\s/g)).toHaveLength(5);
    expect(client.match(/<DashboardMetricCard\s/g)).toHaveLength(11);
    expect(client).toContain('className="dashboard-metric-card flex h-auto min-h-28');
    expect(client).toContain('section-frame h-full min-h-0 min-w-0 overflow-visible');
    expect(client).toContain('className="grid items-stretch gap-5 xl:grid-cols-2"');
    expect(client).toContain("<PackageSearch size={42}");
    expect(client).toContain("icon={Gauge}");
    expect(client).toContain("xl:grid-cols-5");
    expect(client).toContain("dashboard-analytics-grid");
    expect(client).toContain("grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)");
    expect(client).toContain("dashboard-monitoring-panel md:col-span-2");
    expect(client).toContain('role="tablist"');
    expect(client).toContain('role="tab"');
    expect(client).toContain('aria-selected={monitoringChart === key}');
    expect(client).toContain("nextgen-dashboard-pattern");
    expect(client).toContain("var(--nextgen-primary)");
    expect(client).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(client).toContain("setPresentationKey((value) => value + 1)");
    expect(client).toContain("key={presentationKey}");
    expect(client).toContain('loading && !result ? <SkeletonDashboard /> : result');
    expect(client).toContain('new URLSearchParams({ startDate, endDate, _: String(refreshKey) })');
    expect(client).toContain('fetch(`/api/dashboard/overview?${query}`, { cache: "no-store" })');
    expect(client).toContain("@keyframes dashboard-card-in");
    expect(client).not.toMatch(/animation[^;]*infinite/);
    expect(client).toContain("prefers-reduced-motion: reduce");
    expect(client).toContain("isAnimationActive={!reducedMotion}");
    expect(client.slice(stuckIndex, deliveryIndex)).not.toContain("<DashboardChart");
    expect(client.slice(stuckIndex, deliveryIndex)).toContain('stuck.totalInventory === 0');
    expect(client.slice(stuckIndex, deliveryIndex)).toContain('<EmptyState kind="monitoring"');
    expect(client.slice(paymentIndex, pickupIndex)).not.toContain("absolute");
    expect(client.slice(paymentIndex, pickupIndex)).not.toContain("overflow-hidden");
    expect(client.slice(slaIndex, stuckIndex)).toContain("<Donut");
    expect(client.slice(slaIndex, stuckIndex)).toContain('variant="bar" compact');
    expect(client).not.toContain("8–14 Hari");
    expect(client).toContain('"Target belum diatur"');
    expect(client).toContain("stuck.waybillStuckMaximum");
  });
});
