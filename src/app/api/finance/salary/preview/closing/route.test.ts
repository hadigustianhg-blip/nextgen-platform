import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  create: vi.fn(),
  canManage: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canManageSalaryClosing: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    createSalaryClosingFromPreview: mocks.create,
  };
});

import { POST } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["ADMIN"],
};
const valid = {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  notes: "Closing Agustus",
  requestId: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
  mocks.create.mockResolvedValue({ id: "closing-1", status: "CLOSED" });
});

describe("POST /api/finance/salary/preview/closing", () => {
  it("rejects a user without Salary Closing manage permission", async () => {
    mocks.canManage.mockReturnValueOnce(false);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(valid),
    }));
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses only tenant/outlet and actor from the active session", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...valid,
        tenantId: "tenant-other",
        outletId: "outlet-other",
      }),
    }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, valid);
  });

  it.each([
    { ...valid, startDate: "2026-09-01", endDate: "2026-08-31" },
    { ...valid, startDate: "2025-01-01", endDate: "2026-08-31" },
    { ...valid, requestId: "not-a-request-id" },
  ])("rejects invalid range or request ID %#", async (body) => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
    }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
