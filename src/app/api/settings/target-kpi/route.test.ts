import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSettingsApi: vi.fn(),
  getEffectiveOperationalTargets: vi.fn(),
  updateOperationalTargets: vi.fn(),
  settingsApiError: vi.fn(),
}));

vi.mock("@/modules/settings", async () => {
  const { z } = await import("zod");
  const finite = z.number().finite();
  return {
    requireSettingsApi: mocks.requireSettingsApi,
    getEffectiveOperationalTargets: mocks.getEffectiveOperationalTargets,
    updateOperationalTargets: mocks.updateOperationalTargets,
    settingsApiError: mocks.settingsApiError,
    targetKpiUpdateSchema: z.object({
      achievementDeliveryTarget: finite.min(0).max(100).nullable(),
      pendingMaximum: finite.int().min(0).nullable(),
      slaTarget: finite.min(0).max(100).nullable(),
      pickupRevenueTarget: finite.min(0).nullable(),
      pickupWeightTarget: finite.min(0).nullable(),
      waybillStuckMaximum: finite.int().min(0).nullable(),
    }).strict(),
  };
});

import { GET, PUT } from "./route";

const scope = { tenantId: "tenant-1", outletId: "outlet-1", userId: "user-1" };
const data = {
  achievementDeliveryTarget: { value: 95, source: "CANONICAL" },
  pendingMaximum: { value: null, source: "UNSET" },
  slaTarget: { value: 95, source: "CANONICAL" },
  pickupRevenueTarget: { value: null, source: "UNSET" },
  pickupWeightTarget: { value: null, source: "UNSET" },
  waybillStuckMaximum: { value: null, source: "UNSET" },
};
const body = {
  achievementDeliveryTarget: null,
  pendingMaximum: null,
  slaTarget: null,
  pickupRevenueTarget: null,
  pickupWeightTarget: null,
  waybillStuckMaximum: null,
};
const request = (value: unknown = body) => new Request("http://localhost/api/settings/target-kpi", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
});

describe("GET/PUT /api/settings/target-kpi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSettingsApi.mockResolvedValue({ session: { roles: ["OWNER"] }, scope });
    mocks.getEffectiveOperationalTargets.mockResolvedValue(data);
    mocks.updateOperationalTargets.mockResolvedValue(data);
  });

  it.each(["OWNER", "ADMIN"])("allows %s through the shared settings guard", async (role) => {
    mocks.requireSettingsApi.mockResolvedValue({ session: { roles: [role] }, scope });
    expect((await GET())!.status).toBe(200);
    expect((await PUT(request()))!.status).toBe(200);
    expect(mocks.updateOperationalTargets).toHaveBeenCalledWith(scope, body);
  });

  it("returns the TEAM guard response without reading or writing settings", async () => {
    mocks.requireSettingsApi.mockResolvedValue({ response: Response.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 }) });
    expect((await GET())!.status).toBe(403);
    expect((await PUT(request()))!.status).toBe(403);
    expect(mocks.getEffectiveOperationalTargets).not.toHaveBeenCalled();
    expect(mocks.updateOperationalTargets).not.toHaveBeenCalled();
  });

  it("rejects browser-provided tenant/outlet scope and invalid numeric values", async () => {
    for (const invalid of [
      { ...body, tenantId: "tenant-other" },
      { ...body, outletId: "outlet-other" },
      { ...body, achievementDeliveryTarget: 101 },
      { ...body, pendingMaximum: 1.5 },
      { ...body, pickupRevenueTarget: -1 },
    ]) {
      const response = await PUT(request(invalid));
      expect(response!.status).toBe(400);
      expect(await response!.json()).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(mocks.updateOperationalTargets).not.toHaveBeenCalled();
  });
});
