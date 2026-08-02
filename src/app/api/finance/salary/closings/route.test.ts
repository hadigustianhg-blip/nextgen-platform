import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  list: vi.fn(),
  canRead: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canReadSalaryClosing: mocks.canRead,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    listSalaryClosings: mocks.list,
  };
});

import { GET } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["VIEWER"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canRead.mockReturnValue(true);
  mocks.list.mockResolvedValue({
    data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
});

describe("GET /api/finance/salary/closings filters", () => {
  it("defaults to ACTIVE so VOID is hidden in the backend", async () => {
    const response = await GET(new Request(
      "http://localhost/api/finance/salary/closings",
    ));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      tenantId: "tenant-1", outletId: "outlet-1",
    }, { statusFilter: "ACTIVE", page: 1, pageSize: 25 });
  });

  it.each(["ALL", "REVIEW", "SUCCESS", "DRAFT", "VOID"])(
    "passes validated filter %s to the backend",
    async (statusFilter) => {
      const response = await GET(new Request(
        `http://localhost/api/finance/salary/closings?statusFilter=${statusFilter}&page=2&pageSize=10`,
      ));
      expect(response.status).toBe(200);
      expect(mocks.list).toHaveBeenCalledWith({
        tenantId: "tenant-1", outletId: "outlet-1",
      }, { statusFilter, page: 2, pageSize: 10 });
    },
  );

  it("rejects an unknown free-form status", async () => {
    const response = await GET(new Request(
      "http://localhost/api/finance/salary/closings?statusFilter=DELETED",
    ));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
