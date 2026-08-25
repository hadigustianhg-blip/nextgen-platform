import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canReadPickup: vi.fn(),
  pickupScope: vi.fn(),
  resolvePickupSettlementByWaybill: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/pickup/pickup.authorization", () => ({
  canReadPickup: mocks.canReadPickup,
  pickupScope: mocks.pickupScope,
}));
vi.mock("@/modules/pickup", () => ({
  resolvePickupSettlementByWaybill: mocks.resolvePickupSettlementByWaybill,
}));

import { GET } from "./route";

const request = (waybillNo = "JP1234567890") =>
  new Request(
    `http://localhost/api/pickup/settlements/resolve-by-waybill?waybillNo=${encodeURIComponent(waybillNo)}`,
  );

describe("GET /api/pickup/settlements/resolve-by-waybill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      userId: "user-a",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      roles: ["ADMIN"],
    });
    mocks.pickupScope.mockReturnValue({
      tenantId: "tenant-a",
      outletId: "outlet-a",
    });
    mocks.canReadPickup.mockReturnValue(true);
    mocks.resolvePickupSettlementByWaybill.mockResolvedValue(null);
  });

  it("returns 401 without an authenticated session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.resolvePickupSettlementByWaybill).not.toHaveBeenCalled();
  });

  it("returns 403 when the session cannot read Pickup Settlement", async () => {
    mocks.canReadPickup.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.resolvePickupSettlementByWaybill).not.toHaveBeenCalled();
  });

  it.each(["", "invalid waybill", "JP!234"])(
    "rejects invalid waybill %j",
    async (waybillNo) => {
      const response = await GET(request(waybillNo));

      expect(response.status).toBe(400);
      expect(mocks.resolvePickupSettlementByWaybill).not.toHaveBeenCalled();
    },
  );

  it("returns the scoped minimal settlement response", async () => {
    const data = {
      pickupId: "pickup-a",
      waybillNo: "JP1234567890",
      operationalDate: new Date("2026-08-25T00:00:00.000Z"),
      staff: "Ridwan",
      sender: "Sender Test",
      freightAmount: "10000",
      settlement: {
        discountAmount: "0",
        finalObligation: "10000",
        totalPaid: "0",
        remainingAmount: "10000",
        paymentStatus: "BELUM_BAYAR",
        paymentMethod: null,
      },
    };
    mocks.resolvePickupSettlementByWaybill.mockResolvedValue(data);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        ...data,
        operationalDate: "2026-08-25T00:00:00.000Z",
      },
    });
    expect(mocks.resolvePickupSettlementByWaybill).toHaveBeenCalledWith(
      "tenant-a",
      "outlet-a",
      "JP1234567890",
    );
  });

  it("returns the stable 404 contract when the scoped pickup is unavailable", async () => {
    const response = await GET(request("JP9999999999"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "PICKUP_NOT_FOUND",
        message: "Pickup belum tersedia.",
      },
    });
  });
});
