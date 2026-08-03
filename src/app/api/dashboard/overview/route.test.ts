import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDashboardOverview: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/dashboard", async () => {
  const actual = await vi.importActual<typeof import("@/modules/dashboard")>("@/modules/dashboard");
  return { ...actual, getDashboardOverview: mocks.getDashboardOverview };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { GET } from "./route";

describe("GET /api/dashboard/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ tenantId: "tenant-a", outletId: "outlet-a" });
    mocks.getDashboardOverview.mockResolvedValue({ period: {}, updatedAt: "2026-08-03T00:00:00.000Z" });
  });

  it("derives scope from session and returns private JSON", async () => {
    const response = await GET(new Request("https://app.test/api/dashboard/overview?startDate=2026-08-01&endDate=2026-08-31"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getDashboardOverview).toHaveBeenCalledWith(
      { tenantId: "tenant-a", outletId: "outlet-a" },
      { startDate: "2026-08-01", endDate: "2026-08-31" },
    );
  });

  it("returns JSON for auth, outlet, validation, and unexpected errors", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://app.test/api/dashboard/overview"))).status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ tenantId: "tenant-a", outletId: null });
    expect((await GET(new Request("https://app.test/api/dashboard/overview"))).status).toBe(400);
    expect((await GET(new Request("https://app.test/api/dashboard/overview?startDate=bad&endDate=bad"))).status).toBe(400);
    mocks.getDashboardOverview.mockRejectedValueOnce(new Error("database detail"));
    const failed = await GET(new Request("https://app.test/api/dashboard/overview?startDate=2026-08-01&endDate=2026-08-31"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: { code: "DASHBOARD_REQUEST_FAILED", message: "Dashboard belum dapat dimuat." } });
  });
});
