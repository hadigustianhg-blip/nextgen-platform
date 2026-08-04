import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  operationalScope: vi.fn(),
  canRead: vi.fn(),
  canManage: vi.fn(),
  schema: { safeParse: vi.fn() },
  read: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/operational-settlement", () => ({ operationalScope: mocks.operationalScope }));
vi.mock("@/modules/finance", () => ({
  financeRangeSchema: mocks.schema,
  JfsCashflowError: class JfsCashflowError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  readJfsCashflow: mocks.read,
  runJfsCashflowSync: mocks.sync,
}));
vi.mock("@/modules/profit-loss", () => ({
  canReadProfitLoss: mocks.canRead,
  canManageProfitLoss: mocks.canManage,
}));

import { GET, POST } from "./route";

const range = { startDate: "2026-08-01", endDate: "2026-08-01" };
const result = {
  income: [], expense: [], summary: { totalIncome: 0, totalExpense: 0, difference: 0 },
  receivedAt: "", lastSync: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: "user-1", roles: ["ADMIN"] });
  mocks.canRead.mockReturnValue(true);
  mocks.canManage.mockReturnValue(true);
  mocks.operationalScope.mockReturnValue({ tenantId: "tenant-1", outletId: "outlet-1" });
  mocks.schema.safeParse.mockReturnValue({ success: true, data: range });
  mocks.read.mockResolvedValue(result);
  mocks.sync.mockResolvedValue({ fetchedCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0 });
});

describe("Cashflow JFS check route", () => {
  it("GET reads the database with session tenant/outlet scope", async () => {
    const response = await GET(new Request("http://localhost/api/finance/cashflow-jfs/check?startDate=2026-08-01&endDate=2026-08-01"));
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ tenantId: "tenant-1", outletId: "outlet-1", ...range });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("POST syncs manually then reads the persisted dataset", async () => {
    const response = await POST(new Request("http://localhost/api/finance/cashflow-jfs/check", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(range),
    }));
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1", triggerSource: "MANUAL",
    }));
    expect(mocks.read.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.sync.mock.invocationCallOrder[0]);
  });

  it("enforces session, permission, and selected outlet", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost"))).status).toBe(401);
    mocks.canRead.mockReturnValueOnce(false);
    expect((await GET(new Request("http://localhost"))).status).toBe(403);
    mocks.operationalScope.mockReturnValueOnce(null);
    expect((await GET(new Request("http://localhost"))).status).toBe(400);
  });
});
