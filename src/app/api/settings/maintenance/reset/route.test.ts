import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSettingsApi: vi.fn(),
  resetMaintenanceCandidate: vi.fn(),
  settingsApiError: vi.fn(),
}));

vi.mock("@/modules/settings", async () => {
  const { z } = await import("zod");
  return {
    requireSettingsApi: mocks.requireSettingsApi,
    resetMaintenanceCandidate: mocks.resetMaintenanceCandidate,
    settingsApiError: mocks.settingsApiError,
    maintenanceResetSchema: z.object({
      candidateKey: z.enum(["salaryClosingVoid", "salaryPublicationShareExpired", "salaryPublicationShareRevoked", "profitLossManualVoid", "profitLossAdjustmentVoid", "oldSyncRuns", "salaryRecapTest"]),
      reason: z.string().trim().min(10).max(500),
      confirmation: z.literal("RESET"),
      previewToken: z.string().min(20),
    }),
  };
});

import { POST } from "./route";

const actor = { tenantId: "tenant-1", outletId: "outlet-1", userId: "owner-1" };
const body = { candidateKey: "profitLossManualVoid", reason: "Menghapus data VOID terverifikasi", confirmation: "RESET", previewToken: "preview-token-minimum-length" };
const request = (value: unknown = body) => new Request("http://localhost/api/settings/maintenance/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

describe("POST /api/settings/maintenance/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSettingsApi.mockResolvedValue({ session: { roles: ["OWNER"] }, scope: actor });
    mocks.resetMaintenanceCandidate.mockResolvedValue({ candidateKey: body.candidateKey, deletedCount: 1, idempotent: false });
  });

  it("rejects roles that fail the common Owner/Admin Settings guard", async () => {
    mocks.requireSettingsApi.mockResolvedValue({ response: Response.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 }) });
    const response = (await POST(request()))!;
    expect(response.status).toBe(403);
    expect(mocks.resetMaintenanceCandidate).not.toHaveBeenCalled();
  });

  it("requires a reason and exact RESET confirmation", async () => {
    const response = (await POST(request({ ...body, reason: "x", confirmation: "reset" })))!;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.resetMaintenanceCandidate).not.toHaveBeenCalled();
  });

  it("uses only the tenant, outlet and actor scope from the authenticated session", async () => {
    const response = (await POST(request({ ...body, tenantId: "tenant-other", outletId: "outlet-other" })))!;
    expect(response.status).toBe(200);
    expect(mocks.resetMaintenanceCandidate).toHaveBeenCalledWith(actor, body);
  });
});
