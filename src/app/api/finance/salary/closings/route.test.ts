import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  list: vi.fn(),
  canRead: vi.fn(() => true),
  canManage: vi.fn(() => true),
  create: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canReadSalaryClosing: mocks.canRead,
    canManageSalaryClosing: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    listSalaryClosings: mocks.list,
    createSalaryClosing: mocks.create,
  };
});

import { GET, POST } from "./route";

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
  mocks.canManage.mockReturnValue(true);
  mocks.create.mockResolvedValue({ id: "closing-1", closingNumber: "SAL/CLS/OUT001/2026/09/0001" });
  mocks.list.mockResolvedValue({
    data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
});

const createRequest = (body: unknown) => new Request(
  "http://localhost/api/finance/salary/closings",
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
);

describe("POST /api/finance/salary/closings selective contract", () => {
  const base = {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    notes: null,
    employeeIds: ["11111111-1111-4111-8111-111111111111"],
    requestId: "22222222-2222-4222-8222-222222222222",
  };

  it("passes the selected roster and idempotency key to the scoped service", async () => {
    const response = await POST(createRequest(base));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", outletId: "outlet-1",
    }), base);
  });

  it("rejects zero selected employees", async () => {
    const response = await POST(createRequest({ ...base, employeeIds: [] }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate employee IDs", async () => {
    const employeeId = base.employeeIds[0];
    const response = await POST(createRequest({ ...base, employeeIds: [employeeId, employeeId] }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
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
