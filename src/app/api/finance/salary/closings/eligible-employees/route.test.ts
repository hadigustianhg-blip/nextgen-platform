import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canManage: vi.fn(() => true),
  eligible: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>("@/modules/salary");
  return {
    ...actual,
    canManageSalaryClosing: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    listEligibleSalaryClosingEmployees: mocks.eligible,
  };
});

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ tenantId: "tenant-1", outletId: "outlet-1" });
  mocks.canManage.mockReturnValue(true);
  mocks.eligible.mockResolvedValue([]);
});

describe("GET eligible Salary Closing employees", () => {
  it("uses the session tenant/outlet scope and date-only period", async () => {
    const response = await GET(new Request(
      "http://localhost/api/finance/salary/closings/eligible-employees?startDate=2026-09-01&endDate=2026-09-30",
    ));
    expect(response.status).toBe(200);
    expect(mocks.eligible).toHaveBeenCalledWith(
      { tenantId: "tenant-1", outletId: "outlet-1" },
      { startDate: "2026-09-01", endDate: "2026-09-30" },
    );
  });

  it("rejects an invalid period before querying employees", async () => {
    const response = await GET(new Request(
      "http://localhost/api/finance/salary/closings/eligible-employees?startDate=2026-09-30&endDate=2026-09-01",
    ));
    expect(response.status).toBe(400);
    expect(mocks.eligible).not.toHaveBeenCalled();
  });
});
