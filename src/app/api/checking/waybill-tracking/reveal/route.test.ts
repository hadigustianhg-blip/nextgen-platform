import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessResource: vi.fn(),
  canViewProblemWaybillSensitive: vi.fn(),
  checkProblemWaybillSensitiveRateLimit: vi.fn(),
  revealTrackingReceiverPhone: vi.fn(),
  SensitiveDetailError: class SensitiveDetailError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ canAccessResource: mocks.canAccessResource }));
vi.mock("@/modules/delivery-settlement", () => ({
  deliveryScope: (session: { tenantId: string; outletId: string | null }) => session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId }
    : null,
}));
vi.mock("@/modules/quality-control", () => ({
  canViewProblemWaybillSensitive: mocks.canViewProblemWaybillSensitive,
  checkProblemWaybillSensitiveRateLimit: mocks.checkProblemWaybillSensitiveRateLimit,
  revealTrackingReceiverPhone: mocks.revealTrackingReceiverPhone,
  SensitiveDetailError: mocks.SensitiveDetailError,
}));

import { SensitiveDetailError } from "@/modules/quality-control";
import { POST } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/checking/waybill-tracking/reveal", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/checking/waybill-tracking/reveal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      tenantId: "tenant-a", outletId: "outlet-a", userId: "user-a", roles: ["ADMIN"],
    });
    mocks.canAccessResource.mockReturnValue(true);
    mocks.canViewProblemWaybillSensitive.mockReturnValue(true);
    mocks.checkProblemWaybillSensitiveRateLimit.mockReturnValue(true);
    mocks.revealTrackingReceiverPhone.mockResolvedValue({ waybillNo: "JT123", receiverPhone: "081234567890" });
  });

  it("returns only the clear receiver phone using authenticated tenant/outlet scope", async () => {
    const response = await POST(request({ waybillNo: "  JT123  " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { waybillNo: "JT123", receiverPhone: "081234567890" } });
    expect(mocks.revealTrackingReceiverPhone).toHaveBeenCalledWith({
      tenantId: "tenant-a", outletId: "outlet-a", actorId: "user-a", waybill: "JT123",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects anonymous, missing-outlet, and insufficient-permission requests", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(401);

    mocks.canAccessResource.mockReturnValueOnce(false);
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(403);

    mocks.canViewProblemWaybillSensitive.mockReturnValueOnce(false);
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(403);

    mocks.getSession.mockResolvedValueOnce({ tenantId: "tenant-a", outletId: null, userId: "user-a", roles: ["ADMIN"] });
    expect((await POST(request({ waybillNo: "JT123" }))).status).toBe(400);
    expect(mocks.revealTrackingReceiverPhone).not.toHaveBeenCalled();
  });

  it("accepts only a strict waybill identifier and never browser-supplied scope", async () => {
    for (const body of [
      {}, { waybillNo: "" }, { waybillNo: "JT 123" },
      { waybillNo: "JT123", tenantId: "attacker" },
      { waybillNo: "JT123", outletId: "other" },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(mocks.revealTrackingReceiverPhone).not.toHaveBeenCalled();
  });

  it("rate-limits before invoking sensitive service", async () => {
    mocks.checkProblemWaybillSensitiveRateLimit.mockReturnValue(false);
    const response = await POST(request({ waybillNo: "JT123" }));
    expect(response.status).toBe(429);
    expect(mocks.checkProblemWaybillSensitiveRateLimit).toHaveBeenCalledWith("tenant-a:user-a");
    expect(mocks.revealTrackingReceiverPhone).not.toHaveBeenCalled();
  });

  it("returns clean not-found and upstream-error contracts without sensitive leakage", async () => {
    mocks.revealTrackingReceiverPhone.mockRejectedValueOnce(new SensitiveDetailError("NOT_FOUND"));
    const missing = await POST(request({ waybillNo: "JT404" }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "PHONE_NOT_FOUND", message: "Nomor penerima tidak tersedia." } });

    mocks.revealTrackingReceiverPhone.mockRejectedValueOnce(new Error("AuthToken=secret phone=081234567890"));
    const failed = await POST(request({ waybillNo: "JT500" }));
    expect(failed.status).toBe(502);
    const serialized = JSON.stringify(await failed.json());
    expect(serialized).toContain("Nomor penerima belum dapat ditampilkan.");
    expect(serialized).not.toMatch(/AuthToken|081234567890/);
  });
});
