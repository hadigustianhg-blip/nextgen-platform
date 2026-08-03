import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canRead: vi.fn(() => true),
  createShare: vi.fn(),
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
  };
});
vi.mock("@/modules/salary/salary.publication-share.service", () => ({
  createSalaryPublicationShare: mocks.createShare,
}));

import { POST } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  userId: "user-1",
  roles: ["VIEWER"],
};
const context = {
  params: Promise.resolve({ id: "closing-1", employeeId: "employee-yudi" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canRead.mockReturnValue(true);
  mocks.createShare.mockResolvedValue({
    publicUrl: "https://app.example.test/salary-card/share/token",
    message: "Halo Bpk/Ibu YUDI MULYADI",
    expiresAt: new Date("2026-09-02T00:00:00.000Z"),
  });
});

describe("POST Salary publication share", () => {
  it("requires session and Salary Recap permission", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(new Request("https://app.test/api/share"), context)).status)
      .toBe(401);
    mocks.canRead.mockReturnValueOnce(false);
    expect((await POST(new Request("https://app.test/api/share"), context)).status)
      .toBe(403);
    expect(mocks.createShare).not.toHaveBeenCalled();
  });

  it("uses route employee and session scope without changing Salary state", async () => {
    const request = new Request("https://app.example.test/api/share", {
      method: "POST",
    });
    const response = await POST(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("private, no-store, max-age=0");
    expect(mocks.createShare).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", outletId: "outlet-1" },
      closingId: "closing-1",
      closingEmployeeId: "employee-yudi",
      requestUrl: "https://app.example.test/api/share",
    });
    expect(JSON.stringify(await response.json())).not.toContain("tenant-1");
  });
});
