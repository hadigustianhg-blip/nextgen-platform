import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listCashFlow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/payment", async () => {
  const actual = await vi.importActual<typeof import("@/modules/payment")>(
    "@/modules/payment",
  );
  return {
    ...actual,
    canReadCashFlow: () => true,
    cashFlowScope: () => ({ tenantId: "tenant-a", outletId: "outlet-a" }),
    listCashFlow: mocks.listCashFlow,
  };
});

import { GET } from "./route";

describe("GET /api/cash-flow", () => {
  const result = {
    data: [],
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    summary: {
      cashOnHand: "0", bankBalance: "0", monthlyIncome: "0", monthlyExpense: "0",
    },
  };

  it("accepts an empty query so the service can apply the backend month default", async () => {
    mocks.getSession.mockResolvedValueOnce({ roles: ["ADMIN"] });
    mocks.listCashFlow.mockResolvedValueOnce(result);
    const response = await GET(new Request("http://localhost/api/cash-flow"));
    expect(response.status).toBe(200);
    expect(mocks.listCashFlow).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", outletId: "outlet-a", page: 1, pageSize: 25,
      startDate: "", endDate: "",
    }));
  });

  it("passes manual dates and all existing filters through validation", async () => {
    mocks.getSession.mockResolvedValueOnce({ roles: ["ADMIN"] });
    mocks.listCashFlow.mockResolvedValueOnce(result);
    const params = new URLSearchParams({
      startDate: "2026-07-01", endDate: "2026-07-31", direction: "IN",
      channel: "CASH", movementType: "PICKUP_PAYMENT", reference: "PAY-1",
      search: "pickup", page: "2", pageSize: "10",
    });
    const response = await GET(new Request(`http://localhost/api/cash-flow?${params}`));
    expect(response.status).toBe(200);
    expect(mocks.listCashFlow).toHaveBeenLastCalledWith({
      tenantId: "tenant-a", outletId: "outlet-a",
      startDate: "2026-07-01", endDate: "2026-07-31", direction: "IN",
      channel: "CASH", movementType: "PICKUP_PAYMENT", reference: "PAY-1",
      search: "pickup", page: 2, pageSize: 10,
    });
  });
});
