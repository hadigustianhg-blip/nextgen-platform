import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  update: vi.fn(),
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
    updateSalaryProfile: mocks.update,
  };
});

import { PATCH } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["ADMIN"],
};
const valid = {
  code: "DRIVER-2026",
  name: "Driver 2026",
  division: "DRIVER",
  effectiveFrom: "2026-08-01",
  effectiveTo: null,
  version: 1,
};
const context = { params: Promise.resolve({ id: "profile-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
});

describe("PATCH /api/finance/salary/profiles/:id", () => {
  it("rejects users without salary setting permission", async () => {
    mocks.canManage.mockReturnValueOnce(false);
    const response = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(valid),
    }), context);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses only the tenant and outlet from the active session", async () => {
    mocks.update.mockResolvedValueOnce({ id: "profile-1" });
    const response = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({
        ...valid,
        tenantId: "tenant-other",
        outletId: "outlet-other",
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "profile-1", expect.objectContaining(valid));
  });
});
