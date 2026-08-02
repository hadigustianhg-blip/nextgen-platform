import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  remove: vi.fn(),
  canManage: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canManageSalarySetting: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    removeSalaryEmployee: mocks.remove,
  };
});

import { DELETE } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["ADMIN"],
};
const context = { params: Promise.resolve({ employeeId: "employee-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
});

describe("DELETE /api/finance/salary/team/:employeeId", () => {
  it("rejects roles without Salary Setting permission", async () => {
    mocks.canManage.mockReturnValueOnce(false);
    const response = await DELETE(new Request("http://localhost", {
      method: "DELETE",
    }), context);
    expect(response.status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("uses only session tenant/outlet scope", async () => {
    mocks.remove.mockResolvedValueOnce({
      id: "employee-1", action: "DEACTIVATED",
      message: "Data dipertahankan karena sudah memiliki histori.",
    });
    const response = await DELETE(new Request("http://localhost", {
      method: "DELETE",
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "employee-1");
  });
});
