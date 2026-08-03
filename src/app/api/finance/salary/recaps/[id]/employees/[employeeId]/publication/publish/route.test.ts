import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canRead: vi.fn(() => true),
  publish: vi.fn(),
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
  markSalaryPublicationPublished: mocks.publish,
}));

import { PATCH } from "./route";

const context = {
  params: Promise.resolve({ id: "closing-1", employeeId: "employee-1" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    tenantId: "tenant-1",
    outletId: "outlet-1",
    userId: "user-1",
    roles: ["VIEWER"],
  });
  mocks.canRead.mockReturnValue(true);
  mocks.publish.mockResolvedValue({
    publicationStatus: "PUBLISHED",
    publishedAt: new Date("2026-08-03T03:18:00.000Z"),
    publishedByUserId: "user-1",
  });
});

describe("PATCH Salary publication status", () => {
  it("requires session and Salary Recap access", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await PATCH(new Request("https://app.test"), context)).status)
      .toBe(401);
    mocks.canRead.mockReturnValueOnce(false);
    expect((await PATCH(new Request("https://app.test"), context)).status)
      .toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("publishes the scoped team with the session user", async () => {
    const response = await PATCH(new Request("https://app.test", {
      method: "PATCH",
    }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control"))
      .toBe("private, no-store, max-age=0");
    expect(mocks.publish).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-1", outletId: "outlet-1" },
      closingId: "closing-1",
      closingEmployeeId: "employee-1",
      publishedByUserId: "user-1",
    });
  });
});
