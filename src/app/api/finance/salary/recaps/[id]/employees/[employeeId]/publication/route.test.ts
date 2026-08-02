import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canRead: vi.fn(() => true),
  publication: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canReadSalaryRecap: mocks.canRead,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    getSalaryRecapEmployeePublication: mocks.publication,
  };
});

import { GET } from "./route";

const context = {
  params: Promise.resolve({ id: "closing-1", employeeId: "employee-1" }),
};
const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["VIEWER"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canRead.mockReturnValue(true);
  mocks.publication.mockResolvedValue({ employee: { id: "employee-1" } });
});

describe("GET per-team Salary Recap publication", () => {
  it("requires a session and Salary Recap permission", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost"), context)).status).toBe(401);
    mocks.canRead.mockReturnValueOnce(false);
    expect((await GET(new Request("http://localhost"), context)).status).toBe(403);
    expect(mocks.publication).not.toHaveBeenCalled();
  });

  it("uses closing, employee and active session scope", async () => {
    const response = await GET(new Request(
      "http://localhost?tenantId=other&outletId=other&employeeId=other",
    ), context);
    expect(response.status).toBe(200);
    expect(mocks.publication).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "closing-1", "employee-1");
  });
});
