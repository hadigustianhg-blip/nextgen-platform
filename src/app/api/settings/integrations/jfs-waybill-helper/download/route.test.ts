import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessResource: vi.fn(),
  isDevelopmentDistributionEnabled: vi.fn(),
  loadJfsHelperArchive: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ canAccessResource: mocks.canAccessResource }));
vi.mock("@/modules/integrations/jfs-helper-distribution", () => ({
  JFS_HELPER_ARCHIVE_NAME: "nextgen-jfs-helper-dev.zip",
  isDevelopmentDistributionEnabled: mocks.isDevelopmentDistributionEnabled,
  loadJfsHelperArchive: mocks.loadJfsHelperArchive,
}));

import { GET } from "./route";

describe("GET /api/settings/integrations/jfs-waybill-helper/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ tenantId: "tenant-1", outletId: "outlet-1", roles: ["OWNER"] });
    mocks.canAccessResource.mockReturnValue(true);
    mocks.isDevelopmentDistributionEnabled.mockReturnValue(true);
    mocks.loadJfsHelperArchive.mockResolvedValue(Buffer.from("PK test archive"));
  });

  it("serves the private DEV ZIP to an authenticated integration reader", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="nextgen-jfs-helper-dev.zip"');
    expect(mocks.canAccessResource).toHaveBeenCalledWith(["OWNER"], "SETTINGS_INTEGRATIONS", "READ");
    expect(mocks.loadJfsHelperArchive).toHaveBeenCalledTimes(1);
  });

  it("returns 401 for anonymous callers without reading the package", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.loadJfsHelperArchive).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without integration read permission", async () => {
    mocks.canAccessResource.mockReturnValue(false);
    expect((await GET()).status).toBe(403);
    expect(mocks.loadJfsHelperArchive).not.toHaveBeenCalled();
  });

  it("fails closed outside the explicit development environment", async () => {
    mocks.isDevelopmentDistributionEnabled.mockReturnValue(false);
    expect((await GET()).status).toBe(404);
    expect(mocks.loadJfsHelperArchive).not.toHaveBeenCalled();
  });
});
