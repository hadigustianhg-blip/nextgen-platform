import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), deliveryScope: vi.fn(), canView: vi.fn(), getDetail: vi.fn(),
  schema: { safeParse: vi.fn() },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/delivery-settlement", () => ({ deliveryScope: mocks.deliveryScope }));
vi.mock("@/modules/quality-control", () => ({
  canViewPickupSchedulingSensitive: mocks.canView,
  getPickupSchedulingDetail: mocks.getDetail,
  pickupSchedulingSyncSchema: mocks.schema,
}));

import { GET } from "./route";

const request = () => new Request(
  "http://localhost/api/quality-control/pickup-scheduling/records/row-1/detail?startDate=2026-08-20&endDate=2026-08-23",
  { headers: { "x-request-id": "request-1" } },
);
const context = { params: Promise.resolve({ rowId: "row-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: "user", outletCode: "DEV001" });
  mocks.deliveryScope.mockReturnValue({ tenantId: "tenant", outletId: "outlet" });
  mocks.canView.mockReturnValue(true);
  mocks.schema.safeParse.mockReturnValue({
    success: true, data: { startDate: "2026-08-20", endDate: "2026-08-23" },
  });
  mocks.getDetail.mockResolvedValue({ rowId: "row-1", senderMobilePhone: "081234567890", orders: [] });
});

describe("pickup scheduling row detail route", () => {
  it("passes the selected row through authenticated tenant/outlet scope", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.getDetail).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant", outletId: "outlet", actorId: "user", rowId: "row-1", requestId: "request-1",
    }));
  });

  it("preserves authentication, permission, and outlet guards", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.canView.mockReturnValueOnce(false);
    expect((await GET(request(), context)).status).toBe(403);
    mocks.deliveryScope.mockReturnValueOnce(null);
    expect((await GET(request(), context)).status).toBe(400);
  });

  it("maps a row outside the scoped real-source dataset to safe 404", async () => {
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("missing"), { code: "NOT_FOUND" }));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "ROW_NOT_FOUND" } });
  });
});
