import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), canAccessResource: vi.fn(), getRealtimeWaybillTracking: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ canAccessResource: mocks.canAccessResource }));
vi.mock("@/modules/checking", async () => {
  const actual = await vi.importActual<typeof import("@/modules/checking")>("@/modules/checking");
  return { ...actual, getRealtimeWaybillTracking: mocks.getRealtimeWaybillTracking };
});

import { WaybillTrackingServiceError } from "@/modules/checking";
import { POST } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/checking/waybill-tracking", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/checking/waybill-tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ tenantId: "tenant-a", outletId: "outlet-a", roles: ["ADMIN"] });
    mocks.canAccessResource.mockReturnValue(true);
    mocks.getRealtimeWaybillTracking.mockResolvedValue({ waybillNo: "JT123", latest: {}, timeline: [] });
  });

  it("uses only authenticated tenant/outlet scope and returns tracking", async () => {
    const response = await POST(request({ waybillNo: "  JT123  ", tenantId: "attacker", outletId: "other" }));
    expect(response.status).toBe(400);
    const success = await POST(request({ waybillNo: "  JT123  " }));
    expect(success.status).toBe(200);
    expect(mocks.getRealtimeWaybillTracking).toHaveBeenCalledWith({ tenantId: "tenant-a", outletId: "outlet-a" }, "JT123");
    expect(success.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 401 for anonymous and 400 without an active outlet", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ tenantId: "tenant-a", outletId: null, roles: ["ADMIN"] });
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(400);
    expect(mocks.getRealtimeWaybillTracking).not.toHaveBeenCalled();
  });

  it("returns 403 when dedicated read permission is absent", async () => {
    mocks.canAccessResource.mockReturnValue(false);
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(403);
    expect(mocks.canAccessResource).toHaveBeenCalledWith(["ADMIN"], "WAYBILL_TRACKING", "READ");
  });

  it.each([{}, { waybillNo: "" }, { waybillNo: "JT 123" }, { waybillNo: "!secret" }])("rejects invalid input %#", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.getRealtimeWaybillTracking).not.toHaveBeenCalled();
  });

  it("returns a clean not-found contract", async () => {
    mocks.getRealtimeWaybillTracking.mockRejectedValue(new WaybillTrackingServiceError("WAYBILL_TRACKING_NOT_FOUND", 404));
    const response = await POST(request({ waybillNo: "JT404" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "WAYBILL_TRACKING_NOT_FOUND", message: "Resi tidak ditemukan." } });
  });

  it("does not leak upstream failures", async () => {
    mocks.getRealtimeWaybillTracking.mockRejectedValue(new Error("AuthToken=secret phone=08123456789"));
    const response = await POST(request({ waybillNo: "JT500" }));
    expect(response.status).toBe(502);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Tracking belum dapat diperiksa.");
    expect(text).not.toContain("AuthToken");
    expect(text).not.toContain("08123456789");
  });
});
