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

  it("does not leak upstream failures and emits exactly one safe diagnostic log", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getRealtimeWaybillTracking.mockRejectedValue(
      new Error("Upstream middleware request failed with status 502: AuthToken=secret password=123 phone=08123456789 address=Jakarta X-Auth-Key=secretkey"),
    );
    const response = await POST(request({ waybillNo: "JT500" }));
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body).toEqual({
      error: { code: "TRACKING_UNAVAILABLE", message: "Tracking belum dapat diperiksa." },
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const [msg, metadata] = consoleSpy.mock.calls[0];
    expect(msg).toBe("[NEXTGEN][WAYBILL_TRACKING] request failed");
    expect(metadata).toEqual({
      source: "WAYBILL_TRACKING_API",
      errorType: "Error",
      serviceCode: "UNKNOWN",
      status: 502,
      stage: "UPSTREAM_MIDDLEWARE_HTTP_ERROR",
      upstreamStatus: 502,
    });

    const serializedLog = JSON.stringify(metadata);
    expect(serializedLog).not.toContain("AuthToken");
    expect(serializedLog).not.toContain("password");
    expect(serializedLog).not.toContain("08123456789");
    expect(serializedLog).not.toContain("Jakarta");
    expect(serializedLog).not.toContain("X-Auth-Key");
    expect(serializedLog).not.toContain("secretkey");

    consoleSpy.mockRestore();
  });

  it("does not emit diagnostic error log on successful tracking", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request({ waybillNo: "JT123" }));
    expect(response.status).toBe(200);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
