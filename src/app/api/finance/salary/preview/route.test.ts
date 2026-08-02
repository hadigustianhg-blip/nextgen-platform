import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  preview: vi.fn(),
  canRead: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>(
    "@/modules/salary",
  );
  return {
    ...actual,
    canReadSalaryClosing: mocks.canRead,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    getSalaryMonthlyPreview: mocks.preview,
  };
});

import { GET } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  userId: "user-1",
  roles: ["VIEWER"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.canRead.mockReturnValue(true);
  mocks.preview.mockResolvedValue({ summary: {}, data: [] });
});

describe("GET /api/finance/salary/preview", () => {
  it("requires the existing Salary Closing read permission", async () => {
    mocks.canRead.mockReturnValueOnce(false);
    const response = await GET(new Request(
      "http://localhost/api/finance/salary/preview?startDate=2026-08-01&endDate=2026-08-31",
    ));
    expect(response.status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("uses only session tenant/outlet and accepts a valid range", async () => {
    const response = await GET(new Request(
      "http://localhost/api/finance/salary/preview?startDate=2026-08-01&endDate=2026-08-31",
    ));
    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith({
      tenantId: "tenant-1", outletId: "outlet-1",
    }, {
      startDate: "2026-08-01", endDate: "2026-08-31",
    });
  });

  it.each([
    "startDate=2026-08-31&endDate=2026-08-01",
    "startDate=2025-01-01&endDate=2026-08-31",
    "startDate=&endDate=2026-08-31",
  ])("rejects an invalid or excessive range: %s", async (query) => {
    const response = await GET(new Request(
      `http://localhost/api/finance/salary/preview?${query}`,
    ));
    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
