import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  deliveryScope: vi.fn(),
  canView: vi.fn(),
  getDetail: vi.fn(),
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
  "http://localhost/api/quality-control/pickup-scheduling/groups/group-1/detail?startDate=2026-07-27&endDate=2026-07-30",
  { headers: { "x-request-id": "request-1" } },
);
const context = { params: Promise.resolve({ groupId: "group-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: "user", outletCode: "OUT001" });
  mocks.deliveryScope.mockReturnValue({ tenantId: "tenant", outletId: "outlet" });
  mocks.canView.mockReturnValue(true);
  mocks.schema.safeParse.mockReturnValue({
    success: true,
    data: { startDate: "2026-07-27", endDate: "2026-07-30" },
  });
  mocks.getDetail.mockResolvedValue({
    requestId: "request-1",
    groupId: "group-1",
    senderName: "Sender",
    senderMobilePhone: "081234567890",
    senderCityName: "Bandung",
    outletCode: "OUT001",
    details: [{
      waybill: "WB-1", senderName: "Sender", senderMobilePhone: "081234567890",
      senderCityName: "Bandung", status: "success", errorCode: null,
    }],
    orders: [{ waybill: "WB-1", source: "JFS", goodsName: null }],
  });
});

describe("pickup scheduling group detail route", () => {
  it("returns the minimal scoped detail contract with private no-store", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toMatchObject({
      groupId: "group-1",
      senderName: "Sender",
      senderMobilePhone: "081234567890",
      details: [{ waybill: "WB-1", status: "success" }],
    });
    expect(mocks.getDetail).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      groupId: "group-1", requestId: "request-1",
    }));
  });

  it("preserves authentication, authorization, and outlet scope checks", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.canView.mockReturnValueOnce(false);
    expect((await GET(request(), context)).status).toBe(403);
    mocks.deliveryScope.mockReturnValueOnce(null);
    expect((await GET(request(), context)).status).toBe(400);
  });

  it("maps a missing scoped group to 404 without leaking upstream details", async () => {
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("missing"), { code: "NOT_FOUND" }));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "GROUP_NOT_FOUND" } });
  });
});
