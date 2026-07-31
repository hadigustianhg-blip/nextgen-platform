import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  generate: vi.fn(),
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
    generateSalaryClosing: mocks.generate,
  };
});

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "closing-1" }) };
const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["ADMIN"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
});

describe("POST /api/finance/salary/closings/:id/generate", () => {
  it("rejects requests without session or permission", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(new Request("http://localhost"), context)).status)
      .toBe(401);
    mocks.canManage.mockReturnValueOnce(false);
    expect((await POST(new Request("http://localhost"), context)).status)
      .toBe(403);
  });

  it("uses the active session scope and prevents browser scope injection", async () => {
    mocks.generate.mockResolvedValueOnce({ id: "closing-1" });
    const response = await POST(new Request(
      "http://localhost?tenantId=other&outletId=other",
    ), context);
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "closing-1");
  });
});
