import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  canRead: vi.fn(() => true),
  canManage: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canReadSalarySetting: mocks.canRead,
    canManageSalarySetting: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    createSalaryProfile: mocks.create,
    listSalaryProfiles: mocks.list,
  };
});

import { GET, POST } from "./route";

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canRead.mockReturnValue(true);
  mocks.canManage.mockReturnValue(true);
  mocks.getSession.mockResolvedValue(session);
});

describe("/api/finance/salary/profiles", () => {
  it("rejects requests without session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
  });

  it("rejects users without permission", async () => {
    mocks.canRead.mockReturnValueOnce(false);
    expect((await GET()).status).toBe(403);
    mocks.canManage.mockReturnValueOnce(false);
    const response = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify(valid),
    }));
    expect(response.status).toBe(403);
  });

  it("ignores browser tenant/outlet and creates in session scope", async () => {
    mocks.create.mockResolvedValueOnce({ id: "profile-1" });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
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
    }, expect.objectContaining({
      code: "DRIVER-2026",
      name: "Driver 2026",
    }));
  });
});
