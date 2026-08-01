import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSettlement: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/payment", async () => {
  const actual = await vi.importActual<typeof import("@/modules/payment")>(
    "@/modules/payment",
  );
  return {
    ...actual,
    canReadPaymentSettlement: () => true,
    paymentSettlementScope: () => ({
      tenantId: "tenant-a",
      outletId: "10000000-0000-4000-8000-000000000001",
    }),
    getPaymentSettlement: mocks.getSettlement,
  };
});

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/payment-settlement", () => {
  it("passes the selected month, year, and closing filter into the trusted scope", async () => {
    mocks.getSession.mockResolvedValueOnce({ roles: ["VIEWER"] });
    mocks.getSettlement.mockResolvedValueOnce({ summary: { bankBalance: "1200000" } });
    const response = await GET(new Request(
      "http://localhost/api/payment-settlement?month=8&year=2026&closingStatus=CLOSED&outletId=10000000-0000-4000-8000-000000000001",
    ));
    expect(response.status).toBe(200);
    expect(mocks.getSettlement).toHaveBeenCalledWith(
      { tenantId: "tenant-a", outletId: "10000000-0000-4000-8000-000000000001" },
      { month: 8, year: 2026, outletId: "10000000-0000-4000-8000-000000000001", closingStatus: "CLOSED" },
    );
  });

  it("rejects a browser-supplied outlet that differs from the active outlet", async () => {
    mocks.getSession.mockResolvedValueOnce({ roles: ["VIEWER"] });
    const response = await GET(new Request(
      "http://localhost/api/payment-settlement?month=8&year=2026&outletId=20000000-0000-4000-8000-000000000002",
    ));
    expect(response.status).toBe(403);
    expect(mocks.getSettlement).not.toHaveBeenCalled();
  });
});
