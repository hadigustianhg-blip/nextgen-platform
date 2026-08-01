import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  list: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/delivery-settlement", () => ({
  deliveryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
}));
vi.mock("@/modules/quality-control", async () => {
  const actual = await vi.importActual<typeof import("@/modules/quality-control")>(
    "@/modules/quality-control",
  );
  return {
    ...actual,
    canReadWaybillStuck: () => true,
    listWaybillStuckDelivery: mocks.list,
  };
});

import { GET } from "./route";

describe("GET /api/quality-control/waybill-stuck-delivery", () => {
  it("passes currentScanType and all existing filters through scoped validation", async () => {
    mocks.getSession.mockResolvedValueOnce({ roles: ["VIEWER"] });
    mocks.list.mockResolvedValueOnce({
      data: [], availableCurrentScanTypes: [{ value: "inbound", label: "Inbound" }],
      summary: {}, pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    });
    const params = new URLSearchParams({
      businessDate: "2026-08-01", waybill: "WB1", customer: "Customer",
      goodsName: "Goods", currentScanSite: "SUM", currentScanType: "Inbound",
      problem: "Problem", void: "false", page: "2", pageSize: "10",
    });
    const response = await GET(new Request(
      `http://localhost/api/quality-control/waybill-stuck-delivery?${params}`,
    ));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      tenantId: "tenant-1", outletId: "outlet-1", businessDate: "2026-08-01",
      waybill: "WB1", customer: "Customer", goodsName: "Goods",
      currentScanSite: "SUM", currentScanType: "Inbound", problem: "Problem",
      void: "false", page: 2, pageSize: 10,
    });
  });

  it("accepts the default all-types value as an empty parameter", async () => {
    mocks.getSession.mockResolvedValueOnce({ roles: ["VIEWER"] });
    mocks.list.mockResolvedValueOnce({ data: [] });
    const response = await GET(new Request(
      "http://localhost/api/quality-control/waybill-stuck-delivery?businessDate=2026-08-01&currentScanType=",
    ));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      currentScanType: "", page: 1, pageSize: 20,
    }));
  });
});
