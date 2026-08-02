import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canManage: vi.fn(() => true),
  review: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canManageSalaryAdjustment: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    reviewSalaryClosingEmployeeAdjustment: mocks.review,
  };
});

import { POST } from "./route";

const context = {
  params: Promise.resolve({ id: "closing-1", employeeId: "employee-1" }),
};
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
  mocks.review.mockResolvedValue({ status: "REVIEWED" });
});

describe("POST Salary team adjustment review", () => {
  it("requires an authenticated user with Salary permission", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(new Request("http://localhost"), context)).status).toBe(401);
    mocks.canManage.mockReturnValueOnce(false);
    expect((await POST(new Request("http://localhost"), context)).status).toBe(403);
  });

  it("uses tenant and outlet scope from the session", async () => {
    const response = await POST(new Request(
      "http://localhost?tenantId=other&outletId=other",
      { method: "POST" },
    ), context);
    expect(response.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "closing-1", "employee-1");
  });
});
