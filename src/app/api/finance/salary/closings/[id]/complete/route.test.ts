import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  complete: vi.fn(),
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
    completeSalaryClosing: mocks.complete,
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
const context = { params: Promise.resolve({ id: "closing-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
  mocks.complete.mockResolvedValue({ id: "closing-1", status: "COMPLETED" });
});

describe("POST /api/finance/salary/closings/:id/complete", () => {
  it("rejects a role without closing management permission", async () => {
    mocks.canManage.mockReturnValueOnce(false);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
    }), context);
    expect(response.status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("uses only session tenant/outlet and actor", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "closing-1");
  });
});
