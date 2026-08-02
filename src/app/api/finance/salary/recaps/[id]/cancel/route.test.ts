import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canManage: vi.fn(() => true),
  cancel: vi.fn(),
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
    cancelSalaryRecap: mocks.cancel,
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
const request = (reason = "Nominal perlu diperiksa kembali") => new Request(
  "http://localhost/api/finance/salary/recaps/closing-1/cancel",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canManage.mockReturnValue(true);
  mocks.cancel.mockResolvedValue({ id: "closing-1", status: "CLOSED" });
});

describe("POST /api/finance/salary/recaps/:id/cancel", () => {
  it("requires session and Owner/Admin permission", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request(), context)).status).toBe(401);
    mocks.canManage.mockReturnValueOnce(false);
    expect((await POST(request(), context)).status).toBe(403);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid cancellation reason", async () => {
    expect((await POST(request("x"), context)).status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("uses only tenant, outlet and actor identity from the session", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "closing-1", "Nominal perlu diperiksa kembali");
  });
});
