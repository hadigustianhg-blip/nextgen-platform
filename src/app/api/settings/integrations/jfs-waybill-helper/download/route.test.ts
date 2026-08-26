import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessResource: vi.fn(),
  resolveJfsHelperDistribution: vi.fn(),
  loadJfsHelperArchive: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ canAccessResource: mocks.canAccessResource }));
vi.mock("@/modules/integrations/jfs-helper-distribution", () => ({
  resolveJfsHelperDistribution: mocks.resolveJfsHelperDistribution,
  loadJfsHelperArchive: mocks.loadJfsHelperArchive,
}));

import { GET } from "./route";

describe("GET /api/settings/integrations/jfs-waybill-helper/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ tenantId: "tenant-1", outletId: "outlet-1", roles: ["OWNER"] });
    mocks.canAccessResource.mockReturnValue(true);
    mocks.resolveJfsHelperDistribution.mockReturnValue({ archiveName: "nextgen-jfs-helper-dev.zip", badge: "DEV Extension", environment: "development" });
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

  it("serves the production filename when the canonical environment is production", async () => {
    const production = { archiveName: "nextgen-jfs-helper.zip", badge: "Production Extension", environment: "production" };
    mocks.resolveJfsHelperDistribution.mockReturnValue(production);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="nextgen-jfs-helper.zip"');
    expect(mocks.loadJfsHelperArchive).toHaveBeenCalledWith(production);
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

  it("fails closed outside an explicit supported environment", async () => {
    mocks.resolveJfsHelperDistribution.mockReturnValue(null);
    expect((await GET()).status).toBe(404);
    expect(mocks.loadJfsHelperArchive).not.toHaveBeenCalled();
  });
});
