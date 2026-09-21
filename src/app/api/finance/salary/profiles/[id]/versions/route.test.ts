import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createVersion: vi.fn(),
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
    createSalaryProfileVersion: mocks.createVersion,
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
  code: "DRIVER-2026",
  name: "Driver 2026",
  division: "DRIVER",
  effectiveFrom: "2026-09-15",
  effectiveTo: null,
  version: 2,
};
const context = { params: Promise.resolve({ id: "profile-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
});

describe("POST /api/finance/salary/profiles/:id/versions", () => {
  it("requires Salary Setting permission", async () => {
    mocks.canManage.mockReturnValueOnce(false);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(valid),
    }), context);
    expect(response.status).toBe(403);
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });

  it("creates a version only inside the active session scope", async () => {
    mocks.createVersion.mockResolvedValueOnce({ id: "profile-2" });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        ...valid,
        tenantId: "other-tenant",
        outletId: "other-outlet",
      }),
    }), context);
    expect(response.status).toBe(201);
    expect(mocks.createVersion).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "profile-1", expect.objectContaining(valid));
  });
});
